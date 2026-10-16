import { createClient } from 'npm:@supabase/supabase-js@2';

// Self-contained for the Supabase Dashboard editor. This schema mirrors studio.js;
// entry codes and their hashes never belong in a public asset or this source.
const TOOL_SCHEMA: Record<number, { key: string; label: string; required: boolean; options?: string[] }[]> = {
  "1": [
    {
      "key": "teamName",
      "label": "팀 이름(정해졌다면)",
      "required": false
    },
    {
      "key": "gameTitle",
      "label": "내 게임의 임시 이름은?",
      "required": false
    },
    {
      "key": "place",
      "label": "어디에서 있었던 일이야?",
      "required": true
    },
    {
      "key": "moment",
      "label": "그곳에서 무슨 일이 있었어?",
      "required": true
    },
    {
      "key": "mainAction",
      "label": "플레이어는 무엇을 하게 될까?",
      "required": true
    },
    {
      "key": "goal",
      "label": "무엇을 해내면 한 판이 끝날까?",
      "required": true
    },
    {
      "key": "selectionReason",
      "label": "내가 이 생각을 고른 이유는?",
      "required": true
    },
    {
      "key": "priority",
      "label": "이 아이디어에서 꼭 남기고 싶은 것은?",
      "required": false
    }
  ],
  "2": [
    {
      "key": "gameTitle",
      "label": "어느 게임의 이미지야?",
      "required": false
    },
    {
      "key": "subject",
      "label": "무엇을 그릴까?",
      "required": true
    },
    {
      "key": "visualDetails",
      "label": "어떤 특징이 꼭 보여야 할까?",
      "required": true
    },
    {
      "key": "colors",
      "label": "어떤 색을 쓰고 싶어?",
      "required": true
    },
    {
      "key": "artStyle",
      "label": "어떤 그림 느낌이면 좋을까?",
      "required": true
    },
    {
      "key": "visualDirection",
      "label": "무드보드에서 고른 그림 방향은?",
      "required": false
    },
    {
      "key": "avoidExpressions",
      "label": "피하고 싶은 표현은?",
      "required": false
    },
    {
      "key": "selectionReason",
      "label": "이 표현을 고른 이유는?",
      "required": false
    },
    {
      "key": "priority",
      "label": "그림이 바뀌어도 꼭 남길 것은?",
      "required": false
    }
  ],
  "3": [
    {
      "key": "mainAction",
      "label": "가장 많이 할 행동은?",
      "required": true
    },
    {
      "key": "goal",
      "label": "플레이어가 해낼 일은?",
      "required": true
    },
    {
      "key": "controls",
      "label": "어떤 조작을 쓸까?",
      "required": true
    },
    {
      "key": "rule",
      "label": "핵심 규칙 한 가지는?",
      "required": true
    },
    {
      "key": "win",
      "label": "언제 완료하거나 그만할까?",
      "required": true
    },
    {
      "key": "priority",
      "label": "꼭 보존할 우리 선택은?",
      "required": false
    },
    {
      "key": "gameFile",
      "label": "이번에 사용할 게임 파일은?",
      "required": false
    }
  ],
  "4": [
    {
      "key": "targetScreen",
      "label": "어느 화면을 바꿀까?",
      "required": true
    },
    {
      "key": "currentIssue",
      "label": "지금 무엇이 헷갈려?",
      "required": true
    },
    {
      "key": "wantedChange",
      "label": "어떻게 바꾸고 싶어?",
      "required": true
    },
    {
      "key": "keep",
      "label": "바뀌면 안 되는 것은?",
      "required": true
    },
    {
      "key": "verifyAction",
      "label": "친구에게 무엇을 해보라고 할까?",
      "required": false
    },
    {
      "key": "gameFile",
      "label": "고칠 게임 파일은?",
      "required": false
    }
  ],
  "5": [
    {
      "key": "testResult",
      "label": "이번 테스트 결과는?",
      "required": true,
      "options": [
        "통과",
        "문제 발견",
        "미확인"
      ]
    },
    {
      "key": "reproSteps",
      "label": "어떤 순서로 해봤어?",
      "required": true
    },
    {
      "key": "expected",
      "label": "원래는 어떻게 되어야 해?",
      "required": true
    },
    {
      "key": "actual",
      "label": "실제로는 어떻게 됐어?",
      "required": true
    },
    {
      "key": "keep",
      "label": "고쳐도 그대로 둘 것은?",
      "required": false
    },
    {
      "key": "severity",
      "label": "얼마나 먼저 고칠까?",
      "required": false
    },
    {
      "key": "gameFile",
      "label": "검사한 게임 파일은?",
      "required": false
    },
    {
      "key": "afterCheck",
      "label": "다시 해본 결과는? (고쳤다면 수정 뒤 확인)",
      "required": false
    }
  ],
  "6": [
    {
      "key": "gameTitle",
      "label": "작품 이름은?",
      "required": true
    },
    {
      "key": "origin",
      "label": "어떤 일상 경험에서 시작했어?",
      "required": false
    },
    {
      "key": "mainAction",
      "label": "관람객은 무엇을 해보면 돼?",
      "required": true
    },
    {
      "key": "controls",
      "label": "어떻게 조작해?",
      "required": true
    },
    {
      "key": "chosenThing",
      "label": "우리 팀이 직접 고른 것은?",
      "required": true
    },
    {
      "key": "improvement",
      "label": "친구가 해본 뒤 무엇을 바꿨어?",
      "required": false
    },
    {
      "key": "shareText",
      "label": "한 문장으로 소개한다면?",
      "required": false
    },
    {
      "key": "credits",
      "label": "그림·소리·아이디어는 어디에서 왔어?",
      "required": false
    }
  ]
};
const HASH_ITERATIONS = 210000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['enter', 'submit', 'admin-list', 'admin-detail', 'admin-codes', 'admin-code-set']);
type Obj = Record<string, any>;
class StudentError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new StudentError(status, code, message); };
const bytes = (value: string) => new TextEncoder().encode(value);
const hex = (value: Uint8Array) => Array.from(value, b => b.toString(16).padStart(2, '0')).join('');
async function sha256(value: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(value)))); }
function isWeek(value: unknown): value is number { return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6; }
function week(value: unknown) { if (!isWeek(value)) fail(400, 'INVALID_WEEK', '주차는 1~6으로 선택해 주세요.'); return value as number; }
function id(value: unknown) { if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'INVALID_ID', '제출 항목을 다시 선택해 주세요.'); return value as string; }
function shortText(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length > 80 || !value.trim()) fail(400, 'VALIDATION_ERROR', label + '을(를) 80자 이내로 입력해 주세요.');
  return (value as string).trim();
}
function entryCode(value: unknown) {
  if (typeof value !== 'string') fail(400, 'CODE_REQUIRED', '입장코드를 입력해 주세요.');
  const code = (value as string).normalize('NFC').trim();
  if (!code || code.length > 64) fail(400, 'CODE_REQUIRED', '입장코드는 1~64자로 입력해 주세요.');
  return code;
}
function answers(value: unknown, selectedWeek: number): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'VALIDATION_ERROR', '도구의 응답을 작성해 주세요.');
  const input = value as Obj, result: Obj = {}, fields = TOOL_SCHEMA[selectedWeek];
  if (Object.keys(input).some(key => !fields.some(field => field.key === key))) fail(400, 'VALIDATION_ERROR', '이 주차의 도구 항목만 제출할 수 있습니다.');
  for (const field of fields) {
    const answer = input[field.key] === undefined ? '' : input[field.key];
    if (typeof answer !== 'string' || answer.length > 6000) fail(400, 'VALIDATION_ERROR', field.label + '의 응답을 6,000자 이내로 작성해 주세요.');
    if (field.required && !answer.trim()) fail(400, 'VALIDATION_ERROR', field.label + '을(를) 작성해 주세요.');
    if (answer && field.options && !field.options.includes(answer)) fail(400, 'VALIDATION_ERROR', field.label + '의 선택을 확인해 주세요.');
    result[field.key] = answer;
  }
  if (bytes(JSON.stringify(result)).byteLength > 65536) fail(413, 'TOO_LARGE', '응답이 너무 깁니다. 내용을 줄여 주세요.');
  return result;
}
async function codeHash(code: string, salt: string) {
  const material = await crypto.subtle.importKey('raw', bytes(code), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = Uint8Array.from(salt.match(/.{2}/g) || [], part => parseInt(part, 16));
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: HASH_ITERATIONS }, material, 256);
  return hex(new Uint8Array(derived));
}
function sameHash(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return difference === 0;
}
function opaqueToken() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function adminClient() {
  const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) fail(503, 'CONFIGURATION_REQUIRED', '학생 응답 서버를 준비 중입니다. 잠시 뒤 다시 시도해 주세요.');
  return createClient(url!, service!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
async function rpc(admin: any, action: string, input: Obj = {}, actor: string | null = null, sid: string | null = null): Promise<Obj> {
  const { data, error } = await admin.rpc('student_backend', { p_action: action, p_actor: actor, p_session: sid, p_input: input });
  if (error) {
    let issue: Obj = {}; try { issue = JSON.parse(error.message); } catch { /* Never expose SQL or server secrets. */ }
    if (issue.code && Number.isInteger(issue.status)) fail(issue.status, issue.code, issue.message);
    if (['23514', '23502', '22P02'].includes(error.code)) fail(400, 'VALIDATION_ERROR', '제출 내용을 확인해 주세요.');
    fail(503, 'DATABASE_ERROR', '응답을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }
  return data;
}
async function mentorIdentity(admin: any, token: string) {
  if (!token || token.length > 32768) fail(401, 'AUTH_REQUIRED', '관리자 로그인이 필요합니다.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) fail(401, 'AUTH_REQUIRED', '다시 관리자 계정으로 로그인해 주세요.');
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded));
    if (claims.sub !== data.user.id || !UUID.test(claims.session_id)) throw Error();
    return { actor: data.user.id as string, sid: claims.session_id as string };
  } catch { return fail(401, 'AUTH_REQUIRED', '다시 관리자 계정으로 로그인해 주세요.'); }
}
async function ipHash(request: Request) {
  // Only ingress headers supply the address; never accept it from the request body.
  const address = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
  return await sha256(address);
}
function allowedOrigin(request: Request) {
  const origin = request.headers.get('origin') || '';
  const configured = Deno.env.get('STUDENT_ALLOWED_ORIGINS') || Deno.env.get('PORTAL_ALLOWED_ORIGINS') || 'https://seedcoop.github.io';
  return configured.split(',').map(value => value.trim()).includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : '';
}
function headers(origin: string) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
}
export async function handleRequest(request: Request): Promise<Response> {
  const origin = allowedOrigin(request);
  const json = (value: Obj, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers(origin), 'Content-Type': 'application/json; charset=utf-8' } });
  try {
    if (!origin) fail(403, 'ORIGIN_REJECTED', '학생 응답 페이지에서 다시 시도해 주세요.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    if (request.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', 'POST 요청만 사용할 수 있습니다.');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(415, 'JSON_REQUIRED', 'JSON 요청만 사용할 수 있습니다.');
    if (Number(request.headers.get('content-length') || 0) > 131072) fail(413, 'TOO_LARGE', '입력 내용이 너무 깁니다.');
    const raw = await request.text();
    if (bytes(raw).byteLength > 131072) fail(413, 'TOO_LARGE', '입력 내용이 너무 깁니다.');
    let input: Obj;
    try { input = JSON.parse(raw); } catch { return fail(400, 'INVALID_JSON', '입력 내용을 읽지 못했습니다.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'INVALID_JSON', '입력 내용을 확인해 주세요.');
    if (!ACTIONS.has(input.action)) fail(400, 'UNKNOWN_ACTION', '지원하지 않는 요청입니다.');
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] || '';
    const admin = adminClient();
    if (input.action === 'enter') {
      const selectedWeek = week(input.week), code = entryCode(input.code), addressHash = await ipHash(request);
      const start = await rpc(admin, 'enter-start', { week: selectedWeek, ipHash: addressHash });
      if (start.limited) fail(429, 'RATE_LIMITED', '입장코드 확인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.');
      if (!start.codeHash || !start.codeSalt) fail(403, 'WEEK_CLOSED', '아직 입장할 수 없는 주차입니다. 선생님에게 확인해 주세요.');
      const candidate = await codeHash(code, start.codeSalt);
      if (!sameHash(candidate, start.codeHash)) {
        await rpc(admin, 'enter-failure', { attemptId: start.attemptId, ipHash: addressHash });
        fail(401, 'INVALID_CODE', '입장코드를 확인해 주세요.');
      }
      const sessionToken = opaqueToken();
      const result = await rpc(admin, 'enter-finish', { week: selectedWeek, revision: start.revision, attemptId: start.attemptId, ipHash: addressHash, tokenHash: await sha256(sessionToken) });
      return json({ ok: true, session: { token: sessionToken, week: selectedWeek, expiresAt: result.expiresAt } });
    }
    if (input.action === 'submit') {
      if (!TOKEN.test(token)) fail(401, 'SESSION_EXPIRED', '입장 시간이 끝났습니다. 주차와 입장코드를 다시 입력해 주세요.');
      const selectedWeek = week(input.week), team = shortText(input.team, '팀명'), name = shortText(input.name, '이름');
      const cleanAnswers = answers(input.answers, selectedWeek), submissionId = id(input.submissionId), output = input.output === undefined ? '' : input.output;
      if (typeof output !== 'string' || output.length > 24000) fail(400, 'VALIDATION_ERROR', '정리한 결과를 24,000자 이내로 작성해 주세요.');
      return json(await rpc(admin, 'submit', { week: selectedWeek, tokenHash: await sha256(token), team, name, answers: cleanAnswers, output, submissionId }));
    }
    const identity = await mentorIdentity(admin, token);
    let adminInput: Obj = {};
    if (input.action === 'admin-list') {
      if (input.week !== undefined && input.week !== '') adminInput.week = week(input.week);
    }
    if (input.action === 'admin-detail') adminInput.id = id(input.id);
    if (input.action === 'admin-code-set') {
      adminInput = { week: week(input.week), active: input.active };
      if (typeof input.active !== 'boolean') fail(400, 'VALIDATION_ERROR', '입장 허용 여부를 확인해 주세요.');
      if (input.code !== undefined && input.code !== '') {
        const code = entryCode(input.code), salt = hex(crypto.getRandomValues(new Uint8Array(32)));
        adminInput.codeSalt = salt; adminInput.codeHash = await codeHash(code, salt);
      }
    }
    return json(await rpc(admin, input.action, adminInput, identity.actor, identity.sid));
  } catch (error) {
    if (error instanceof StudentError) return json({ ok: false, error: { code: error.code, message: error.message } }, error.status);
    return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' } }, 500);
  }
}
Deno.serve(handleRequest);
