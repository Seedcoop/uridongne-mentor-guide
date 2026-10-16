import { createClient } from 'npm:@supabase/supabase-js@2';

// Self-contained for deployment in the Supabase Dashboard editor.
const FORM_SCHEMA = {
  "version": 1,
  "weeks": [
    "1회차(11/6)",
    "2회차(11/13)",
    "3회차(11/20)",
    "4회차(11/27)",
    "5회차(12/4)",
    "6회차(12/11)"
  ],
  "source": {
    "log": "https://docs.google.com/forms/d/e/1FAIpQLSfiBABEI1kRyMxHjeYKCSNd4gxSNj98omZW73n1MRcc_EypBQ/viewform",
    "plan": "웹가이드의 주차별 운영안"
  },
  "forms": {
    "plan": {
      "title": "활동계획",
      "description": "이번 주 목표와 진행 방법을 준비합니다.",
      "fields": [
        {
          "key": "name",
          "label": "이름",
          "type": "text",
          "required": true,
          "max": 100
        },
        {
          "key": "team",
          "label": "담당 팀",
          "type": "text",
          "required": true,
          "max": 100
        },
        {
          "key": "session",
          "label": "회차",
          "type": "session",
          "required": true
        },
        {
          "key": "goal",
          "label": "활동 목표",
          "type": "textarea",
          "required": true,
          "max": 6000,
          "help": "청소년이 이번 활동에서 경험하고 결정할 것을 적어 주세요."
        },
        {
          "key": "flow",
          "label": "활동 흐름과 시간 배분",
          "type": "textarea",
          "required": true,
          "max": 12000,
          "help": "활동명·소요 분·진행 방법을 적어 주세요. 휴식 포함 120분입니다."
        },
        {
          "key": "question",
          "label": "멘토 질문과 참여 방법",
          "type": "textarea",
          "required": true,
          "max": 6000,
          "help": "청소년의 생각을 듣는 질문과 고르게 참여할 방법을 적어 주세요."
        },
        {
          "key": "materials",
          "label": "준비 재료와 도구",
          "type": "textarea",
          "required": true,
          "max": 6000,
          "help": "멘토 게임·기기·빈 종이·웹도구 등 실제로 준비할 것을 적어 주세요."
        },
        {
          "key": "completion",
          "label": "완료 기준과 다음 주 연결",
          "type": "textarea",
          "required": true,
          "max": 6000,
          "help": "활동 끝에 확인할 것과 남길 파일·다음 주 이어갈 것을 적어 주세요."
        }
      ]
    },
    "log": {
      "title": "멘토 교육일지",
      "description": "활동 종료 후 실제 진행과 청소년의 선택을 기록합니다.",
      "fields": [
        {
          "key": "name",
          "label": "이름",
          "type": "text",
          "required": true,
          "max": 100
        },
        {
          "key": "team",
          "label": "담당 팀",
          "type": "text",
          "required": true,
          "max": 100
        },
        {
          "key": "session",
          "label": "회차",
          "type": "session",
          "required": true
        },
        {
          "key": "content",
          "label": "진행한 교육 내용",
          "type": "textarea",
          "required": true,
          "max": 12000,
          "help": "주요 활동과 실제 진행 내용을 작성해 주세요. 계획과 달라진 내용이 있다면 함께 적어 주세요."
        },
        {
          "key": "observations",
          "label": "청소년 관찰 내용",
          "type": "textarea",
          "required": true,
          "max": 12000,
          "help": "청소년의 참여도, 이해도, 협력 과정, 어려워한 부분 등을 구체적인 사례와 함께 작성해 주세요."
        },
        {
          "key": "outputs",
          "label": "산출물",
          "type": "textarea",
          "required": true,
          "max": 12000,
          "help": "청소년이 만든 결과물에 대해 작성해 주세요."
        },
        {
          "key": "notes",
          "label": "교육 특이사항",
          "type": "textarea",
          "required": true,
          "max": 12000,
          "help": "청소년 지원 필요사항, 운영진에게 전달할 내용을 작성해 주세요. 없으면 ‘없음’으로 입력해 주세요."
        },
        {
          "key": "achievement",
          "label": "활동 계획 달성률",
          "type": "checkboxes",
          "required": true,
          "help": "이번 회차에 계획한 활동을 얼마나 완료했는지 선택해 주세요.",
          "options": [
            "0~20%",
            "20%~40%",
            "40%~60%",
            "60%~80%",
            "80%~100%"
          ]
        }
      ]
    }
  }
} as any;
type Obj = Record<string, any>;
class PortalError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: Obj = {}) { super(message); }
}
const fail = (status: number, code: string, message: string, extra: Obj = {}): never => { throw new PortalError(status, code, message, extra); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_ACTIONS = new Set(['me', 'records', 'record', 'admin-records', 'accounts', 'export']);
const WRITE_ACTIONS = new Set(['login', 'logout', 'password', 'save', 'submit', 'review', 'account-create', 'account-update', 'account-reset']);
const settings = () => {
  const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !service || !anon) fail(503, 'CONFIGURATION_REQUIRED', '기록 서버를 준비 중입니다. 잠시 뒤 다시 시도해 주세요.');
  return { url, service, anon };
};
function clients() {
  const { url, service, anon } = settings();
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  // Never sign in on the service client: that would replace its authorization context.
  return { admin: createClient(url!, service!, options), auth: createClient(url!, anon!, options) };
}
function isWeek(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6; }
function validateRecordData(kind: string, input: unknown, submitting: boolean): Obj {
  if (kind !== 'plan' && kind !== 'log') fail(400, 'INVALID_KIND', '기록 종류를 확인해 주세요.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'VALIDATION_ERROR', '입력 내용을 확인해 주세요.');
  const values = input as Obj, result: Obj = {};
  for (const field of FORM_SCHEMA.forms[kind].fields) {
    const value = values[field.key];
    if (field.type === 'session') {
      if (value !== undefined && value !== '' && !isWeek(value)) fail(400, 'VALIDATION_ERROR', '회차를 확인해 주세요.');
      result[field.key] = value === '' || value === undefined ? '' : value;
    } else if (field.type === 'checkboxes') {
      if (value !== undefined && (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !field.options.includes(v)) || new Set(value).size !== value.length)) fail(400, 'VALIDATION_ERROR', '활동 계획 달성률의 선택을 확인해 주세요.');
      result[field.key] = value || [];
    } else {
      if (value !== undefined && typeof value !== 'string') fail(400, 'VALIDATION_ERROR', field.label + '을 확인해 주세요.');
      const text = String(value ?? '');
      if (text.length > (field.max ?? 12000)) fail(400, 'VALIDATION_ERROR', field.label + '의 글자 수를 줄여 주세요.');
      result[field.key] = text;
    }
    const answer = result[field.key];
    if (submitting && field.required && (answer === '' || answer === undefined || typeof answer === 'string' && !answer.trim() || Array.isArray(answer) && !answer.length)) fail(400, 'VALIDATION_ERROR', field.label + '을 작성해 주세요.');
  }
  return result;
}
function username(value: unknown) {
  if (typeof value !== 'string') fail(400, 'INVALID_USERNAME', '사용자명을 입력해 주세요.');
  const clean = (value as string).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(clean)) fail(400, 'INVALID_USERNAME', '사용자명은 영문 소문자·숫자·점·밑줄·하이픈으로 3~40자 입력해 주세요.');
  return clean;
}
function password(value: unknown) { if (typeof value !== 'string' || value.length < 8 || value.length > 128 || !value.trim()) fail(400, 'INVALID_PASSWORD', '비밀번호는 8~128자로 입력해 주세요.'); return value as string; }
function text(value: unknown, label: string, required = true, max = 80) { if (typeof value !== 'string' || value.length > max || required && !value.trim()) fail(400, 'INVALID_INPUT', label + '을(를) 확인해 주세요.'); return (value as string).trim(); }
function id(value: unknown) { if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'INVALID_ID', '기록이나 계정을 다시 선택해 주세요.'); return value as string; }
function version(value: unknown) { if (!Number.isInteger(value) || Number(value) < 1) fail(409, 'VERSION_REQUIRED', '최신 기록을 다시 열고 저장해 주세요.'); return Number(value); }
function validateFilters(input: Obj) {
  if (input.week !== undefined && input.week !== '' && !isWeek(Number(input.week))) fail(400, 'INVALID_WEEK', '회차는 1~6으로 선택해 주세요.');
  const kind = input.kind || input.type;
  if (kind && !['plan', 'log'].includes(kind)) fail(400, 'INVALID_KIND', '기록 종류를 확인해 주세요.');
  if (input.status && !['draft', 'submitted', 'revision_requested', 'reviewed'].includes(input.status)) fail(400, 'INVALID_STATUS', '기록 상태를 확인해 주세요.');
}
async function rpc(admin: any, action: string, actor: string | null, sid: string | null, input: Obj = {}): Promise<Obj> {
  const { data, error } = await admin.rpc('portal_backend', { p_action: action, p_actor: actor, p_session: sid, p_input: input });
  if (error) {
    let issue: Obj = {}; try { issue = JSON.parse(error.message); } catch { /* Keep raw SQL/internal messages private. */ }
    if (issue.code && Number.isInteger(issue.status)) fail(issue.status, issue.code, issue.message, issue.extra || {});
    if (error.code === '23505') fail(409, 'USERNAME_TAKEN', '이미 사용하는 사용자명입니다.');
    if (['23514', '23502', '22P02'].includes(error.code)) fail(400, 'INVALID_INPUT', '입력 내용을 확인해 주세요.');
    fail(503, 'DATABASE_ERROR', '기록을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  return data;
}
function tokenSession(token: string, userId: string) {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded));
    if (claims.sub !== userId || !UUID.test(claims.session_id)) throw Error();
    return claims.session_id as string;
  } catch { return fail(401, 'AUTH_REQUIRED', '다시 로그인해 주세요.'); }
}
async function identity(admin: any, token: string) {
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) fail(401, 'AUTH_REQUIRED', '로그인이 만료되었습니다. 다시 로그인해 주세요.');
  return { id: data.user.id as string, sid: tokenSession(token, data.user.id) };
}
const publicSession = (s: Obj) => ({ access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, token_type: s.token_type || 'bearer' });
async function ipHash(request: Request) {
  // These headers are set by the Supabase ingress. A client-supplied body is never an IP source.
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function login(admin: any, auth: any, loginName: string, secret: string, ip: string, reservation?: Obj) {
  // A successful current-password proof already reserves one attempt. Reuse that
  // reservation only inside the password workflow; never accept it from a client.
  const start = reservation ?? await rpc(admin, 'login-start', null, null, { username: loginName, ipHash: ip });
  if (start.limited) fail(429, 'RATE_LIMITED', '로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.');
  const { data, error } = await auth.auth.signInWithPassword({ email: start.email || 'missing-' + crypto.randomUUID() + '@uridongne.invalid', password: secret });
  if (error || !data?.session || !start.account || data.user?.id !== start.account.id) fail(401, 'INVALID_CREDENTIALS', '사용자명 또는 비밀번호를 확인해 주세요.');
  const sid = tokenSession(data.session.access_token, data.user.id);
  let result;
  try { result = await rpc(admin, 'login-finish', data.user.id, sid, { authVersion: start.authVersion, ipHash: ip }); }
  catch (error) { await admin.auth.admin.signOut(data.session.access_token, 'local').catch(() => {}); throw error; }
  return { ...result, session: publicSession(data.session) };
}
function csvCell(value: unknown) { let out = String(value ?? ''); if (/^[\s\u0000-\u0020]*[=+\-@]/.test(out) || /^[\t\r\n]/.test(out)) out = "'" + out; return '"' + out.replace(/"/g, '""') + '"'; }
function exportCSV(records: Obj[]) {
  const common = [['id', '기록 ID'], ['kind', '기록 종류'], ['week', '교육 회차'], ['authorName', '작성자'], ['authorTeam', '작성 팀'], ['status', '상태'], ['version', '버전'], ['feedback', '검토 의견'], ['createdAt', '작성 시각(UTC)'], ['updatedAt', '수정 시각(UTC)'], ['submittedAt', '제출 시각(UTC)']];
  const fields: Obj[] = [], seen = new Set();
  for (const form of [FORM_SCHEMA.forms.plan, FORM_SCHEMA.forms.log]) for (const field of form.fields) if (!seen.has(field.key)) { fields.push(field); seen.add(field.key); }
  const rows = [common.map(x => x[1]).concat(fields.map(f => f.label))];
  for (const record of records) rows.push(common.map(([key]) => key.endsWith('At') ? record[key] ? new Date(Number(record[key])).toISOString() : '' : record[key]).concat(fields.map(f => Array.isArray(record.data[f.key]) ? record.data[f.key].join(' / ') : record.data[f.key] ?? '')));
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
function allowedOrigin(request: Request) {
  const origin = request.headers.get('origin') || '';
  const configured = Deno.env.get('PORTAL_ALLOWED_ORIGINS') || 'https://seedcoop.github.io';
  return configured.split(',').map(x => x.trim()).includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : '';
}
function headers(origin: string) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'Content-Disposition', 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
}
export async function handleRequest(request: Request): Promise<Response> {
  const origin = allowedOrigin(request);
  const json = (value: Obj, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers(origin), 'Content-Type': 'application/json; charset=utf-8' } });
  try {
    if (!origin) fail(403, 'ORIGIN_REJECTED', '이 웹가이드에서 다시 시도해 주세요.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    if (!['GET', 'POST'].includes(request.method)) fail(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청 방식입니다.');
    const url = new URL(request.url); let input: Obj = Object.fromEntries(url.searchParams);
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'JSON_REQUIRED', 'JSON 요청만 사용할 수 있습니다.');
      if (Number(request.headers.get('content-length') || 0) > 131072) fail(413, 'TOO_LARGE', '입력 내용이 너무 깁니다.');
      const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > 131072) fail(413, 'TOO_LARGE', '입력 내용이 너무 깁니다.');
      let body; try { body = JSON.parse(raw); } catch { fail(400, 'INVALID_JSON', '입력 내용을 읽지 못했습니다.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_JSON', '입력 내용을 확인해 주세요.'); input = { ...input, ...body };
    }
    const action = input.action || 'me';
    if (!READ_ACTIONS.has(action) && !WRITE_ACTIONS.has(action)) fail(400, 'UNKNOWN_ACTION', '지원하지 않는 요청입니다.');
    if (request.method === 'GET' && WRITE_ACTIONS.has(action)) fail(405, 'METHOD_NOT_ALLOWED', '변경 요청은 POST로 보내 주세요.');
    const { admin, auth } = clients();
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] || '';
    if (token.length > 32768) fail(401, 'AUTH_REQUIRED', '다시 로그인해 주세요.');
    if (action === 'login') return json(await login(admin, auth, username(input.username), password(input.password), await ipHash(request)));
    if (action === 'me' && !token) return json({ ok: true, user: null, needsSetup: false, canSetup: false, canRecover: false });
    if (action === 'logout') {
      if (token) { try { const actor = await identity(admin, token); await rpc(admin, 'logout', actor.id, actor.sid); await admin.auth.admin.signOut(token, 'local').catch(() => {}); } catch { /* The caller still discards its expired token. */ } }
      return json({ ok: true });
    }
    if (!token) fail(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
    const actor = await identity(admin, token), me = await rpc(admin, 'me', actor.id, actor.sid);
    if (action === 'me') return json(me);
    if (me.user.mustChangePassword && action !== 'password') fail(403, 'PASSWORD_CHANGE_REQUIRED', '임시 비밀번호를 먼저 변경해 주세요.');
    if (action === 'password') {
      const current = password(input.currentPassword), next = password(input.newPassword);
      if (current === next) fail(400, 'PASSWORD_UNCHANGED', '현재와 다른 비밀번호를 입력해 주세요.');
      const ip = await ipHash(request), reserved = await rpc(admin, 'login-start', null, null, { username: me.user.username, ipHash: ip });
      if (reserved.limited) fail(429, 'RATE_LIMITED', '로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.');
      const ident = await rpc(admin, 'identity', actor.id, actor.sid);
      const proof = await auth.auth.signInWithPassword({ email: ident.email, password: current });
      if (proof.error || proof.data?.user?.id !== actor.id) fail(400, 'WRONG_PASSWORD', '현재 비밀번호를 확인해 주세요.');
      if (proof.data?.session) await admin.auth.admin.signOut(proof.data.session.access_token, 'local').catch(() => {});
      const operation = await rpc(admin, 'credentials-begin', actor.id, actor.sid, { intent: 'password' });
      try {
        const changed = await admin.auth.admin.updateUserById(actor.id, { password: next });
        if (changed.error) fail(400, 'PASSWORD_UPDATE_FAILED', '새 비밀번호를 적용하지 못했습니다. 비밀번호 조건을 확인해 주세요.');
        await rpc(admin, 'credentials-finish', actor.id, null, { operation: operation.operation, mustChangePassword: false });
      } catch (error) { await rpc(admin, 'credentials-abort', actor.id, null, { operation: operation.operation }).catch(() => {}); throw error; }
      await admin.auth.admin.signOut(token, 'global').catch(() => {});
      // credentials-begin increments exactly once. login-finish still compares
      // this expected version with the current DB version and Auth session, so a
      // concurrent account change cannot authorize a stale session.
      return json(await login(admin, auth, me.user.username, next, ip, {
        account: reserved.account, email: ident.email, authVersion: reserved.authVersion + 1,
      }));
    }
    if (['records', 'admin-records', 'export'].includes(action)) validateFilters(input);
    if (action === 'record') input.id = id(input.id);
    if (action === 'save' || action === 'submit') {
      const week = Number(input.week); if (!isWeek(week)) fail(400, 'INVALID_WEEK', '회차는 1~6으로 선택해 주세요.');
      input = { id: input.id ? id(input.id) : undefined, kind: input.kind, week, data: validateRecordData(input.kind, input.data, action === 'submit'), version: input.id ? version(input.version) : undefined };
      if (input.data.session !== '' && input.data.session !== week) fail(400, 'WEEK_MISMATCH', '기록의 교육 회차와 선택한 회차가 다릅니다.');
      if (new TextEncoder().encode(JSON.stringify(input.data)).byteLength > 65536) fail(413, 'TOO_LARGE', '입력 내용이 너무 깁니다.');
    }
    if (['admin-records', 'accounts', 'export', 'review', 'account-create', 'account-update', 'account-reset'].includes(action) && me.user.role !== 'admin') fail(403, 'FORBIDDEN', '관리자만 이용할 수 있습니다.');
    if (action === 'review') {
      if (!['reviewed', 'revision_requested'].includes(input.status)) fail(400, 'INVALID_STATUS', '검토 결과를 확인해 주세요.');
      input = { id: id(input.id), version: version(input.version), status: input.status, feedback: text(input.feedback ?? '', '피드백', input.status === 'revision_requested', 4000) };
    }
    if (action === 'account-update') {
      if (!['mentor', 'admin'].includes(input.role) || typeof input.active !== 'boolean') fail(400, 'INVALID_ACCOUNT', '계정 권한과 활성 상태를 확인해 주세요.');
      input = { id: id(input.id), name: text(input.name, '이름'), team: text(input.team ?? '', '팀', false), role: input.role, active: input.active };
    }
    if (action === 'account-create') {
      const loginName = username(input.username), name = text(input.name, '이름'), team = text(input.team ?? '', '팀', false), secret = password(input.password);
      if (!['mentor', 'admin'].includes(input.role)) fail(400, 'INVALID_ROLE', '계정 권한을 확인해 주세요.');
      const email = loginName + '@uridongne.invalid';
      const created = await admin.auth.admin.createUser({ email, password: secret, email_confirm: true });
      if (created.error || !created.data?.user) fail(409, 'ACCOUNT_CREATE_FAILED', '이미 사용하는 사용자명이거나 계정을 만들 수 없습니다.');
      try { return json(await rpc(admin, 'account-create', actor.id, actor.sid, { id: created.data.user.id, username: loginName, name, team, role: input.role, email }), 201); }
      catch (error) { await admin.auth.admin.deleteUser(created.data.user.id).catch(() => {}); throw error; }
    }
    if (action === 'account-reset') {
      const target = id(input.id), next = password(input.password);
      if (target === actor.id) fail(403, 'SELF_RESET', '내 비밀번호는 비밀번호 변경에서 바꿔 주세요.');
      const operation = await rpc(admin, 'credentials-begin', actor.id, actor.sid, { id: target, intent: 'reset' });
      try {
        const changed = await admin.auth.admin.updateUserById(target, { password: next });
        if (changed.error) fail(400, 'PASSWORD_UPDATE_FAILED', '새 비밀번호를 적용하지 못했습니다. 비밀번호 조건을 확인해 주세요.');
        await rpc(admin, 'credentials-finish', target, null, { operation: operation.operation, mustChangePassword: true });
      } catch (error) { await rpc(admin, 'credentials-abort', target, null, { operation: operation.operation }).catch(() => {}); throw error; }
      return json({ ok: true });
    }
    const result = await rpc(admin, action, actor.id, actor.sid, input);
    if (action === 'export') return new Response(exportCSV(result.records), { headers: { ...headers(origin), 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="mentor-records.csv"' } });
    return json(result);
  } catch (error) {
    if (error instanceof PortalError) return json({ ok: false, error: { code: error.code, message: error.message }, ...error.extra }, error.status);
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' } }, 500);
  }
}
Deno.serve(handleRequest);
