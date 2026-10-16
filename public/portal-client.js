(function () {
  'use strict';
  const config = window.MentorPortalConfig || {};
  const base = String(config.supabaseUrl || '').replace(/\/+$/, '');
  const key = String(config.publishableKey || '');
  const sessionKey = String(config.sessionKey || 'seedcoop.uridongne-mentor-guide.portal.session.v1');
  const endpoint = base + '/functions/v1/' + encodeURIComponent(config.functionName || 'mentor-portal');
  const studentEndpoint = base + '/functions/v1/student-portal';
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base) &&
    (/^sb_publishable_[a-z0-9_-]+$/i.test(key) || /^eyJ[a-z0-9_.-]+$/i.test(key));
  const maxSessionMs = Math.min(12, Number(config.maxSessionHours) || 12) * 60 * 60 * 1000;
  let session = null;
  let refreshPromise = null;
  let generation = 0;

  function portalError(message, status, code, record) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    if (record) error.record = record;
    return error;
  }
  function clearSession() {
    generation++;
    session = null;
    try { sessionStorage.removeItem(sessionKey); } catch (_) {}
  }
  function saveSession(value, fresh) {
    if (!value || typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string') {
      throw portalError('로그인 응답을 확인하지 못했습니다. 다시 로그인해 주세요.', 502, 'INVALID_SESSION');
    }
    const now = Date.now();
    const startedAt = fresh || !session ? now : session.started_at;
    const expiresAt = Number(value.expires_at) || Math.floor(now / 1000) + Number(value.expires_in || 3600);
    session = {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      expires_at: expiresAt,
      started_at: startedAt
    };
    try { sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch (_) {}
  }
  try {
    const stored = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    if (stored && typeof stored.access_token === 'string' && typeof stored.refresh_token === 'string' &&
        Number.isFinite(stored.started_at) && stored.started_at > 0 && stored.started_at <= Date.now()) {
      session = stored;
    } else if (stored) clearSession();
  } catch (_) { clearSession(); }

  function assertReady() {
    if (!configured) throw portalError('로그인 연결을 준비하고 있습니다. 주차별 세부내용과 도구는 로그인 연결 후 이용할 수 있어요.', 503, 'CONNECTION_NOT_READY');
  }
  function assertLifetime() {
    if (session && Date.now() - session.started_at >= maxSessionMs) {
      clearSession();
      throw portalError('로그인이 만료되었습니다. 다시 로그인해 주세요.', 401, 'SESSION_EXPIRED');
    }
  }
  async function parseError(response) {
    let data;
    try { data = await response.json(); } catch (_) {}
    return portalError(data?.error?.message || data?.msg || data?.error_description ||
      '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      response.status, data?.error?.code || data?.code || 'REQUEST_FAILED', data?.record);
  }
  async function refreshSession() {
    assertReady();
    assertLifetime();
    if (!session) return null;
    if (!refreshPromise) {
      const current = generation;
      const refreshToken = session.refresh_token;
      const task = (async () => {
        const response = await fetch(base + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', credentials: 'omit', cache: 'no-store',
          headers: { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!response.ok) {
          const error = await parseError(response);
          if ([400, 401, 403].includes(response.status) && current === generation) clearSession();
          if ([400, 401, 403].includes(response.status)) {
            error.status = 401;
            error.message = '로그인이 만료되었습니다. 다시 로그인해 주세요.';
          }
          throw error;
        }
        const result = await response.json();
        if (current !== generation) throw portalError('로그인 상태가 변경되었습니다. 다시 로그인해 주세요.', 401, 'SESSION_CHANGED');
        saveSession(result, false);
        return session.access_token;
      })();
      refreshPromise = task;
      task.finally(() => { if (refreshPromise === task) refreshPromise = null; }).catch(() => {});
    }
    return refreshPromise;
  }
  async function accessToken() {
    assertLifetime();
    if (!session) return null;
    if (!Number.isFinite(Number(session.expires_at)) || Number(session.expires_at) * 1000 <= Date.now() + 60000) {
      return refreshSession();
    }
    return session.access_token;
  }
  async function send(target, action, options, token) {
    const headers = { apikey: key, 'Content-Type': 'application/json', Accept: action === 'export' ? 'text/csv, application/json' : 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(target, {
      method: 'POST', credentials: 'omit', cache: 'no-store', headers,
      body: JSON.stringify({ ...(options.query || {}), ...(options.body || {}), action }),
      signal: options.signal
    });
  }
  async function requestAt(target, action, options, studentAdmin) {
    options = options || {};
    assertReady();
    const anonymous = !studentAdmin && action === 'login';
    try {
      const token = anonymous ? null : await accessToken();
      let response = await send(target, action, options, token);
      // A token can expire between the local check and the server request.
      // Retry once after refresh; server-side session/role checks still apply.
      if (response.status === 401 && !anonymous && action !== 'logout' && session) {
        const refreshed = await refreshSession();
        response = await send(target, action, options, refreshed);
      }
      if (!response.ok) {
        const error = await parseError(response);
        if (response.status === 401 && !anonymous) clearSession();
        throw error;
      }
      if (!studentAdmin && action === 'export') return response.blob();
      let result;
      try { result = await response.json(); }
      catch (_) { throw portalError('서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.', 502, 'INVALID_RESPONSE'); }
      if (result.ok === false) {
        const error = portalError(result.error?.message || '요청을 완료하지 못했습니다.', 400, result.error?.code, result.record);
        throw error;
      }
      if (!studentAdmin && result.session) {
        generation++;
        saveSession(result.session, action === 'login');
      }
      return result;
    } finally {
      if (!studentAdmin && action === 'logout') clearSession();
    }
  }
  function request(action, options) { return requestAt(endpoint, action, options, false); }
  function requestStudentAdmin(action, options) {
    if (!['admin-list','admin-detail','admin-codes','admin-code-set'].includes(action)) {
      throw portalError('지원하지 않는 학생 관리 요청입니다.', 400, 'UNKNOWN_ACTION');
    }
    return requestAt(studentEndpoint, action, options, true);
  }
  window.MentorPortalClient = Object.freeze({
    request,
    requestStudentAdmin,
    isConfigured: () => configured,
    hasSession: () => { try { assertLifetime(); return Boolean(session); } catch (_) { return false; } },
    clearSession
  });
})();
