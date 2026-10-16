(() => {
  'use strict';
  const SESSION_KEY = 'uridongne.student.session.v1';
  const PREFIX = 'uridongne.student.draft.';
  const WEEK_TITLES = ['아이디어 한 장 기획서','무드보드와 게임 타이틀 만들기','이미지 애셋과 핵심 규칙 제작 요청','화면 한 부분 수정 요청','테스트 기록과 수정 요청','작품 소개와 3분 시연'];
  const main = document.getElementById('main');
  const requestedWeek = new URLSearchParams(location.search).get('week') || '';
  const linkedWeek = /^[1-6]$/.test(requestedWeek) ? Number(requestedWeek) : null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid = () => crypto.randomUUID();
  let session = null, draft = {}, busy = false, expiryTimer, scriptsPromise, routeVersion = 0, selectedWeek = linkedWeek || 1;

  function storageRead(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
  function storageWrite(key, value) { try { sessionStorage.setItem(key, value); return true; } catch { return false; } }
  function storageRemove(key) { try { sessionStorage.removeItem(key); } catch {} }
  function draftKey(suffix) { return PREFIX + session?.draftId + '.' + suffix; }
  function validSession(value) {
    return value && Number.isInteger(value.week) && value.week >= 1 && value.week <= 6 &&
      typeof value.token === 'string' && value.token.length > 0 && value.token.length < 5000 &&
      typeof value.draftId === 'string' && /^[0-9a-f-]{36}$/i.test(value.draftId) &&
      Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > Date.now();
  }
  function allowed(week) { return validSession(session) && Number(week) === session.week; }
  function persistDraft() { if (session) storageWrite(draftKey('meta'), JSON.stringify(draft)); }
  function forgetSession() {
    clearTimeout(expiryTimer);
    if (session) for (const suffix of ['meta','tools','moodboard']) storageRemove(draftKey(suffix));
    storageRemove(SESSION_KEY);
    session = null; draft = {};
    window.WorkshopTools?.clearStudentState?.();
    window.VisualMoodboard?.clearStudentState?.();
  }
  function message(text, id = 'studentMessage') {
    const target = document.getElementById(id);
    if (!target) return;
    target.textContent = text; target.hidden = !text;
    if (text) target.focus();
  }
  function enterGate(reason = '') {
    routeVersion++;
    main.innerHTML = `<section class="student-gate"><div class="student-intro"><p class="eyebrow">우리동네 플레이어 · 6주 활동</p><h1>우리 생각을<br>작품으로 만드는 시간.</h1><p>이번 주 웹 도구에서 생각을 정리하고,<br>팀명과 이름을 적어 응답을 제출해요.</p><div class="student-flow">주차 선택 <span>→</span> 입장코드 <span>→</span> 활동 · 제출</div></div><form class="student-gate-card" id="studentGate"><h2>이번 주 활동에 입장하기</h2><p>선생님이 알려 준 주차와 입장코드를 사용해요.</p><label for="studentWeek">활동 주차<select id="studentWeek" name="week" required>${WEEK_TITLES.map((title, index) => `<option value="${index + 1}" ${selectedWeek===index+1?'selected':''}>${index + 1}주차 · ${title}</option>`).join('')}</select></label><label for="studentCode">입장코드<input id="studentCode" name="code" type="password" required maxlength="64" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="이번 주 입장코드"></label><p class="student-hint">입장코드는 주차마다 달라요. 한글 키워드를 그대로 입력해 주세요.</p><div id="studentMessage" class="student-message" role="alert" tabindex="-1" hidden></div><button class="button" type="submit">활동 시작하기 →</button><p class="student-note">학생 계정이나 로그인이 필요하지 않아요.<br>입장 후에는 선택한 주차의 웹 도구를 사용할 수 있어요.</p></form></section>`;
    if (reason) message(reason);
  }
  function expire(reason = '입장 시간이 지났어요. 이번 주 입장코드를 다시 입력해 주세요.') {
    if (session && Number.isInteger(session.week) && session.week>=1 && session.week<=6) selectedWeek=session.week;
    forgetSession(); enterGate(reason);
  }
  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => expire(), Math.max(1, Date.parse(session.expiresAt) - Date.now()));
  }
  function requestError(code, text, status) { const error = new Error(text); error.code = code; error.status = status; return error; }
  async function api(payload, token) {
    const config = window.MentorPortalConfig;
    if (!config?.supabaseUrl || !config.publishableKey) throw requestError('NOT_CONFIGURED', '활동실 연결 설정을 확인해야 해요. 선생님께 알려 주세요.');
    const endpoint = config.supabaseUrl.replace(/\/$/, '') + '/functions/v1/student-portal';
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const headers = {'Content-Type':'application/json', apikey:config.publishableKey};
      if (token) headers.Authorization = 'Bearer ' + token;
      const response = await fetch(endpoint, {method:'POST', headers, body:JSON.stringify(payload), credentials:'omit', signal:controller.signal});
      let data; try { data = await response.json(); } catch { throw requestError('INVALID_RESPONSE', '서버의 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
      if (!response.ok || data?.ok !== true) throw requestError(data?.error?.code || 'REQUEST_FAILED', data?.error?.message || '처리하지 못했어요. 잠시 후 다시 시도해 주세요.', response.status);
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw requestError('NETWORK_ERROR', '연결이 오래 걸려 완료 여부를 확인하지 못했어요. 같은 내용으로 다시 제출해도 중복 저장되지 않아요.');
      if (error instanceof TypeError) throw requestError('NETWORK_ERROR', '인터넷 연결을 확인하고 다시 시도해 주세요. 같은 내용으로 다시 제출해도 중복 저장되지 않아요.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function script(source) {
    return new Promise((resolve, reject) => { const node = document.createElement('script'); node.src = source + '?v=20261016-safety1'; node.onload = resolve; node.onerror = () => { node.remove(); reject(Error('웹 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 입장해 주세요.')); }; document.head.append(node); });
  }
  async function loadTools() {
    if (!scriptsPromise) scriptsPromise = (async () => { if (!globalThis.WorkshopPromptSafety) await script('./prompt-safety.js'); if (!window.WorkshopPDF) await script('./assets/studio-pdf.js'); if (!window.WorkshopTools) await script('./studio.js'); if (!window.VisualMoodboard) await script('./moodboard.js'); })().catch(error => { scriptsPromise = null; throw error; });
    await scriptsPromise;
  }
  function lockTool() {
    const tool = document.getElementById('studentTool');
    if (tool) tool.inert = Boolean(draft.receipt) || busy;
  }
  function submitPanel() {
    if (draft.receipt) {
      const receipt = draft.receipt;
      const when = new Date(receipt.submittedAt).toLocaleString('ko-KR', {timeZone:'Asia/Seoul', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false});
      return `<div class="student-receipt" role="status"><h3>✓ 응답을 제출했어요</h3><p>${esc(draft.team)} · ${esc(draft.name)} / ${session.week}주차</p><p>${esc(when)} 제출 완료</p><p class="student-receipt-id">접수 번호 ${esc(receipt.id)}</p><div class="actions"><button class="button secondary small" type="button" data-student-action="revise">수정해서 새 응답 제출</button><button class="button secondary small" type="button" data-student-action="leave">작성 마치기</button></div><p class="student-edit-lock">접수한 응답은 저장되었어요. 내용을 바꾸려면 ‘수정해서 새 응답 제출’을 눌러 주세요.</p></div>`;
    }
    return `<div class="student-submit-title"><div><p class="eyebrow">마지막으로 · 응답 제출</p><h2 id="studentSubmitTitle">누구의 응답인가요?</h2><p>질문 작성을 마쳤다면 팀명과 이름을 적고 제출해요.</p></div><span class="student-week-badge">${session.week}주차</span></div><form id="studentSubmitForm"><div class="student-identity"><label for="studentTeam">팀명<input id="studentTeam" name="team" maxlength="80" required autocomplete="off" value="${esc(draft.team || '')}" placeholder="함께 활동하는 팀 이름"></label><label for="studentName">이름<input id="studentName" name="name" maxlength="80" required autocomplete="off" value="${esc(draft.name || '')}" placeholder="내 이름"></label></div><div id="studentSubmitMessage" class="student-message" role="alert" tabindex="-1" hidden></div><div class="student-submit-actions"><button class="button" type="submit">이번 주 응답 제출하기 →</button><p>팀명·이름과 작성한 답변이 프로그램 운영자에게 전달돼요.<br>위에서 복사하거나 파일을 저장한 뒤에도 제출 버튼을 눌러야 응답이 접수돼요.</p></div>${session.week===2?'<p class="student-draft-note">무드보드와 선택한 타이틀 이미지는 파일로 따로 보관해 주세요. 다음 3주차에는 무드보드 PNG를 첨부해 이미지 애셋을 만들어요. 여기에서는 주차 도구의 답변과 정리 결과를 제출해요.</p>':''}<p class="student-draft-note">작성 중인 내용은 이 탭에만 임시 보관돼요. 탭을 닫으면 지워져요.</p></form>`;
  }
  function renderSubmit() {
    const panel = document.getElementById('studentSubmit');
    if (panel) panel.innerHTML = submitPanel();
    lockTool();
  }
  function safeRoute() { return session?.week === 2 && /^#moodboard(?:\/2)?$/.test(location.hash) ? 'moodboard' : 'studio'; }
  function renderTool() {
    if (!session || !allowed(session.week)) return expire();
    const target = document.getElementById('studentTool');
    if (!target) return;
    if (safeRoute() === 'moodboard') {
      target.innerHTML = window.VisualMoodboard.render();
    } else {
      target.innerHTML = window.WorkshopTools.render(session.week);
    }
    lockTool();
  }
  function renderWorkspace() {
    if (!session || !allowed(session.week)) return expire();
    main.innerHTML = `<div class="student-session-bar"><div><span class="student-week-badge">WEEK ${String(session.week).padStart(2, '0')}</span><span class="student-session-label">${esc(WEEK_TITLES[session.week - 1])}</span></div></div><div id="studentTool" class="student-tool-root"></div><section id="studentSubmit" class="student-submit" aria-label="응답 제출"></section>`;
    renderTool(); renderSubmit(); scheduleExpiry();
  }
  window.WorkshopAudience = Object.freeze({
    kind:'student', canUseWeek:allowed,
    storageKey:kind => draftKey(kind),
    getStorage:() => sessionStorage,
    onChange:() => { if (session && !draft.receipt) persistDraft(); },
    afterRender:lockTool
  });

  document.addEventListener('submit', async event => {
    if (event.target.id === 'studentGate') {
      event.preventDefault(); if (busy) return;
      const form = event.target, week = Number(form.elements.week.value), code = form.elements.code.value.trim();
      if (!Number.isInteger(week) || week < 1 || week > 6 || !code) return message('주차를 고르고 입장코드를 입력해 주세요.');
      selectedWeek = week;
      busy = true; const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = '입장코드 확인 중…'; message('');
      try {
        const data = await api({action:'enter', week, code});
        form.elements.code.value = '';
        const candidate = {...data.session, draftId:uuid()};
        if (!validSession(candidate) || candidate.week !== week) throw Error('입장 정보를 확인하지 못했어요. 다시 시도해 주세요.');
        forgetSession(); session = candidate; draft = {};
        storageWrite(SESSION_KEY, JSON.stringify(session));
        const entryUrl = new URL(location.href); entryUrl.searchParams.set('week', String(week));
        history.replaceState(null, '', entryUrl.pathname + entryUrl.search + entryUrl.hash);
        await loadTools();
        if (!allowed(week)) return expire();
        busy = false;
        renderWorkspace();
        main.focus();
      } catch (error) {
        if (session) { forgetSession(); enterGate(error.message); }
        else { if (form.isConnected) form.elements.code.value = ''; message(error.message); }
      } finally { busy = false; if (button.isConnected) { button.disabled = false; button.textContent = '활동 시작하기 →'; } }
    }
    if (event.target.id === 'studentSubmitForm') {
      event.preventDefault(); if (busy || draft.receipt) return;
      if (!session || !allowed(session.week)) return expire();
      const team = document.getElementById('studentTeam').value.trim(), name = document.getElementById('studentName').value.trim();
      if (!team || !name) return message('팀명과 이름을 모두 입력해 주세요.', 'studentSubmitMessage');
      const missing = window.WorkshopTools.getMissing(session.week);
      if (missing.length) {
        if (safeRoute() !== 'studio') { history.replaceState(null, '', location.pathname + location.search + '#tool'); renderTool(); }
        const target = document.getElementById('studio-' + missing[0].key);
        target?.focus(); target?.scrollIntoView({behavior:'smooth', block:'center'});
        message(`핵심 질문 ${missing.length}개를 더 적어 주세요. 첫 번째: ${missing[0].label}`, 'studentSubmitMessage');
        target?.focus(); return;
      }
      const snapshot = {week:session.week, team, name, answers:window.WorkshopTools.getAnswers(session.week), output:window.WorkshopTools.getOutput(session.week)};
      const fingerprint = JSON.stringify(snapshot);
      if (draft.pending && draft.pending.fingerprint !== fingerprint && !window.confirm('이전 제출의 완료 여부를 아직 확인하지 못했어요. 바뀐 내용을 별도의 새 응답으로 제출할까요?')) return;
      const submissionId = draft.pending?.fingerprint === fingerprint ? draft.pending.submissionId : uuid();
      draft.team = team; draft.name = name; draft.pending = {submissionId, fingerprint}; persistDraft();
      busy = true; lockTool();
      const form = event.target, button = form.querySelector('button[type="submit"]');
      for (const input of form.querySelectorAll('input,button')) input.disabled = true;
      button.textContent = '응답 제출 중…'; message('', 'studentSubmitMessage');
      const activeSession = session;
      try {
        const data = await api({action:'submit', ...snapshot, submissionId}, activeSession.token);
        if (session !== activeSession) return;
        if (!data.receipt?.id || data.receipt.week !== activeSession.week || !Number.isFinite(Date.parse(data.receipt.submittedAt))) throw Error('접수 확인을 읽지 못했어요. 같은 내용으로 다시 제출해 주세요.');
        draft.receipt = data.receipt; delete draft.pending; persistDraft();
        busy = false; renderSubmit(); document.querySelector('.student-receipt')?.scrollIntoView({behavior:'smooth', block:'center'});
      } catch (error) {
        if (session !== activeSession) return;
        if (['SESSION_EXPIRED','WEEK_MISMATCH','WEEK_CLOSED'].includes(error.code)) return expire(error.message);
        message(error.message, 'studentSubmitMessage');
      } finally {
        busy = false; lockTool();
        if (form.isConnected) { for (const input of form.querySelectorAll('input,button')) input.disabled = false; button.textContent = '이번 주 응답 제출하기 →'; }
      }
    }
  });
  document.addEventListener('input', event => {
    if (!session || draft.receipt || !['studentTeam','studentName'].includes(event.target.id)) return;
    draft[event.target.id === 'studentTeam' ? 'team' : 'name'] = event.target.value.slice(0,80); persistDraft();
  });
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-student-action]')?.dataset.studentAction;
    if (!action || busy) return;
    if (action === 'leave') {
      if (!draft.receipt && !window.confirm('활동실에서 나갈까요? 이 탭의 작성 내용이 지워져요. 제출한 응답은 보관돼요.')) return;
      forgetSession(); history.replaceState(null, '', location.pathname + location.search); enterGate(); main.focus();
    }
    if (action === 'revise' && session && draft.receipt) {
      delete draft.receipt; delete draft.pending; persistDraft(); renderSubmit();
      document.getElementById('studentTool')?.scrollIntoView({behavior:'smooth', block:'start'});
      const toast = document.getElementById('toast'); if (toast) { toast.textContent = '응답을 수정할 수 있어요. 다음 제출은 새 접수 번호로 저장돼요.'; toast.hidden = false; setTimeout(() => { toast.hidden = true; },5000); }
    }
  });
  window.addEventListener('hashchange', () => { if (session) renderTool(); });
  document.addEventListener('visibilitychange', () => { if (session && !validSession(session)) expire(); });
  (async () => {
    let saved; try { saved = JSON.parse(storageRead(SESSION_KEY) || 'null'); } catch {}
    if (!validSession(saved)) { session = saved; forgetSession(); enterGate(); return; }
    if (linkedWeek && linkedWeek !== saved.week) { session = saved; forgetSession(); enterGate(); return; }
    session = saved; selectedWeek = saved.week;
    try { draft = JSON.parse(storageRead(draftKey('meta')) || '{}') || {}; } catch { draft = {}; }
    const version = ++routeVersion;
    try { await loadTools(); if (routeVersion !== version) return; if (!allowed(session.week)) return expire(); renderWorkspace(); }
    catch (error) { forgetSession(); enterGate(error.message); }
  })();
})();
