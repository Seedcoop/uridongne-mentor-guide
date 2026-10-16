'use strict';

// Offline contract/security checks. Uses the real Edge handler and browser scripts,
// with in-memory RPC/network/DOM doubles. Never sends requests to Supabase.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
// UI wording may change without changing the deployed answer validation contract.
const fieldContract = field => ({ key: field.key, required: Boolean(field.required), ...(field.options ? { options: field.options } : {}) });
const checks = [];
function check(label, condition) { assert(condition, label); checks.push(label); }
function equals(label, actual, expected) { assert.deepEqual(plain(actual), plain(expected), label); checks.push(label); }
const origin = 'https://seedcoop.github.io';
const submissionId = 'abfd8bb2-9a85-4c2c-b592-e21dba18150e';
const actor = '6a4da25c-aefe-4bec-ac3d-fc839254b6ad';
const sessionId = '3d95bdf0-3920-4769-955d-2cf4e6dc267c';
const adminToken = 'test.' + Buffer.from(JSON.stringify({ sub: actor, session_id: sessionId })).toString('base64url') + '.proof';
const storage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), clear: () => values.clear(), key: index => [...values.keys()][index] ?? null, get length() { return values.size; }, values };
};

async function backendChecks() {
  let source = read('supabase/functions/student-portal/index.ts');
  check('Edge schema has been populated', !source.includes('__STUDENT_SCHEMA__'));
  source = source.replace(/^import .*?;\s*$/m, '').replace(/^export /gm, '');
  source = stripTypeScriptTypes(source, { mode: 'transform', sourceUrl: 'student-portal/index.ts' });
  let nextRpc = null;
  const calls = [];
  const admin = {
    auth: { getUser: async token => token === adminToken ? { data: { user: { id: actor } } } : { data: { user: null }, error: { message: 'invalid' } } },
    rpc: async (name, args) => {
      assert.equal(name, 'student_backend'); calls.push(plain(args));
      if (nextRpc) { const response = nextRpc; nextRpc = null; return typeof response === 'function' ? response(args) : response; }
      if (args.p_action === 'enter-start') return { data: { codeHash: dummyHash, codeSalt: dummySalt, revision: 3, attemptId: submissionId } };
      if (args.p_action === 'enter-finish') return { data: { expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() } };
      if (args.p_action === 'enter-failure') return { data: { ok: true } };
      return { data: { ok: true, id: args.p_input.submissionId || submissionId, submittedAt: new Date().toISOString() } };
    }
  };
  const sandbox = vm.createContext({
    TextEncoder, TextDecoder, Request, Response, URL, Uint8Array, crypto: webcrypto, atob, btoa,
    createClient: () => admin,
    Deno: { env: { get: name => ({ SUPABASE_URL: 'https://test-project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'offline-only-service-key' })[name] }, serve: () => {} },
  });
  vm.runInContext(source + '\nglobalThis.testApi = {handleRequest, TOOL_SCHEMA, codeHash, sha256, entryCode};', sandbox);
  const api = sandbox.testApi;
  const dummySalt = '35'.repeat(32);
  const dummyCode = 'offline-dummy-entry';
  const dummyHash = await api.codeHash(dummyCode, dummySalt);
  const toolConfig = JSON.parse(read('public/studio.js').match(/const CONFIG=(\{.*\});\r?\nconst TOOLS=/)[1]);
  for (const tool of toolConfig.tools) {
    const expected = tool.fields.map(fieldContract);
    equals('server validation contract mirrors tool week ' + tool.week, api.TOOL_SCHEMA[tool.week].map(fieldContract), expected);
  }
  function answers(week = 1) {
    return Object.fromEntries(api.TOOL_SCHEMA[week].map(field => [field.key, field.required ? field.options?.[0] || '학생이 직접 쓴 응답' : '']));
  }
  async function request(input, { token = '', method = 'POST', requestOrigin = origin, raw, headers = {} } = {}) {
    const response = await api.handleRequest(new Request('https://test-project.supabase.co/functions/v1/student-portal', {
      method, headers: { origin: requestOrigin, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers },
      ...(!['GET', 'HEAD'].includes(method) ? { body: raw ?? JSON.stringify(input) } : {})
    }));
    const body = response.status === 204 ? null : await response.json();
    return { response, body };
  }
  async function denied(label, input, status, code, options) {
    const result = await request(input, options);
    equals(label + ' status', result.response.status, status);
    if (code) equals(label + ' code', result.body.error?.code, code);
    check(label + ' returns no session/response collection', !result.body.session && !result.body.records && !result.body.responses);
    return result;
  }
  await denied('untrusted origin', { action: 'enter', week: 1, code: dummyCode }, 403, 'ORIGIN_REJECTED', { requestOrigin: 'https://attacker.invalid' });
  await denied('GET unsupported', {}, 405, 'METHOD_NOT_ALLOWED', { method: 'GET' });
  await denied('non-JSON body', {}, 415, 'JSON_REQUIRED', { headers: { 'content-type': 'text/plain' } });
  await denied('malformed JSON', {}, 400, 'INVALID_JSON', { raw: '{' });
  await denied('array body', [], 400, 'INVALID_JSON');
  await denied('oversize unannounced body', {}, 413, 'TOO_LARGE', { raw: JSON.stringify({ action: 'enter', junk: '가'.repeat(50000) }) });
  for (const action of ['list', 'records', 'record', 'export', 'me', 'login', 'save', 'review']) await denied('student cannot call ' + action, { action }, 400, 'UNKNOWN_ACTION');
  for (const week of [0, 7, 1.5, '1', null]) await denied('invalid entry week ' + week, { action: 'enter', week, code: dummyCode }, 400, 'INVALID_WEEK');
  for (const code of ['', '  ', 123, 'x'.repeat(129)]) await denied('invalid code shape ' + String(code).slice(0, 8), { action: 'enter', week: 1, code }, 400, 'CODE_REQUIRED');
  const wrong = await denied('incorrect entry code', { action: 'enter', week: 1, code: 'incorrect-offline-code' }, 401, 'INVALID_CODE');
  check('wrong code reserves and records a failed attempt', calls.at(-2).p_action === 'enter-start' && calls.at(-1).p_action === 'enter-failure');
  check('wrong code response does not expose code hash', !JSON.stringify(wrong.body).includes(dummyHash));
  nextRpc = { data: { limited: true } };
  await denied('entry attempt rate limit', { action: 'enter', week: 1, code: dummyCode }, 429, 'RATE_LIMITED');
  nextRpc = { data: {} };
  await denied('closed week', { action: 'enter', week: 1, code: dummyCode }, 403, 'WEEK_CLOSED');
  const entered = await request({ action: 'enter', week: 1, code: dummyCode });
  equals('correct code enters without Supabase Auth', entered.response.status, 200);
  const token = entered.body.session.token;
  check('entry issues opaque 256-bit token', /^[A-Za-z0-9_-]{43}$/.test(token));
  equals('entry token scope', entered.body.session.week, 1);
  const finish = calls.at(-1).p_input;
  equals('database receives hash rather than raw token', finish.tokenHash, await api.sha256(token));
  check('database receives neither raw entry code nor raw bearer', !JSON.stringify(calls).includes(dummyCode) && !JSON.stringify(calls).includes(token));
  equals('entry response is not cached', entered.response.headers.get('cache-control'), 'no-store');

  const payload = { action: 'submit', week: 1, team: '  하늘팀  ', name: '  김학생  ', answers: answers(1), output: '직접 정리한 결과', submissionId };
  for (const bearer of ['', 'x', token.slice(1), token + 'x']) await denied('missing or malformed submission token ' + bearer.length, payload, 401, 'SESSION_EXPIRED', { token: bearer });
  for (const field of ['team', 'name']) for (const value of ['', '  ', null, 'x'.repeat(81)]) await denied('invalid ' + field + ' ' + String(value).slice(0, 5), { ...payload, [field]: value }, 400, 'VALIDATION_ERROR', { token });
  for (const value of [undefined, [], null, 'x']) await denied('invalid answer object ' + String(value), { ...payload, answers: value }, 400, 'VALIDATION_ERROR', { token });
  await denied('unknown answer key', { ...payload, answers: { ...payload.answers, role: 'admin' } }, 400, 'VALIDATION_ERROR', { token });
  for (const field of api.TOOL_SCHEMA[1].filter(field => field.required)) await denied('required answer ' + field.key, { ...payload, answers: { ...payload.answers, [field.key]: '  ' } }, 400, 'VALIDATION_ERROR', { token });
  await denied('non-string answer', { ...payload, answers: { ...payload.answers, place: 123 } }, 400, 'VALIDATION_ERROR', { token });
  await denied('single answer length limit', { ...payload, answers: { ...payload.answers, place: 'x'.repeat(6001) } }, 400, 'VALIDATION_ERROR', { token });
  const manyBytes = Object.fromEntries(api.TOOL_SCHEMA[1].map(field => [field.key, '가'.repeat(3000)]));
  await denied('aggregate UTF-8 answer byte limit', { ...payload, answers: manyBytes }, 413, 'TOO_LARGE', { token });
  await denied('invalid selected option', { ...payload, week: 5, answers: { ...answers(5), testResult: 'made-up-option' } }, 400, 'VALIDATION_ERROR', { token });
  for (const value of [null, 'not-a-uuid']) await denied('invalid idempotency UUID ' + value, { ...payload, submissionId: value }, 400, 'INVALID_ID', { token });
  await denied('output character limit', { ...payload, output: 'x'.repeat(24001) }, 400, 'VALIDATION_ERROR', { token });
  const submitted = await request({ ...payload, role: 'admin', author_id: actor, tokenHash: 'spoofed', ipHash: 'spoofed' }, { token });
  equals('valid student response submits', submitted.response.status, 200);
  const sent = calls.at(-1);
  equals('submit only sends server-approved RPC properties', Object.keys(sent.p_input).sort(), ['week', 'tokenHash', 'team', 'name', 'answers', 'output', 'submissionId'].sort());
  equals('team and name trimmed on server', [sent.p_input.team, sent.p_input.name], ['하늘팀', '김학생']);
  equals('idempotency key retained unchanged', sent.p_input.submissionId, submissionId);
  equals('student submit has no mentor actor or Auth session', [sent.p_actor, sent.p_session], [null, null]);
  equals('student submit carries hashed token', sent.p_input.tokenHash, await api.sha256(token));
  for (const [label, status, code] of [['expired bearer', 401, 'SESSION_EXPIRED'], ['week scope mismatch', 403, 'WEEK_MISMATCH'], ['code revoked while session open', 401, 'SESSION_EXPIRED'], ['duplicate ID belongs to another session', 409, 'SUBMISSION_CONFLICT']]) {
    nextRpc = { error: { message: JSON.stringify({ status, code, message: label }) } };
    await denied(label + ' from DB', { ...payload, ...(code === 'WEEK_MISMATCH' ? { week: 2, answers: answers(2) } : {}) }, status, code, { token });
  }
  nextRpc = { error: { message: 'private.student_sessions offline-only-service-key', code: 'XX000' } };
  const hidden = await denied('internal DB errors sanitized', payload, 503, 'DATABASE_ERROR', { token });
  check('DB error response contains no secrets/internal relation', !JSON.stringify(hidden.body).includes('private.') && !JSON.stringify(hidden.body).includes('offline-only-service-key'));
  for (const action of ['admin-list', 'admin-detail', 'admin-codes', 'admin-code-set']) await denied('student token cannot ' + action, { action, id: submissionId, week: 1, active: true }, 401, 'AUTH_REQUIRED', { token });
  const adminList = await request({ action: 'admin-list', week: 2, role: 'admin' }, { token: adminToken });
  equals('admin request permitted only after verified getUser', adminList.response.status, 200);
  equals('admin RPC gets verified actor and Auth session', [calls.at(-1).p_actor, calls.at(-1).p_session, calls.at(-1).p_input], [actor, sessionId, { week: 2 }]);
  const codeSet = await request({ action: 'admin-code-set', week: 3, active: true, code: dummyCode }, { token: adminToken });
  equals('admin code update succeeds', codeSet.response.status, 200);
  const codeInput = calls.at(-1).p_input;
  check('admin entry code saved with random salt and slow hash', /^[a-f0-9]{64}$/.test(codeInput.codeSalt) && /^[a-f0-9]{64}$/.test(codeInput.codeHash) && codeInput.codeHash !== dummyHash && !JSON.stringify(codeInput).includes(dummyCode));
  return { toolConfig };
}

function baselineChecks() {
  const html = read('public/student.html');
  check('student shell has no mentor app or authentication scripts', !/<script[^>]+src=["'][^"']*(?:app|portal|portal-client|studio|moodboard)\.js[?"']/i.test(html));
  check('student shell asks robots not to index it', /name="robots" content="noindex,nofollow"/.test(html));
  const mentor = read('public/app.js');
  check('mentor routes still require mentor access before details', mentor.includes('const allowed=await window.MentorPortal.requireAccess(hash);') && mentor.indexOf('const allowed=await window.MentorPortal.requireAccess(hash);') < mentor.indexOf("if(kind==='week')$('main').innerHTML=weekView"));
  check('mentor guards still cover week/studio/moodboard/toolbox', /function protectedRoute\(hash\).*#week-.*#studio.*#moodboard.*#toolbox/.test(mentor));
  check('mentor access still revalidated on focus/pageshow', mentor.includes("window.addEventListener('focus',recheckDetails)") && mentor.includes("window.addEventListener('pageshow',recheckDetails)"));
}

function sqlChecks(toolConfig) {
  // These are source invariants, not a substitute for executing the migration in
  // PostgreSQL. The Edge tests above only double the service-role RPC boundary.
  const sql = read('supabase/migrations/202610160002_students.sql');
  const normalized = sql.replace(/\s+/g, ' ');
  const schema = JSON.parse(sql.match(/declare schema jsonb := '(.*?)'::jsonb;/s)[1]);
  for (const tool of toolConfig.tools) equals('SQL validation contract mirrors week ' + tool.week, schema[tool.week].map(fieldContract), tool.fields.map(fieldContract));
  for (const table of ['student_week_codes', 'student_entry_attempts', 'student_sessions', 'student_submissions']) {
    check('RLS enabled for ' + table, normalized.includes('alter table private.' + table + ' enable row level security;'));
    check('browser and service table grants revoked for ' + table, new RegExp('revoke all on [^;]*private\\.' + table + '[^;]* from public,anon,authenticated,service_role;').test(normalized));
  }
  check('student RPC is service-only', /revoke all on function public\.student_backend\(text,uuid,uuid,jsonb\) from public,anon,authenticated;/.test(normalized) && /grant execute on function public\.student_backend\(text,uuid,uuid,jsonb\) to service_role;/.test(normalized));
  check('student RPC fixes definer search path', /language plpgsql security definer set search_path=''/.test(normalized));
  check('student RPC admin branch verifies registered portal actor and role', normalized.includes('actor:=private.portal_actor(p_actor,p_session);') && normalized.includes("if actor.role<>'admin' then"));
  check('student token authorization checks actual DB expiry/code revision/active', normalized.includes('s.expires_at>now()') && normalized.includes('not config.active or config.code_hash is null or session.code_revision<>config.revision'));
  check('student token scope compared with requested week', /if session.week<>selected_week then/.test(normalized));
  check('student capability expiry is four hours', normalized.includes("now()+interval '4 hours'"));
  check('code rotation increments revision and revokes scoped sessions', normalized.includes('revision=c.revision+1') && /delete from private.student_sessions s where s.week=selected_week/.test(normalized));
  check('idempotency is unique within one opaque session', normalized.includes('unique(session_token_hash,client_submission_id)'));
  check('idempotency lookup includes the opaque session', /where r.session_token_hash=v_token_hash and r.client_submission_id=submitted_id/.test(normalized));
  check('idempotency rejects changed answers and identity', normalized.includes('submission.team<>clean_team') && normalized.includes('submission.name<>clean_name') && normalized.includes('submission.answers<>clean_answers') && normalized.includes("'IDEMPOTENCY_CONFLICT',409"));
  check('concurrent retries serialized per session', normalized.includes('pg_advisory_xact_lock(hashtextextended(v_token_hash,106160004))'));
  check('code verification registration locks code revision', /from private.student_week_codes where week=selected_week for share/.test(normalized));
  check('submissions lock session and code until commit', /from private.student_sessions s where s.token_hash=v_token_hash and s.expires_at>now\(\) for share;/.test(normalized) && normalized.includes('from private.student_week_codes where week=selected_week for share;'));
  check('database answer validator enforces whitelist/required/option/size', normalized.includes('not exists(select 1 from jsonb_array_elements(fields)') && normalized.includes("(field->>'required')::boolean") && normalized.includes("not (field->'options' ? value)") && normalized.includes('octet_length(p_answers::text)>65536'));
  check('submissions are append-only', normalized.includes('before update or delete on private.student_submissions'));
  const receipt = sql.slice(sql.indexOf('create function private.student_receipt_json'), sql.indexOf('create function private.student_append_only'));
  check('student receipt contains no identity, answers, or reusable token', !/token_hash|answers|'team'|'name'|'output'/.test(receipt));
  check('SQL variables do not shadow token_hash/ip_hash columns', !/(?:;|\s)(?:token_hash|ip_hash) text[;\s]/.test(sql.slice(sql.indexOf('declare actor'), sql.indexOf('\nbegin\n', sql.indexOf('declare actor')))));
}

async function frontendChecks() {
  const listeners = { document: {}, window: {} }, nodes = new Map(), timers = new Map();
  let timerSequence = 0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, dataset: {}, isConnected: true, inert: false, focus() {}, scrollIntoView() {}, querySelector: () => node(id + '.button'), querySelectorAll: () => [node(id + '.button')], closest: () => null });
    return nodes.get(id);
  }
  const sessionStore = storage({ 'mentor-session-fixture': 'keep-private-mentor-state' });
  const localStore = storage({ 'uridongne-workshop-tools:v1': JSON.stringify({ version: 1, records: { 1: { place: 'private mentor text' } } }) });
  const loadedScripts = [], network = [];
  let nextResponse = null, failNetwork = false;
  const location = { hash: '#studio/6', pathname: '/uridongne-mentor-guide/student.html', search: '', get href() { return origin + this.pathname + this.search + this.hash; } };
  const add = surface => (type, callback) => (listeners[surface][type] ||= []).push(callback);
  const document = {
    getElementById: node, querySelector: selector => selector === '.student-receipt' ? node('receipt') : null, querySelectorAll: () => [], addEventListener: add('document'),
    body: { classList: { add() {}, remove() {} }, append() {} }, baseURI: origin + '/uridongne-mentor-guide/student.html',
    createElement: type => ({ tagName: type, remove() {}, getContext: () => null }),
    head: { append(element) { loadedScripts.push(element.src); throw Error('Unexpected dynamic script in offline harness: ' + element.src); } },
  };
  const window = { addEventListener: add('window'), confirm: () => true, WorkshopPDF: {}, MentorPortalConfig: { supabaseUrl: 'https://test-project.supabase.co', publishableKey: 'offline-public-key' }, print() {} };
  const sandbox = vm.createContext({ window, document, location, history: { replaceState(_state, _title, url) { const next = new URL(url, location.href); location.pathname = next.pathname; location.search = next.search; location.hash = next.hash; } }, sessionStorage: sessionStore, localStorage: localStore, crypto: webcrypto, TextEncoder, TextDecoder, URL, URLSearchParams, Blob, AbortController, console, queueMicrotask: () => {},
    setTimeout(callback, ms) { const id = ++timerSequence; timers.set(id, { callback, ms }); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      network.push({ url, options, body: JSON.parse(options.body) });
      if (failNetwork) throw new TypeError('offline network failure');
      const reply = nextResponse || { ok: true, receipt: { id: submissionId, week: network.at(-1).body.week, submittedAt: new Date().toISOString() } };
      nextResponse = null;
      return { ok: reply.ok, status: reply.ok ? 200 : 401, json: async () => reply };
    },
  });
  let source = read('public/student.js');
  source = source.replace(/\}\)\(\);\s*$/, "globalThis.testStudent = {validSession, allowed, renderTool, renderWorkspace, submitPanel, forgetSession, enterGate, state:()=>({session,draft,busy}), set:(s,d={})=>{session=s;draft=d;}};\n})();");
  vm.runInContext(source, sandbox);
  const student = sandbox.testStudent;
  check('direct tool hash without code renders gate', node('main').innerHTML.includes('id="studentGate"'));
  equals('anonymous gate loads no tools or network', [loadedScripts.length, network.length], [0, 0]);
  check('anonymous audience cannot use any week', [1, 2, 3, 4, 5, 6].every(week => !window.WorkshopAudience.canUseWeek(week)));
  // Load the actual tool modules into the synthetic DOM after the gate check.
  vm.runInContext(read('public/prompt-safety.js'), sandbox);
  vm.runInContext(read('public/studio.js'), sandbox);
  vm.runInContext(read('public/moodboard.js'), sandbox);
  const api = window.WorkshopTools;
  equals('student tool never reads mentor local drafts', api.getState().records, {});
  async function dispatch(surface, type, target = {}) {
    const event = { target, preventDefault() {} };
    for (const listener of listeners[surface][type] || []) await listener(event);
  }
  function gateForm(code = 'offline-student-code', week = 1) {
    const form = node('studentGate');
    form.elements = { week: { value: String(week) }, code: { value: code } };
    return form;
  }
  nextResponse = { ok: false, error: { code: 'INVALID_CODE', message: '잘못된 테스트 코드' } };
  await dispatch('document', 'submit', gateForm());
  check('wrong code leaves student at gate with no session', !student.state().session && node('studentMessage').textContent === '잘못된 테스트 코드');
  equals('code input cleared after failed verification', node('studentGate').elements.code.value, '');
  nextResponse = { ok: true, session: { token: 'T'.repeat(43), week: 1, expiresAt: new Date(Date.now() + 3600000).toISOString() } };
  await dispatch('document', 'submit', gateForm());
  check('valid code opens current-week response tool', node('studentTool').innerHTML.includes('아이디어 한 장 기획서'));
  equals('successful entry updates week query for reliable reload', location.search, '?week=1');
  equals('successful gateway uses no Auth endpoint', network.every(call => call.url.endsWith('/functions/v1/student-portal')), true);
  check('entry code is not stored', !JSON.stringify([...sessionStore.values]).includes('offline-student-code'));
  const currentSession = plain(student.state().session);
  check('current week access scoped in audience', window.WorkshopAudience.canUseWeek(1) && !window.WorkshopAudience.canUseWeek(2));
  equals('direct cross-week tool API returns no markup', api.render(6), '');
  equals('direct cross-week answer API returns no records', api.getAnswers(6), {});
  equals('moodboard API denied outside week two', window.VisualMoodboard.render(), '');
  equals('asset request API denied outside week three', api.getAssetPrompt(3), '');
  for (const hash of ['#admin', '#records', '#week-4', '#studio/6', '#moodboard', '#toolbox/prompts']) {
    location.hash = hash; student.renderTool();
    check('direct hash stays inside current tool ' + hash, node('studentTool').innerHTML.includes('아이디어 한 장 기획서') && !node('studentTool').innerHTML.includes('멘토가 준비할'));
  }
  check('student markup has no mentor routes/import/sample controls', !/href="#(?:week-|toolbox|records|admin)|data-studio-action="(?:carry|sample|restore|original)"/.test(node('studentTool').innerHTML));
  node('studentTeam').value = '우리 팀'; node('studentName').value = '학생';
  const beforeMissing = network.length;
  await dispatch('document', 'submit', node('studentSubmitForm'));
  equals('required answers checked before network submission', network.length, beforeMissing);
  check('missing answer shown to student', node('studentSubmitMessage').textContent.includes('핵심 질문'));
  for (const key of ['place', 'moment', 'mainAction', 'goal', 'selectionReason']) await dispatch('document', 'input', { id: 'studio-' + key, dataset: { studioField: key }, value: '<img src=x onerror=alert(1)> 직접 작성', closest: () => null });
  check('student text output is HTML escaped', node('studioResultBody').innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;') && !node('studioResultBody').innerHTML.includes('<img src=x onerror=alert(1)>'));
  const draftNamespace = 'uridongne.student.draft.' + currentSession.draftId;
  check('responses saved only in student session namespace', sessionStore.getItem(draftNamespace + '.tools')?.includes('직접 작성') && !localStore.getItem('uridongne-workshop-tools:v1').includes('직접 작성'));
  failNetwork = true;
  await dispatch('document', 'submit', node('studentSubmitForm'));
  const firstAttempt = network.at(-1).body;
  check('network failure keeps pending submission for safe retry', Boolean(student.state().draft.pending));
  failNetwork = false;
  await dispatch('document', 'submit', node('studentSubmitForm'));
  equals('unchanged retry reuses idempotency UUID', network.at(-1).body.submissionId, firstAttempt.submissionId);
  equals('submission includes required team and real name', [firstAttempt.team, firstAttempt.name], ['우리 팀', '학생']);
  check('successful receipt locks tool editing', node('studentTool').inert && node('studentSubmit').innerHTML.includes('응답을 제출했어요'));
  const receiptNetwork = network.length;
  await dispatch('document', 'submit', node('studentSubmitForm'));
  equals('submitted receipt prevents duplicate clicks', network.length, receiptNetwork);
  const action = value => ({ dataset: { studentAction: value }, closest: selector => selector === '[data-student-action]' ? { dataset: { studentAction: value } } : null });
  await dispatch('document', 'click', action('revise'));
  check('explicit revision unlocks tool', !node('studentTool').inert && !student.state().draft.receipt);
  await dispatch('document', 'submit', node('studentSubmitForm'));
  check('explicit revision creates new submission UUID', network.at(-1).body.submissionId !== firstAttempt.submissionId);
  student.set(currentSession, { team: '<script>team</script>', name: '" onfocus="bad', receipt: { id: '<img src=x>', submittedAt: new Date().toISOString() } });
  const receiptMarkup = student.submitPanel();
  check('receipt escapes malicious team/name/server ID', !receiptMarkup.includes('<script>') && !receiptMarkup.includes('<img src=x>') && receiptMarkup.includes('&lt;script&gt;team&lt;/script&gt;') && receiptMarkup.includes('&quot; onfocus=&quot;bad'));
  student.forgetSession();
  check('leaving clears student identity, draft and capability', !student.state().session && !sessionStore.getItem('uridongne.student.session.v1') && !sessionStore.getItem(draftNamespace + '.tools'));
  equals('leaving preserves mentor storage', sessionStore.getItem('mentor-session-fixture'), 'keep-private-mentor-state');
  equals('leaving clears in-memory student answers', api.getState().records, {});
  const weekTwo = { ...currentSession, week: 2, draftId: webcrypto.randomUUID() };
  student.set(weekTwo); location.hash = '#moodboard'; student.renderWorkspace();
  check('week two exposes only its visual moodboard', node('studentTool').innerHTML.includes('moodboardCanvas') && !node('studentTool').innerHTML.includes('멘토가 미리 준비할 것') && !node('studentTool').innerHTML.includes('href="#week-2"'));
  student.set({ ...weekTwo, expiresAt: new Date(Date.now() - 1).toISOString() });
  await dispatch('document', 'visibilitychange');
  check('expired capability clears workspace and returns to gate', !student.state().session && node('main').innerHTML.includes('id="studentGate"') && !window.WorkshopAudience.canUseWeek(2));

  const weekThree = { ...currentSession, week: 3, draftId: webcrypto.randomUUID() };
  student.set(weekThree); location.hash = '#tool'; student.renderWorkspace();
  const weekThreeMarkup = node('studentTool').innerHTML;
  check('week three presents asset request before implementation', weekThreeMarkup.indexOf('data-studio-mode="asset"') >= 0 && weekThreeMarkup.indexOf('data-studio-mode="asset"') < weekThreeMarkup.indexOf('data-studio-mode="prompt"'));
  await dispatch('document', 'input', { dataset: { studioField: 'priority' }, value: '노란 우비 캐릭터 한 장, 둥근 얼굴', closest: () => null });
  await dispatch('document', 'click', { closest: selector => selector === '[data-studio-mode]' ? { dataset: { studioMode: 'asset' }, disabled: false } : null });
  check('asset tab renders current student selection and image request', node('studentTool').innerHTML.includes('노란 우비 캐릭터 한 장') && node('studentTool').innerHTML.includes('이번 요청에서는 게임 코드를 만들거나 수정하지 마'));
  check('asset request requires moodboard and avoids code changes', api.getAssetPrompt(3).includes('작업 전 무드보드를 확인') && api.getAssetPrompt(3).includes('게임 코드를 만들거나 수정하지 마'));
  await dispatch('document', 'click', { closest: selector => selector === '[data-studio-mode]' ? { dataset: { studioMode: 'prompt' }, disabled: false } : null });
  check('implementation tab still exposes playable loop request', node('studentTool').innerHTML.includes('작은 프로토타입') && !node('studentTool').innerHTML.includes('이번 요청에서는 게임 코드를 만들거나 수정하지 마'));
  student.forgetSession();

  // Run the real admin rendering code against malicious stored student values.
  const hostile = '<img src=x onerror=alert(1)>';
  window.MentorPortalClient = { requestStudentAdmin: async action => action === 'admin-list' ? { submissions: [{ id: hostile, week: 1, team: hostile, name: hostile, submittedAt: new Date().toISOString() }] } : action === 'admin-codes' ? { codes: [] } : { submission: { id: submissionId, week: 1, team: hostile, name: hostile, answers: { [hostile]: hostile }, output: hostile, submittedAt: new Date().toISOString() } } };
  vm.runInContext(read('public/student-admin.js'), sandbox);
  await window.StudentAdmin.load({ isCurrent: () => true, signal: new AbortController().signal });
  check('admin student response list escapes stored identity', !window.StudentAdmin.render().includes(hostile) && window.StudentAdmin.render().includes('&lt;img src=x onerror=alert(1)&gt;'));
  const open = { disabled: false, dataset: { studentAdminAction: 'open', id: submissionId }, closest: selector => selector === '[data-student-admin-action]' || selector === '#studentAdminPanel' ? open : null };
  await dispatch('document', 'click', open);
  check('admin detail escapes answer keys/values/output', !window.StudentAdmin.render().includes(hostile) && window.StudentAdmin.render().includes('&lt;img src=x onerror=alert(1)&gt;'));
  window.StudentAdmin.reset();
  check('admin cached identities clear on reset', !window.StudentAdmin.render().includes('&lt;img src=x onerror=alert(1)&gt;'));
}

async function weeklyLinkChecks() {
  const source = read('public/student.js');
  async function bootstrap(search, savedWeek) {
    const nodes = new Map(), loads = [], requests = [];
    const node = id => { if (!nodes.has(id)) nodes.set(id, { id, innerHTML: '', textContent: '', hidden: false, focus() {}, inert: false }); return nodes.get(id); };
    const saved = savedWeek ? { token: 'S'.repeat(43), week: savedWeek, expiresAt: new Date(Date.now() + 3600000).toISOString(), draftId: submissionId } : null;
    const initial = saved ? { 'uridongne.student.session.v1': JSON.stringify(saved), ['uridongne.student.draft.' + submissionId + '.tools']: 'old-student-draft' } : {};
    const sessionStore = storage(initial);
    const location = { search, hash: '#studio/6', pathname: '/uridongne-mentor-guide/student.html', get href() { return origin + this.pathname + this.search + this.hash; } };
    const window = { addEventListener() {}, WorkshopPDF: {}, WorkshopTools: { clearStudentState() {}, render: week => 'CURRENT-WEEK-' + week }, VisualMoodboard: { clearStudentState() {} } };
    const sandbox = vm.createContext({ window, document: { getElementById: node, addEventListener() {}, createElement: () => ({}), head: { append: element => loads.push(element.src) } }, location, history: { replaceState() {} }, URL, URLSearchParams, crypto: webcrypto, sessionStorage: sessionStore, AbortController, setTimeout: () => 1, clearTimeout() {}, fetch: async (...args) => { requests.push(args); throw Error('No gateway verification should run on link open'); } });
    vm.runInContext(read('public/prompt-safety.js'), sandbox);
    vm.runInContext(source, sandbox);
    await Promise.resolve(); await Promise.resolve();
    return { window, nodes, sessionStore, loads, requests };
  }
  for (const week of [3, 6]) {
    const app = await bootstrap('?week=' + week);
    check('weekly link ' + week + ' preselects the requested week', new RegExp('<option value="' + week + '" selected>').test(app.nodes.get('main').innerHTML));
    check('weekly link ' + week + ' still requires entry code', app.nodes.get('main').innerHTML.includes('id="studentGate"') && !app.window.WorkshopAudience.canUseWeek(week));
    equals('weekly link ' + week + ' never submits or autoenters', [app.loads.length, app.requests.length, app.sessionStore.length], [0, 0, 0]);
  }
  for (const value of ['0', '7', '03', '3.0', '3x', '-1', '', '%3Cimg%20src%3Dx%3E']) {
    const app = await bootstrap('?week=' + value);
    check('invalid weekly link falls back to gate week one: ' + value, /<option value="1" selected>/.test(app.nodes.get('main').innerHTML) && app.nodes.get('main').innerHTML.includes('id="studentGate"'));
    equals('invalid weekly link never starts an API request: ' + value, app.requests.length, 0);
  }
  const changed = await bootstrap('?week=6', 3);
  check('different weekly link invalidates prior scoped session', !changed.sessionStore.getItem('uridongne.student.session.v1') && !changed.window.WorkshopAudience.canUseWeek(3) && !changed.window.WorkshopAudience.canUseWeek(6));
  check('different weekly link clears previous participant draft', !changed.sessionStore.getItem('uridongne.student.draft.' + submissionId + '.tools'));
  check('different weekly link returns to requested code gate', /<option value="6" selected>/.test(changed.nodes.get('main').innerHTML) && changed.nodes.get('main').innerHTML.includes('id="studentGate"'));
  equals('different weekly link does not verify or enter automatically', [changed.loads.length, changed.requests.length], [0, 0]);
  const matching = await bootstrap('?week=3', 3);
  check('matching weekly link resumes only existing valid scope', matching.window.WorkshopAudience.canUseWeek(3) && !matching.window.WorkshopAudience.canUseWeek(6) && matching.nodes.get('studentTool').innerHTML === 'CURRENT-WEEK-3');

  const appSource = read('public/app.js');
  const lines = appSource.split(/\r?\n/);
  const helperNames = ['timelineDate', 'textList', 'mindmapPreview', 'moodboardCTA', 'timelineSection', 'originalToolReference', 'recoveryBranch', 'weekView'];
  const shareSource = appSource.slice(appSource.indexOf('function studentEntryShare('), appSource.indexOf('function timelineDate('));
  const helpers = lines.filter(line => line.startsWith('const weeks=') || line.startsWith('const weeklyTimeline=') || helperNames.some(name => line.startsWith('function ' + name + '('))).join('\n');
  const clicks = [], copied = [];
  const shareContext = vm.createContext({ window: { WorkshopTools: { cta: () => '' } }, esc: value => String(value ?? ''), TOOL: 'https://example.invalid/', document: { addEventListener: (_type, callback) => clicks.push(callback) }, navigator: { clipboard: { writeText: async value => copied.push(value) } }, toast() {} });
  const copyStart = appSource.indexOf("document.addEventListener('click',async event=>{\n const button=event.target.closest('[data-action=\"student-link-copy\"]')");
  check('weekly share clipboard handler exists', copyStart >= 0);
  const copySource = appSource.slice(copyStart, appSource.indexOf("window.addEventListener('hashchange'", copyStart));
  vm.runInContext(helpers + '\n' + shareSource + '\n' + copySource + '\nglobalThis.shareApi={studentEntryShare,studentActivityShare,weekView,timelineSection,weeklyTimeline};', shareContext);
  const share = shareContext.shareApi;
  const expectedActivities = { 1: [5], 2: [1, 3], 3: [1, 3], 4: [3], 5: [1, 2, 6], 6: [3] };
  const qrFiles = [];
  for (let week = 1; week <= 6; week++) {
    const url = origin + '/uridongne-mentor-guide/student.html?week=' + week;
    const svgFile = 'public/assets/student-week-' + week + '-qr.svg';
    const svg = read(svgFile); qrFiles.push(svg);
    check('weekly QR asset exists and contains standalone vector paths: ' + week, svg.includes('<svg') && svg.includes('<path') && !/<(?:script|foreignObject|image)\b/i.test(svg));
    const markup = share.studentEntryShare(week);
    check('week ' + week + ' share link/QR/copy button map to same week', markup.includes('href="' + url + '"') && markup.includes('src="./assets/student-week-' + week + '-qr.svg"') && markup.includes('data-student-week="' + week + '"'));
    const view = share.weekView(week);
    const prep = view.slice(view.indexOf('<h3>멘토가 준비할 것'), view.indexOf('</section>', view.indexOf('<h3>멘토가 준비할 것')));
    check('week ' + week + ' preparation section includes its compact share widget', prep.includes('student-entry-share compact') && prep.includes('href="' + url + '"'));
    const blocks = share.timelineSection(week).split('<details class="timeline-block').slice(1);
    for (let index = 0; index < blocks.length; index++) equals('week ' + week + ' activity ' + index + ' share placement', blocks[index].includes('student-entry-share'), expectedActivities[week].includes(index));
    equals('week ' + week + ' has one preparation QR plus chosen activity QRs', [...view.matchAll(/<aside class="student-entry-share/g)].length, 1 + expectedActivities[week].length);
    await clicks[0]({ target: { closest: () => ({ dataset: { studentWeek: String(week) } }) } });
    equals('week ' + week + ' copy action writes correct weekly student URL', copied.at(-1), url);
  }
  equals('six week QR vectors are distinct', new Set(qrFiles).size, 6);
  const copiedBefore = copied.length;
  for (const invalid of ['0', '7', 'bad']) await clicks[0]({ target: { closest: () => ({ dataset: { studentWeek: invalid } }) } });
  equals('clipboard action rejects malformed week values', copied.length, copiedBefore);
  check('weekly share stylesheet is linked from mentor shell', read('public/index.html').includes('href="./student-share.css?'));
}

(async () => {
  baselineChecks();
  const { toolConfig } = await backendChecks();
  sqlChecks(toolConfig);
  await frontendChecks();
  await weeklyLinkChecks();
  console.log('Student gateway offline checks passed: ' + checks.length + '. No real accounts, passwords, messages, or submissions used.');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
