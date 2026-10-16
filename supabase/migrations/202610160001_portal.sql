-- GitHub Pages portal. Auth credentials never belong in public tables.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 username text not null unique check(username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
 name text not null check(length(name) between 1 and 80), team text not null default '' check(length(team)<=80),
 role text not null default 'mentor' check(role in ('mentor','admin')),
 active boolean not null default true, must_change_password boolean not null default true,
 auth_version integer not null default 1 check(auth_version>0),
 created_at bigint not null default (extract(epoch from now())*1000)::bigint,
 updated_at bigint not null default (extract(epoch from now())*1000)::bigint
);
create table private.portal_identities (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 auth_email text not null unique, pending_operation uuid, pending_since timestamptz
);
create table private.portal_sessions (
 session_id uuid primary key references auth.sessions(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 auth_version integer not null, expires_at timestamptz not null default now()+interval '12 hours'
);
create index portal_sessions_user on private.portal_sessions(user_id);
create table private.portal_login_attempts (
 id uuid primary key default gen_random_uuid(), username text not null, ip_hash text not null,
 created_at timestamptz not null default now()
);
create index portal_attempts_pair on private.portal_login_attempts(username,ip_hash,created_at);
create index portal_attempts_ip on private.portal_login_attempts(ip_hash,created_at);
alter table private.portal_identities enable row level security;
alter table private.portal_sessions enable row level security;
alter table private.portal_login_attempts enable row level security;
create table public.records (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete restrict,
 kind text not null check(kind in ('plan','log')), week integer not null check(week between 1 and 6),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object' and octet_length(data::text)<=65536),
 status text not null default 'draft' check(status in ('draft','submitted','revision_requested','reviewed')),
 feedback text not null default '' check(length(feedback)<=4000), version integer not null default 1 check(version>0),
 created_at bigint not null default (extract(epoch from now())*1000)::bigint,
 updated_at bigint not null default (extract(epoch from now())*1000)::bigint, submitted_at bigint
);
create index records_author_updated on public.records(author_id,updated_at desc);
create index records_filter on public.records(week,kind,status);

create function private.portal_fail(code text, status integer, message text, extra jsonb default '{}') returns void
language plpgsql set search_path='' as $$begin
 raise exception using errcode='P0001', message=jsonb_build_object('code',code,'status',status,'message',message,'extra',extra)::text;
end$$;
create function private.portal_user_json(p public.profiles) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'username',p.username,'name',p.name,'team',p.team,'role',p.role,'active',p.active,'mustChangePassword',p.must_change_password)
$$;
create function private.portal_record_json(r public.records) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'kind',r.kind,'week',r.week,'data',r.data,'status',r.status,'feedback',r.feedback,'version',r.version,'createdAt',r.created_at,'updatedAt',r.updated_at,'submittedAt',r.submitted_at,'authorName',p.name,'authorTeam',p.team)
 from public.profiles p where p.id=r.author_id
$$;
create function private.portal_actor(actor uuid, sid uuid, allow_password boolean default false) returns public.profiles
language plpgsql security definer set search_path='' as $$declare p public.profiles; begin
 select u.* into p from public.profiles u join private.portal_sessions s on s.user_id=u.id
 join auth.sessions a on a.id=s.session_id and a.user_id=u.id
 join private.portal_identities i on i.user_id=u.id
 where u.id=actor and s.session_id=sid and s.auth_version=u.auth_version and s.expires_at>now() and u.active and i.pending_operation is null
 for share of u;
 if not found then perform private.portal_fail('AUTH_REQUIRED',401,'로그인이 만료되었습니다. 다시 로그인해 주세요.'); end if;
 if p.must_change_password and not allow_password then perform private.portal_fail('PASSWORD_CHANGE_REQUIRED',403,'임시 비밀번호를 먼저 변경해 주세요.'); end if;
 return p;
end$$;
create function private.portal_can_read(owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join private.portal_sessions s on s.user_id=p.id
 join auth.sessions a on a.id=s.session_id and a.user_id=p.id join private.portal_identities i on i.user_id=p.id
 where p.id=(select auth.uid()) and s.session_id=nullif((select auth.jwt())->>'session_id','')::uuid
 and s.auth_version=p.auth_version and s.expires_at>now() and p.active and not p.must_change_password and i.pending_operation is null
 and (p.id=owner_id or p.role='admin'))
$$;
revoke all on all functions in schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.portal_can_read(uuid) to authenticated;
alter table public.profiles enable row level security;
alter table public.records enable row level security;
revoke all on public.profiles, public.records from anon, authenticated;
grant select on public.profiles,public.records to authenticated;
create policy portal_profiles_read on public.profiles for select to authenticated using(private.portal_can_read(id));
create policy portal_records_read on public.records for select to authenticated using(private.portal_can_read(author_id));
-- No client insert/update/delete grants or policies. Every mutation uses the service-only RPC below.

create function public.portal_backend(p_action text, p_actor uuid default null, p_session uuid default null, p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target public.profiles; r public.records; result jsonb; rows_json jsonb; ident private.portal_identities;
 stamp bigint:=(extract(epoch from clock_timestamp())*1000)::bigint; rid uuid; requested_role text; requested_active boolean; op uuid;
begin
 if jsonb_typeof(p_input)<>'object' then perform private.portal_fail('INVALID_INPUT',400,'입력 내용을 확인해 주세요.'); end if;
 if p_action='login-start' then
  -- Serialize rate reservations; not a check-then-insert race.
  perform pg_advisory_xact_lock(106160001);
  delete from private.portal_login_attempts where created_at<now()-interval '15 minutes';
  if (select count(*) from private.portal_login_attempts where username=p_input->>'username' and ip_hash=p_input->>'ipHash')>=5
   or (select count(*) from private.portal_login_attempts where ip_hash=p_input->>'ipHash')>=50 then
   return jsonb_build_object('limited',true);
  end if;
  insert into private.portal_login_attempts(username,ip_hash) values(p_input->>'username',p_input->>'ipHash');
  select p.* into target from public.profiles p join private.portal_identities i on i.user_id=p.id where p.username=p_input->>'username' and p.active and i.pending_operation is null;
  if not found then return jsonb_build_object('account',null); end if;
  select * into ident from private.portal_identities where user_id=target.id;
  return jsonb_build_object('account',private.portal_user_json(target),'email',ident.auth_email,'authVersion',target.auth_version);
 end if;
 if p_action='login-finish' then
  select * into target from public.profiles where id=p_actor and active and auth_version=(p_input->>'authVersion')::integer for share;
  if not found or exists(select 1 from private.portal_identities where user_id=p_actor and pending_operation is not null)
   or not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor) then perform private.portal_fail('AUTH_CHANGED',401,'계정 상태가 변경되었습니다. 다시 로그인해 주세요.'); end if;
  insert into private.portal_sessions(session_id,user_id,auth_version) values(p_session,p_actor,target.auth_version)
  on conflict(session_id) do nothing;
  delete from private.portal_login_attempts where username=target.username and ip_hash=p_input->>'ipHash';
  return jsonb_build_object('ok',true,'user',private.portal_user_json(target));
 end if;
 if p_action='logout' then
  delete from private.portal_sessions where session_id=p_session and user_id=p_actor;
  return jsonb_build_object('ok',true);
 end if;
 if p_action in ('account-create','account-update','credentials-begin','credentials-finish','credentials-abort') then
  perform pg_advisory_xact_lock(106160002);
 end if;
 if p_action='credentials-finish' or p_action='credentials-abort' then
  -- A one-use operation capability is issued only after authorization in credentials-begin.
  select * into ident from private.portal_identities where user_id=p_actor and pending_operation=(p_input->>'operation')::uuid for update;
  if not found then perform private.portal_fail('AUTH_CHANGED',409,'비밀번호 변경 상태가 바뀌었습니다. 다시 시도해 주세요.'); end if;
  if p_action='credentials-finish' then update public.profiles set must_change_password=(p_input->>'mustChangePassword')::boolean,updated_at=stamp where id=p_actor; end if;
  update private.portal_identities set pending_operation=null,pending_since=null where user_id=p_actor;
  return jsonb_build_object('ok',true);
 end if;
 actor:=private.portal_actor(p_actor,p_session,p_action in ('me','identity','credentials-begin'));
 if p_action='me' then return jsonb_build_object('ok',true,'user',private.portal_user_json(actor),'needsSetup',false,'canSetup',false,'canRecover',false); end if;
 if p_action in ('records','admin-records','export') then
  if p_action<>'records' and actor.role<>'admin' then perform private.portal_fail('FORBIDDEN',403,'관리자만 이용할 수 있습니다.'); end if;
  select coalesce(jsonb_agg(private.portal_record_json(q) order by q.updated_at desc,q.id),'[]') into rows_json from public.records q
   where (p_action<>'records' or q.author_id=actor.id)
   and (nullif(p_input->>'week','') is null or q.week=(p_input->>'week')::integer)
   and (nullif(coalesce(p_input->>'kind',p_input->>'type'),'') is null or q.kind=coalesce(p_input->>'kind',p_input->>'type'))
   and (nullif(p_input->>'status','') is null or q.status=p_input->>'status');
  return jsonb_build_object('ok',true,'records',rows_json);
 end if;
 if p_action='record' then
  select * into r from public.records where id=(p_input->>'id')::uuid;
  if not found then perform private.portal_fail('NOT_FOUND',404,'기록을 찾을 수 없습니다.'); end if;
  if r.author_id<>actor.id and actor.role<>'admin' then perform private.portal_fail('FORBIDDEN',403,'다른 멘토의 기록에는 접근할 수 없습니다.'); end if;
  return jsonb_build_object('ok',true,'record',private.portal_record_json(r));
 end if;
 if p_action in ('save','submit') then
  if p_input->>'kind' not in ('plan','log') or (p_input->>'week')::integer not between 1 and 6 or jsonb_typeof(p_input->'data')<>'object' then perform private.portal_fail('INVALID_INPUT',400,'기록 종류·회차·입력을 확인해 주세요.'); end if;
  if nullif(p_input->'data'->>'session','') is not null and (p_input->'data'->>'session')::integer<>(p_input->>'week')::integer then perform private.portal_fail('WEEK_MISMATCH',400,'기록의 교육 회차와 선택한 회차가 다릅니다.'); end if;
  if nullif(p_input->>'id','') is null then
   insert into public.records(author_id,kind,week,data,status,submitted_at) values(actor.id,p_input->>'kind',(p_input->>'week')::integer,p_input->'data',case when p_action='submit' then 'submitted' else 'draft' end,case when p_action='submit' then stamp end) returning * into r;
  else
   select * into r from public.records where id=(p_input->>'id')::uuid for update;
   if not found then perform private.portal_fail('NOT_FOUND',404,'기록을 찾을 수 없습니다.'); end if;
   if r.author_id<>actor.id then perform private.portal_fail('FORBIDDEN',403,'다른 멘토의 기록은 수정할 수 없습니다.'); end if;
   if r.kind<>p_input->>'kind' or r.week<>(p_input->>'week')::integer then perform private.portal_fail('RECORD_IDENTITY_CHANGED',400,'기존 기록의 종류와 회차는 바꿀 수 없습니다.'); end if;
   if r.status not in ('draft','revision_requested') then perform private.portal_fail('RECORD_LOCKED',409,'제출한 기록은 보완 요청을 받았을 때 수정할 수 있습니다.',jsonb_build_object('record',private.portal_record_json(r))); end if;
   if (p_input->>'version')::integer is distinct from r.version then perform private.portal_fail('VERSION_CONFLICT',409,'다른 창에서 기록이 바뀌었습니다. 최신 기록을 확인해 주세요.',jsonb_build_object('record',private.portal_record_json(r))); end if;
   update public.records set data=p_input->'data',status=case when p_action='submit' then 'submitted' else status end,version=version+1,updated_at=stamp,submitted_at=case when p_action='submit' then stamp else submitted_at end where id=r.id returning * into r;
  end if;
  return jsonb_build_object('ok',true,'record',private.portal_record_json(r));
 end if;
 if p_action='credentials-begin' then
  rid:=coalesce(nullif(p_input->>'id','')::uuid,actor.id);
  if rid<>actor.id and actor.role<>'admin' then perform private.portal_fail('FORBIDDEN',403,'관리자만 비밀번호를 초기화할 수 있습니다.'); end if;
  if rid=actor.id and p_input->>'intent'='reset' then perform private.portal_fail('SELF_RESET',403,'내 비밀번호는 비밀번호 변경에서 바꿔 주세요.'); end if;
  if rid<>actor.id and actor.must_change_password then perform private.portal_fail('PASSWORD_CHANGE_REQUIRED',403,'임시 비밀번호를 먼저 변경해 주세요.'); end if;
  select * into target from public.profiles where id=rid for update;
  if not found then perform private.portal_fail('NOT_FOUND',404,'계정을 찾을 수 없습니다.'); end if;
  select * into ident from private.portal_identities where user_id=rid for update;
  if ident.pending_operation is not null then perform private.portal_fail('CHANGE_IN_PROGRESS',409,'이 계정의 비밀번호를 변경 중입니다. 잠시 뒤 다시 시도해 주세요.'); end if;
  op:=gen_random_uuid();
  update private.portal_identities set pending_operation=op,pending_since=now() where user_id=rid;
  update public.profiles set auth_version=auth_version+1,updated_at=stamp where id=rid;
  delete from private.portal_sessions where user_id=rid;
  return jsonb_build_object('ok',true,'id',rid,'email',ident.auth_email,'operation',op);
 end if;
 if p_action='identity' then
  select * into ident from private.portal_identities where user_id=actor.id;
  return jsonb_build_object('ok',true,'email',ident.auth_email);
 end if;
 if actor.role<>'admin' then perform private.portal_fail('FORBIDDEN',403,'관리자만 이용할 수 있습니다.'); end if;
 if p_action='review' then
  if p_input->>'status' not in ('reviewed','revision_requested') then perform private.portal_fail('INVALID_STATUS',400,'검토 결과를 확인해 주세요.'); end if;
  if length(coalesce(p_input->>'feedback',''))>4000 or (p_input->>'status'='revision_requested' and length(trim(coalesce(p_input->>'feedback','')))=0) then perform private.portal_fail('INVALID_FEEDBACK',400,'보완 요청에는 피드백을 작성해 주세요.'); end if;
  select * into r from public.records where id=(p_input->>'id')::uuid for update;
  if not found then perform private.portal_fail('NOT_FOUND',404,'기록을 찾을 수 없습니다.'); end if;
  if r.status='draft' then perform private.portal_fail('NOT_SUBMITTED',409,'제출된 기록만 검토할 수 있습니다.'); end if;
  if (p_input->>'version')::integer is distinct from r.version then perform private.portal_fail('VERSION_CONFLICT',409,'다른 창에서 검토가 바뀌었습니다. 최신 기록을 확인해 주세요.',jsonb_build_object('record',private.portal_record_json(r))); end if;
  update public.records set status=p_input->>'status',feedback=coalesce(p_input->>'feedback',''),version=version+1,updated_at=stamp where id=r.id returning * into r;
  return jsonb_build_object('ok',true,'record',private.portal_record_json(r));
 end if;
 if p_action='accounts' then
  select coalesce(jsonb_agg(private.portal_user_json(p) order by p.created_at,p.id),'[]') into rows_json from public.profiles p;
  return jsonb_build_object('ok',true,'accounts',rows_json);
 end if;
 if p_action='account-create' then
  if p_input->>'role' not in ('mentor','admin') then perform private.portal_fail('INVALID_ROLE',400,'계정 권한을 확인해 주세요.'); end if;
  insert into public.profiles(id,username,name,team,role) values((p_input->>'id')::uuid,p_input->>'username',p_input->>'name',coalesce(p_input->>'team',''),p_input->>'role') returning * into target;
  insert into private.portal_identities(user_id,auth_email) values(target.id,p_input->>'email');
  return jsonb_build_object('ok',true,'account',private.portal_user_json(target));
 end if;
 if p_action='account-update' then
  rid:=(p_input->>'id')::uuid;requested_role:=p_input->>'role';requested_active:=(p_input->>'active')::boolean;
  select * into target from public.profiles where id=rid for update;
  if not found then perform private.portal_fail('NOT_FOUND',404,'계정을 찾을 수 없습니다.'); end if;
  if rid=actor.id and (requested_role<>actor.role or requested_active<>actor.active) then perform private.portal_fail('SELF_PERMISSION_CHANGE',403,'자신의 권한이나 활성 상태는 바꿀 수 없습니다.'); end if;
  if target.role='admin' and target.active and (requested_role<>'admin' or not requested_active) and (select count(*) from public.profiles where role='admin' and active)<=1 then perform private.portal_fail('LAST_ADMIN',409,'마지막 관리자는 비활성화하거나 권한을 바꿀 수 없습니다.'); end if;
  update public.profiles set name=p_input->>'name',team=coalesce(p_input->>'team',''),role=requested_role,active=requested_active,auth_version=auth_version+1,updated_at=stamp where id=rid returning * into target;
  -- A self name/team edit preserves this already-authenticated session, invalidating all others.
  delete from private.portal_sessions where user_id=rid and (rid<>actor.id or session_id<>p_session);
  if rid=actor.id then update private.portal_sessions set auth_version=target.auth_version where session_id=p_session; end if;
  return jsonb_build_object('ok',true,'account',private.portal_user_json(target))||case when rid=actor.id then jsonb_build_object('user',private.portal_user_json(target)) else '{}'::jsonb end;
 end if;
 perform private.portal_fail('UNKNOWN_ACTION',400,'지원하지 않는 요청입니다.');
 return null;
exception when unique_violation then perform private.portal_fail('USERNAME_TAKEN',409,'이미 사용하는 사용자명입니다.'); return null;
end$$;
revoke all on function public.portal_backend(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.portal_backend(text,uuid,uuid,jsonb) to service_role;
grant usage on schema private to service_role;
grant all on public.profiles,public.records to service_role;

-- One-time bootstrap is intentionally NOT a web/API action.
-- 1. Dashboard > Authentication > Users: create the first email/password user (confirmed).
-- 2. In SQL Editor substitute its real UUID, username, name and exact Auth email:
-- begin;
-- insert into public.profiles(id,username,name,role,must_change_password)
-- values ('AUTH_USER_UUID','admin','관리자','admin',false);
-- insert into private.portal_identities(user_id,auth_email) values ('AUTH_USER_UUID','EXACT_AUTH_EMAIL');
-- commit;
-- Recovery: the project owner resets the existing Auth user's password in Dashboard,
-- increments profiles.auth_version, sets active=true/must_change_password=false,
-- deletes that user's private.portal_sessions and clears a stale pending_operation.
