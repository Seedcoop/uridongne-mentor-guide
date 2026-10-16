-- Accountless access is limited to week-scoped student tools. It never creates
-- auth.users or grants access to the mentor portal. Codes are configured through
-- its admin API after deployment, as private salted PBKDF2 hashes only.
create table private.student_week_codes (
 week integer primary key check(week between 1 and 6),
 code_salt text check(code_salt ~ '^[0-9a-f]{64}$'),
 code_hash text check(code_hash ~ '^[0-9a-f]{64}$'),
 active boolean not null default false,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id) on delete restrict,
 check((code_salt is null)=(code_hash is null)),
 check(not active or code_hash is not null)
);
insert into private.student_week_codes(week) select generate_series(1,6);

create table private.student_entry_attempts (
 id uuid primary key default gen_random_uuid(), week integer not null check(week between 1 and 6),
 ip_hash text not null check(ip_hash ~ '^[0-9a-f]{64}$'),
 failed boolean not null default false, created_at timestamptz not null default now()
);
create index student_attempts_ip on private.student_entry_attempts(ip_hash,created_at);
create table private.student_sessions (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 week integer not null references private.student_week_codes(week),
 code_revision integer not null check(code_revision>0),
 created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index student_sessions_expiry on private.student_sessions(expires_at);
create table private.student_submissions (
 id uuid primary key default gen_random_uuid(),
 -- A hash, not a reusable bearer token. No FK: expired sessions can be pruned
 -- without deleting an append-only educational submission.
 session_token_hash text not null check(session_token_hash ~ '^[0-9a-f]{64}$'),
 client_submission_id uuid not null,
 week integer not null check(week between 1 and 6),
 team text not null check(length(trim(team)) between 1 and 80),
 name text not null check(length(trim(name)) between 1 and 80),
 answers jsonb not null check(jsonb_typeof(answers)='object' and octet_length(answers::text)<=65536),
 output text not null default '' check(length(output)<=24000),
 submitted_at timestamptz not null default now(),
 unique(session_token_hash,client_submission_id)
);
create index student_submissions_week_time on private.student_submissions(week,submitted_at desc,id);
create index student_submissions_session_time on private.student_submissions(session_token_hash,submitted_at);

alter table private.student_week_codes enable row level security;
alter table private.student_entry_attempts enable row level security;
alter table private.student_sessions enable row level security;
alter table private.student_submissions enable row level security;
-- No policies. The browser cannot directly read or mutate any student table,
-- including through an ordinary authenticated mentor JWT. The owner RPC below
-- is the sole service API; service_role also receives no direct table grants.
revoke all on private.student_week_codes,private.student_entry_attempts,private.student_sessions,private.student_submissions from public,anon,authenticated,service_role;

create function private.student_validate_answers(p_week integer, p_answers jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare schema jsonb := '{"1":[{"key":"teamName","label":"팀 이름(정해졌다면)","required":false},{"key":"gameTitle","label":"내 게임의 임시 이름은?","required":false},{"key":"place","label":"어디에서 있었던 일이야?","required":true},{"key":"moment","label":"그곳에서 무슨 일이 있었어?","required":true},{"key":"mainAction","label":"플레이어는 무엇을 하게 될까?","required":true},{"key":"goal","label":"무엇을 해내면 한 판이 끝날까?","required":true},{"key":"selectionReason","label":"내가 이 생각을 고른 이유는?","required":true},{"key":"priority","label":"이 아이디어에서 꼭 남기고 싶은 것은?","required":false}],"2":[{"key":"gameTitle","label":"어느 게임의 이미지야?","required":false},{"key":"subject","label":"무엇을 그릴까?","required":true},{"key":"visualDetails","label":"어떤 특징이 꼭 보여야 할까?","required":true},{"key":"colors","label":"어떤 색을 쓰고 싶어?","required":true},{"key":"artStyle","label":"어떤 그림 느낌이면 좋을까?","required":true},{"key":"visualDirection","label":"무드보드에서 고른 그림 방향은?","required":false},{"key":"avoidExpressions","label":"피하고 싶은 표현은?","required":false},{"key":"selectionReason","label":"이 표현을 고른 이유는?","required":false},{"key":"priority","label":"그림이 바뀌어도 꼭 남길 것은?","required":false}],"3":[{"key":"mainAction","label":"가장 많이 할 행동은?","required":true},{"key":"goal","label":"플레이어가 해낼 일은?","required":true},{"key":"controls","label":"어떤 조작을 쓸까?","required":true},{"key":"rule","label":"핵심 규칙 한 가지는?","required":true},{"key":"win","label":"언제 완료하거나 그만할까?","required":true},{"key":"priority","label":"꼭 보존할 우리 선택은?","required":false},{"key":"gameFile","label":"이번에 사용할 게임 파일은?","required":false}],"4":[{"key":"targetScreen","label":"어느 화면을 바꿀까?","required":true},{"key":"currentIssue","label":"지금 무엇이 헷갈려?","required":true},{"key":"wantedChange","label":"어떻게 바꾸고 싶어?","required":true},{"key":"keep","label":"바뀌면 안 되는 것은?","required":true},{"key":"verifyAction","label":"친구에게 무엇을 해보라고 할까?","required":false},{"key":"gameFile","label":"고칠 게임 파일은?","required":false}],"5":[{"key":"testResult","label":"이번 테스트 결과는?","required":true,"options":["통과","문제 발견","미확인"]},{"key":"reproSteps","label":"어떤 순서로 해봤어?","required":true},{"key":"expected","label":"원래는 어떻게 되어야 해?","required":true},{"key":"actual","label":"실제로는 어떻게 됐어?","required":true},{"key":"keep","label":"고쳐도 그대로 둘 것은?","required":false},{"key":"severity","label":"얼마나 먼저 고칠까?","required":false},{"key":"gameFile","label":"검사한 게임 파일은?","required":false},{"key":"afterCheck","label":"다시 해본 결과는? (고쳤다면 수정 뒤 확인)","required":false}],"6":[{"key":"gameTitle","label":"작품 이름은?","required":true},{"key":"origin","label":"어떤 일상 경험에서 시작했어?","required":false},{"key":"mainAction","label":"관람객은 무엇을 해보면 돼?","required":true},{"key":"controls","label":"어떻게 조작해?","required":true},{"key":"chosenThing","label":"우리 팀이 직접 고른 것은?","required":true},{"key":"improvement","label":"친구가 해본 뒤 무엇을 바꿨어?","required":false},{"key":"shareText","label":"한 문장으로 소개한다면?","required":false},{"key":"credits","label":"그림·소리·아이디어는 어디에서 왔어?","required":false}]}'::jsonb; fields jsonb; field jsonb; pair record; value text; result jsonb:='{}';
begin
 if p_week not between 1 and 6 or p_week is null then perform private.portal_fail('INVALID_WEEK',400,'주차는 1~6으로 선택해 주세요.'); end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'object' then perform private.portal_fail('VALIDATION_ERROR',400,'도구의 응답을 작성해 주세요.'); end if;
 if octet_length(p_answers::text)>65536 then perform private.portal_fail('TOO_LARGE',413,'응답이 너무 깁니다. 내용을 줄여 주세요.'); end if;
 fields:=schema->p_week::text;
 for pair in select * from jsonb_each(p_answers) loop
  if not exists(select 1 from jsonb_array_elements(fields) f where f->>'key'=pair.key)
   or jsonb_typeof(pair.value)<>'string' then perform private.portal_fail('VALIDATION_ERROR',400,'이 주차의 도구 응답만 제출할 수 있습니다.'); end if;
 end loop;
 for field in select * from jsonb_array_elements(fields) loop
  value:=coalesce(p_answers->>(field->>'key'),'');
  if length(value)>6000 then perform private.portal_fail('VALIDATION_ERROR',400,(field->>'label')||'의 응답을 6,000자 이내로 작성해 주세요.'); end if;
  if (field->>'required')::boolean and length(trim(value))=0 then perform private.portal_fail('VALIDATION_ERROR',400,(field->>'label')||'을(를) 작성해 주세요.'); end if;
  if length(value)>0 and field ? 'options' and not (field->'options' ? value) then perform private.portal_fail('VALIDATION_ERROR',400,(field->>'label')||'의 선택을 확인해 주세요.'); end if;
  result:=result||jsonb_build_object(field->>'key',value);
 end loop;
 return result;
end$$;
create function private.student_codes_json() returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('week',c.week,'active',c.active,'configured',c.code_hash is not null,'revision',c.revision,'updatedAt',c.updated_at) order by c.week),'[]')
 from private.student_week_codes c
$$;
create function private.student_receipt_json(r private.student_submissions) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',r.id,'week',r.week,'submittedAt',r.submitted_at)
$$;
create function private.student_append_only() returns trigger language plpgsql set search_path='' as $$begin
 perform private.portal_fail('APPEND_ONLY',403,'이미 제출한 학생 응답은 수정하거나 삭제할 수 없습니다.');
 return null;
end$$;
create trigger student_submissions_append_only before update or delete on private.student_submissions
 for each row execute function private.student_append_only();
revoke all on function private.student_validate_answers(integer,jsonb),private.student_codes_json(),private.student_receipt_json(private.student_submissions),private.student_append_only() from public,anon,authenticated,service_role;

create function public.student_backend(p_action text, p_actor uuid default null, p_session uuid default null, p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare actor public.profiles; config private.student_week_codes; attempt private.student_entry_attempts;
 session private.student_sessions; submission private.student_submissions; rows_json jsonb;
 selected_week integer; clean_answers jsonb; entry_id uuid; submitted_id uuid; v_token_hash text; v_ip_hash text;
 clean_team text; clean_name text; clean_output text; cut timestamptz:=now()-interval '15 minutes';
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' then perform private.portal_fail('INVALID_INPUT',400,'입력 내용을 확인해 주세요.'); end if;
 if p_action in ('enter-start','enter-finish','submit','admin-code-set') then
  if coalesce(p_input->>'week','') !~ '^[1-6]$' then perform private.portal_fail('INVALID_WEEK',400,'주차는 1~6으로 선택해 주세요.'); end if;
  selected_week:=(p_input->>'week')::integer;
 end if;
 if p_action='enter-start' then
  v_ip_hash:=p_input->>'ipHash';
  if v_ip_hash is null or v_ip_hash !~ '^[0-9a-f]{64}$' then perform private.portal_fail('INVALID_INPUT',400,'입장 요청을 다시 시도해 주세요.'); end if;
  -- Count failed attempts separately from concurrent valid classroom entries.
  -- A bounded pending budget still prevents unlimited parallel hash work.
  perform pg_advisory_xact_lock(hashtextextended(v_ip_hash,106160003));
  delete from private.student_entry_attempts where created_at<cut or (not failed and created_at<now()-interval '1 minute');
  if (select count(*) from private.student_entry_attempts a where a.ip_hash=v_ip_hash and a.week=selected_week and a.failed)>=20
   or (select count(*) from private.student_entry_attempts a where a.ip_hash=v_ip_hash and a.failed)>=200
   or (select count(*) from private.student_entry_attempts a where a.ip_hash=v_ip_hash and not a.failed)>=100 then
   return jsonb_build_object('limited',true);
  end if;
  select * into config from private.student_week_codes where week=selected_week and active and code_hash is not null;
  if not found then perform private.portal_fail('WEEK_CLOSED',403,'아직 입장할 수 없는 주차입니다. 선생님에게 확인해 주세요.'); end if;
  insert into private.student_entry_attempts(week,ip_hash) values(selected_week,v_ip_hash) returning id into entry_id;
  -- This response is returned only to the service-role Edge Function.
  return jsonb_build_object('attemptId',entry_id,'codeHash',config.code_hash,'codeSalt',config.code_salt,'revision',config.revision);
 end if;
 if p_action='enter-failure' then
  update private.student_entry_attempts a set failed=true where a.id=(p_input->>'attemptId')::uuid and a.ip_hash=p_input->>'ipHash';
  return jsonb_build_object('ok',true);
 end if;
 if p_action='enter-finish' then
  -- Hold the code row while registering its capability. Rotation cannot leave
  -- an authorized session associated with a different code revision.
  select * into config from private.student_week_codes where week=selected_week for share;
  if not config.active or config.code_hash is null or config.revision is distinct from (p_input->>'revision')::integer then perform private.portal_fail('WEEK_CLOSED',403,'입장코드가 변경되었습니다. 새 코드로 다시 입장해 주세요.'); end if;
  select * into attempt from private.student_entry_attempts a where a.id=(p_input->>'attemptId')::uuid and a.week=selected_week and a.ip_hash=p_input->>'ipHash' and not a.failed and a.created_at>now()-interval '1 minute' for update;
  if not found then perform private.portal_fail('INVALID_CODE',401,'입장코드를 다시 입력해 주세요.'); end if;
  v_token_hash:=p_input->>'tokenHash';
  if v_token_hash is null or v_token_hash !~ '^[0-9a-f]{64}$' then perform private.portal_fail('INVALID_INPUT',400,'입장 요청을 다시 시도해 주세요.'); end if;
  delete from private.student_sessions s where s.expires_at<now();
  insert into private.student_sessions(token_hash,week,code_revision,expires_at)
   values(v_token_hash,selected_week,config.revision,now()+interval '4 hours') returning * into session;
  delete from private.student_entry_attempts a where a.id=attempt.id;
  return jsonb_build_object('ok',true,'expiresAt',session.expires_at);
 end if;
 if p_action='submit' then
  v_token_hash:=p_input->>'tokenHash';
  if v_token_hash is null or v_token_hash !~ '^[0-9a-f]{64}$' then perform private.portal_fail('SESSION_EXPIRED',401,'입장코드를 다시 입력해 주세요.'); end if;
  -- Lock code before session, matching rotation's order to avoid a deadlock.
  select * into config from private.student_week_codes where week=selected_week for share;
  select s.* into session from private.student_sessions s
   where s.token_hash=v_token_hash and s.expires_at>now() for share;
  if not found then perform private.portal_fail('SESSION_EXPIRED',401,'입장 시간이 끝났거나 코드가 바뀌었습니다. 다시 입장해 주세요.'); end if;
  if session.week<>selected_week then perform private.portal_fail('WEEK_MISMATCH',403,'입장한 주차의 도구만 제출할 수 있습니다.'); end if;
  if not config.active or config.code_hash is null or session.code_revision<>config.revision then perform private.portal_fail('SESSION_EXPIRED',401,'입장 시간이 끝났거나 코드가 바뀌었습니다. 다시 입장해 주세요.'); end if;
  clean_team:=trim(coalesce(p_input->>'team',''));clean_name:=trim(coalesce(p_input->>'name',''));clean_output:=coalesce(p_input->>'output','');
  if jsonb_typeof(p_input->'team') is distinct from 'string' or jsonb_typeof(p_input->'name') is distinct from 'string'
   or length(clean_team) not between 1 and 80 or length(clean_name) not between 1 and 80
   or (p_input ? 'output' and jsonb_typeof(p_input->'output')<>'string') or length(clean_output)>24000 then perform private.portal_fail('VALIDATION_ERROR',400,'팀명과 이름, 정리한 결과를 확인해 주세요.'); end if;
  clean_answers:=private.student_validate_answers(selected_week,p_input->'answers');
  if coalesce(p_input->>'submissionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform private.portal_fail('INVALID_ID',400,'제출 요청을 다시 시도해 주세요.'); end if;
  submitted_id:=(p_input->>'submissionId')::uuid;
  -- Serialize retries and rate checks per opaque session, never globally by a
  -- client-controlled UUID. A duplicate cannot disclose another session's row.
  perform pg_advisory_xact_lock(hashtextextended(v_token_hash,106160004));
  select * into submission from private.student_submissions r where r.session_token_hash=v_token_hash and r.client_submission_id=submitted_id;
  if found then
   if submission.week<>selected_week or submission.team<>clean_team or submission.name<>clean_name or submission.answers<>clean_answers or submission.output<>clean_output then perform private.portal_fail('IDEMPOTENCY_CONFLICT',409,'같은 제출 요청의 내용이 바뀌었습니다. 새 제출로 다시 시도해 주세요.'); end if;
   return jsonb_build_object('ok',true,'receipt',private.student_receipt_json(submission));
  end if;
  if (select count(*) from private.student_submissions r where r.session_token_hash=v_token_hash and r.submitted_at>cut)>=30
   or (select count(*) from private.student_submissions r where r.session_token_hash=v_token_hash)>=100 then perform private.portal_fail('RATE_LIMITED',429,'제출 시도가 많습니다. 잠시 뒤 다시 시도해 주세요.'); end if;
  insert into private.student_submissions(session_token_hash,client_submission_id,week,team,name,answers,output)
   values(v_token_hash,submitted_id,selected_week,clean_team,clean_name,clean_answers,clean_output) returning * into submission;
  return jsonb_build_object('ok',true,'receipt',private.student_receipt_json(submission));
 end if;
 if p_action not in ('admin-list','admin-detail','admin-codes','admin-code-set') then perform private.portal_fail('UNKNOWN_ACTION',400,'지원하지 않는 요청입니다.'); end if;
 -- The existing portal session must still be registered, active, and current.
 -- A Supabase user JWT by itself is not sufficient administrator authority.
 actor:=private.portal_actor(p_actor,p_session);
 if actor.role<>'admin' then perform private.portal_fail('FORBIDDEN',403,'관리자만 학생 응답을 확인할 수 있습니다.'); end if;
 if p_action='admin-codes' then return jsonb_build_object('ok',true,'codes',private.student_codes_json()); end if;
 if p_action='admin-code-set' then
  if jsonb_typeof(p_input->'active') is distinct from 'boolean' then perform private.portal_fail('INVALID_INPUT',400,'입장 허용 여부를 확인해 주세요.'); end if;
  select * into config from private.student_week_codes where week=selected_week for update;
  if p_input ? 'codeHash' or p_input ? 'codeSalt' then
   if coalesce(p_input->>'codeHash','') !~ '^[0-9a-f]{64}$' or coalesce(p_input->>'codeSalt','') !~ '^[0-9a-f]{64}$' then perform private.portal_fail('INVALID_INPUT',400,'새 입장코드를 다시 입력해 주세요.'); end if;
   config.code_hash:=p_input->>'codeHash';config.code_salt:=p_input->>'codeSalt';
  end if;
  if (p_input->>'active')::boolean and config.code_hash is null then perform private.portal_fail('CODE_REQUIRED',400,'먼저 입장코드를 정해 주세요.'); end if;
  update private.student_week_codes c set code_hash=config.code_hash,code_salt=config.code_salt,active=(p_input->>'active')::boolean,
   revision=c.revision+1,updated_at=clock_timestamp(),updated_by=actor.id where c.week=selected_week;
  delete from private.student_sessions s where s.week=selected_week;
  return jsonb_build_object('ok',true,'codes',private.student_codes_json());
 end if;
 if p_action='admin-list' then
  if nullif(p_input->>'week','') is not null then
   if p_input->>'week' !~ '^[1-6]$' then perform private.portal_fail('INVALID_WEEK',400,'주차는 1~6으로 선택해 주세요.'); end if;
   selected_week:=(p_input->>'week')::integer;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'week',r.week,'team',r.team,'name',r.name,'submittedAt',r.submitted_at) order by r.submitted_at desc,r.id),'[]') into rows_json
   from (select s.* from private.student_submissions s where selected_week is null or s.week=selected_week order by s.submitted_at desc,s.id limit 1000) r;
  return jsonb_build_object('ok',true,'submissions',rows_json,'truncated',(select count(*)>1000 from private.student_submissions s where selected_week is null or s.week=selected_week));
 end if;
 if p_action='admin-detail' then
  select * into submission from private.student_submissions r where r.id=(p_input->>'id')::uuid;
  if not found then perform private.portal_fail('NOT_FOUND',404,'제출한 응답을 찾을 수 없습니다.'); end if;
  return jsonb_build_object('ok',true,'submission',private.student_receipt_json(submission)||jsonb_build_object('team',submission.team,'name',submission.name,'answers',submission.answers,'output',submission.output));
 end if;
 perform private.portal_fail('UNKNOWN_ACTION',400,'지원하지 않는 요청입니다.');return null;
end$$;
revoke all on function public.student_backend(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.student_backend(text,uuid,uuid,jsonb) to service_role;
