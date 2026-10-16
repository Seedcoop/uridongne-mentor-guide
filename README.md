# 우리동네 플레이어 멘토 웹가이드

청년 멘토를 위한 6주 활동 가이드와 주차별 제작 도구입니다. 홈의 6주 개요는 공개하며, 주차별 세부 가이드·제작 도구·무드보드와 멘토 기록은 운영자가 만든 계정으로 로그인한 뒤 사용합니다.

- 저장소: [Seedcoop/uridongne-mentor-guide](https://github.com/Seedcoop/uridongne-mentor-guide)
- 웹사이트: [우리동네 플레이어 멘토 웹가이드](https://seedcoop.github.io/uridongne-mentor-guide/)
- 웹페이지 호스팅: GitHub Pages의 `public/` 폴더
- 계정·기록 저장: Supabase 프로젝트 `wgfuerwquwsyophgxdih`
- 로그인: 운영자가 만든 아이디와 비밀번호. ChatGPT 계정은 사용하지 않습니다.

## 어디에서 무엇을 관리하나요?

| 관리할 내용 | 관리 위치 | 방법 |
| --- | --- | --- |
| 가이드 문구·운영 타임라인·주차별 도구 | 이 저장소 `public/` | 파일을 수정하고 `main`에 반영 |
| 웹사이트 배포 | GitHub → Actions | `Deploy mentor guide to GitHub Pages` 실행 결과 확인 |
| 멘토 계정 생성·팀·권한·활성 상태 | 웹사이트 로그인 → 관리자 → 계정 관리 | 운영자가 계정을 만들고 수정 |
| 멘토의 비밀번호 분실 | 관리자 → 계정 관리 | 해당 계정의 임시 비밀번호 재설정 |
| 내 비밀번호 | 웹사이트 → 내 계정 | 현재 비밀번호로 본인 확인 후 변경 |
| 활동계획·교육일지·피드백 | 웹사이트 → 내 기록 / 관리자 | 작성·임시저장·제출·보완·확인 완료 |
| 초기 관리자 설정·모든 관리자 로그인 불가 | Supabase Dashboard | 아래 초기 관리자·복구 절차 사용 |
| 데이터 확인·백업 | Supabase Dashboard / 관리자 CSV | `public.profiles`, `public.records` 및 관리자 CSV |
| 서버 비밀 설정 | Supabase Dashboard → Edge Functions → Secrets | 서버에서만 사용할 값 관리 |

비밀번호 목록을 이 README나 저장소 파일에 적지 않습니다. 운영자가 정한 비밀번호 관리 도구에 초기 관리자 정보와 복구 권한을 보관하고, 각 멘토에게는 본인 계정만 개별 안내합니다. 임시 비밀번호는 첫 로그인에서 변경합니다.

## 멘토가 사용하는 순서

1. 상단 **멘토 로그인** 또는 주차별 세부내용의 로그인 안내에서 운영자에게 받은 아이디·임시 비밀번호로 로그인합니다. 로그인하면 원래 열려던 주차나 도구로 돌아갑니다.
2. 첫 로그인에서는 본인 비밀번호로 변경합니다. 새 비밀번호는 8~128자입니다.
3. **멘토 기록·도구**에서 회차를 고르고 활동계획 또는 교육일지를 작성합니다. 주차별 도구의 게임 기획서는 청소년의 제작 자료이며, 멘토의 활동계획과는 별도입니다.
4. **주차 운영안으로 빈칸 채우기**는 클릭했을 때만 가이드 내용을 가져옵니다. 이미 작성한 내용은 유지합니다.
5. 작성 중에는 **임시저장**, 검토받을 준비가 되면 **제출하기**를 누릅니다. 두 버튼 모두 서버에 기록합니다.
6. 제출한 기록은 잠깁니다. **보완 요청**을 받으면 피드백을 확인하고 수정·재제출합니다.
7. 공용 기기를 쓴 뒤에는 **내 계정 → 로그아웃**을 누릅니다.

활동계획과 교육일지는 자동 저장되지 않습니다. 연결 실패 때 화면에 남은 입력을 확인하고 다시 저장하세요. 로그인 상태는 현재 브라우저 탭의 세션 저장소에 보관하며, 비밀번호와 멘토 업무 기록을 로컬 저장소에 저장하지 않습니다. 주차별 제작 도구·무드보드·QA의 기기별 저장과 JSON 백업은 멘토 제출 기록과 별개입니다.

## 주차별 세부내용의 로그인 확인

주차 가이드(`#week-1`~`#week-6`), 주차별 도구(`#studio`, `#studio/1`~`#studio/6`), 무드보드, 멘토 기록·도구(`#toolbox`와 하위 경로)는 Supabase 서버가 로그인 상태와 활성 계정을 확인한 뒤 표시합니다. 주소를 직접 입력하거나 새로고침해도 같은 검사를 거칩니다. 확인 중이거나 연결에 실패하면 세부내용을 표시하지 않고, 첫 로그인에서 비밀번호를 변경해야 하는 계정은 변경 화면을 표시합니다.

로그아웃하거나 만료를 확인하면 열려 있던 세부 화면을 제거합니다. 탭으로 돌아올 때와 세부 화면을 보는 동안 1분마다 로그인 상태를 다시 확인합니다. 연결 오류에서는 **다시 연결**로 재시도할 수 있습니다.

현재 호스팅과 저장소는 공개 정적 파일을 사용합니다. 이 로그인 확인은 웹사이트 화면의 접근을 제한하며, 공개 저장소나 JavaScript 파일에 포함된 가이드 원문 자체를 비공개로 전환하지는 않습니다. 원문 파일의 열람까지 제한해야 한다면 내용을 비공개 저장소로 옮기고 서버 인증을 통과한 요청에만 전달하는 별도 구성이 필요합니다.

## 운영자가 계정을 만드는 방법

1. 관리자 계정으로 로그인하고 **관리자 → 계정 관리**를 엽니다.
2. 아이디·이름·담당 팀·권한·임시 비밀번호를 입력하고 **계정 만들기**를 누릅니다.
3. 아이디는 영문 소문자 또는 숫자로 시작하는 3~40자이며 점·밑줄·하이픈도 사용할 수 있습니다. 새 멘토의 권한은 **멘토**로 둡니다.
4. 아이디와 임시 비밀번호를 해당 멘토에게 개별 안내합니다. 첫 로그인에서 비밀번호를 바꿔야 기록을 작성할 수 있습니다.
5. 기존 계정을 선택하면 이름·담당 팀·권한·활성 여부를 수정할 수 있습니다. 비활성화하면 해당 계정의 이용이 중단됩니다.

비밀번호를 잊은 멘토는 운영자에게 요청합니다. 운영자는 계정 목록에서 해당 계정을 선택해 **임시 비밀번호 재설정**을 실행하고 새 임시 비밀번호를 안내합니다. 본인의 비밀번호는 **내 계정**에서 바꿉니다. 일반 멘토에게 관리자 권한을 부여하면 모든 멘토의 기록과 계정을 관리할 수 있으므로 역할을 확인하세요.

## 제출 기록 검토

**관리자 → 제출 기록 검토**에서 회차·종류·상태로 필터링하고 기록을 엽니다. 보완할 점은 피드백에 남겨 **보완 요청**, 검토가 끝났으면 **확인 완료**를 선택합니다. 임시저장 기록은 제출 이후 검토합니다. **CSV 내려받기**는 현재 필터에 해당하는 기록을 저장합니다. 내려받은 파일에는 멘토 이름·팀·관찰 기록이 포함될 수 있으므로 운영자가 지정한 보관 위치를 사용합니다.

## GitHub Pages 배포

1. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정합니다.
2. 변경한 `public/` 파일을 `main`에 반영합니다. `.github/workflows/pages.yml`이 `public/`만 Pages 배포 자료로 올립니다.
3. **Actions → Deploy mentor guide to GitHub Pages**에서 배포가 초록색으로 끝나는지 확인합니다. 필요하면 **Run workflow**로 다시 실행합니다.
4. 배포된 주소에서 홈·6주 가이드·주차별 도구·로그인 창을 확인합니다.

정적 페이지 배포에는 Supabase의 비밀키나 GitHub 저장소 Secret이 필요하지 않습니다. 배포 워크플로는 `contents: read`, `pages: write`, `id-token: write` 권한을 사용합니다. 공개 클라이언트 설정은 `public/portal-config.js`에 있고, 서버 비밀 설정은 Supabase에서 별도로 관리합니다.

워크플로는 2026-10-16 공식 릴리스 확인 기준 [checkout@v7](https://github.com/actions/checkout/releases/tag/v7.0.1), [configure-pages@v6](https://github.com/actions/configure-pages/releases/tag/v6.0.0), [upload-pages-artifact@v5](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0), [deploy-pages@v5](https://github.com/actions/deploy-pages/releases/tag/v5.0.1)을 사용합니다. 권한과 배포 구성은 [GitHub Pages 공식 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 따릅니다.

## Supabase 서버를 처음 준비할 때

프로젝트 소유자 또는 위임받은 운영자가 프로젝트 `wgfuerwquwsyophgxdih`에서 진행합니다. 웹사이트의 공개 가입이나 최초 관리자 생성 기능은 제공하지 않습니다.

1. Supabase **SQL Editor**에서 [`supabase/migrations/202610160001_portal.sql`](supabase/migrations/202610160001_portal.sql)을 한 번 적용합니다. 기존 데이터베이스에 다시 실행하는 초기화 스크립트가 아닙니다. 이미 적용된 서버에서는 새 마이그레이션만 적용합니다.
2. Supabase CLI로 Edge Function을 배포합니다.

   ```sh
   supabase functions deploy mentor-portal --project-ref wgfuerwquwsyophgxdih --no-verify-jwt
   ```

   코드는 [`supabase/functions/mentor-portal/index.ts`](supabase/functions/mentor-portal/index.ts)입니다. 게이트웨이의 JWT 검사는 끄고, 함수 내부에서 Auth 사용자·등록된 로그인 세션·프로필의 활성 상태와 권한을 검사합니다.
3. 런타임에서 주입되는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`를 사용합니다. 이 값들을 웹페이지로 복사하지 않습니다. 추가 서버 설정이 필요하면 **Edge Functions → Secrets**에서 관리합니다.
4. 기본 허용 출처는 `https://seedcoop.github.io`와 로컬 개발 주소 `http://localhost`, `http://127.0.0.1`입니다. 로컬 포트도 허용합니다. 도메인이 바뀌면 서버의 `PORTAL_ALLOWED_ORIGINS`에 새 출처를 쉼표로 구분해 추가합니다. 출처는 경로를 제외한 `https://도메인` 형식입니다.
5. `public/portal-config.js`의 프로젝트 URL·publishable key·함수명이 해당 서버와 일치하는지 확인한 뒤 GitHub Pages를 배포합니다.

현재 서버는 Dashboard 편집기의 진입 파일에서 GitHub의 확정된 커밋에 있는 `supabase/functions/mentor-portal/index.ts`를 가져와 배포했습니다. 서버 코드를 수정할 때는 위 CLI 명령으로 다시 배포하거나, **Edge Functions → mentor-portal → Code**에서 가져오는 커밋 주소를 새 확정 커밋으로 바꾸고 **Deploy updates**를 누릅니다. `main`을 수정하면 웹페이지는 자동 배포되지만 서버 함수는 별도로 배포해야 합니다. 함수의 **Settings → Verify JWT with legacy secret**은 끈 상태로 유지합니다. 인증 검사는 함수 내부에서 수행하며 프로젝트의 legacy API key 자체를 비활성화하는 설정과는 다릅니다.

## 최초 관리자 계정 만들기

이 작업은 Supabase 프로젝트 소유자가 한 번 수행합니다. 초기 관리자 비밀번호는 운영자가 직접 정하고 비밀번호 관리 도구에 보관합니다.

1. Supabase **Authentication → Users**에서 사용자를 만듭니다. 프로젝트 소유자가 관리하는 **실제 이메일**을 권장하며, 비밀번호를 설정하고 이메일이 확인된 사용자로 생성합니다. 내부용 `@uridongne.invalid` 주소를 선택하면 이메일을 받을 수 없으므로 아래 관리자 권한 복구 절차를 사용해야 합니다.
2. 만들어진 Auth 사용자의 **UUID**와 정확한 이메일을 확인합니다. 웹사이트에서 로그인할 아이디는 아래 예시의 `admin`이며 이메일과 별개입니다.
3. SQL Editor에서 아래 UUID·이메일·이름을 실제 값으로 바꾸고 하나의 트랜잭션으로 실행합니다. 실제 비밀번호는 이 SQL에 적지 않습니다.

   ```sql
   begin;
   insert into public.profiles (id, username, name, role, must_change_password)
   values ('AUTH_USER_UUID'::uuid, 'admin', '관리자', 'admin', false);

   insert into private.portal_identities (user_id, auth_email)
   values ('AUTH_USER_UUID'::uuid, 'OWNER_AUTH_EMAIL');
   commit;
   ```

4. 웹사이트에서 `admin`과 방금 정한 비밀번호로 로그인합니다. 관리자 화면에서 이후 멘토 계정을 생성합니다. 일반 계정은 Dashboard에서 따로 만들지 않아도 됩니다.

새 멘토는 서버가 `아이디@uridongne.invalid` 형식의 내부 인증 주소로 만듭니다. 실제 이메일 수신에 의존하지 않으며, 비밀번호 분실은 운영자의 임시 비밀번호 재설정으로 처리합니다.

## 모든 관리자 계정으로 로그인할 수 없을 때

다른 관리자가 로그인할 수 있으면 웹 **관리자 → 계정 관리**에서 재설정합니다. 관리자 전원이 잠겼을 때만 Supabase 프로젝트 소유자가 아래 복구를 수행합니다.

1. **Authentication → Users**와 `public.profiles`에서 복구할 기존 관리자 UUID를 확인합니다. 기존 사용자를 삭제하거나 새 사용자로 바꾸면 기록의 작성자 연결이 달라지므로 같은 UUID를 사용합니다.
2. 프로젝트 소유자가 서버 권한으로 Supabase Auth의 [관리자 비밀번호 변경 API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)를 사용해 해당 UUID의 비밀번호를 변경합니다. 서비스키는 서버·관리자의 로컬 보안 환경에서만 사용합니다. `@uridongne.invalid` 주소에 이메일 재설정을 보내는 방식은 사용하지 않습니다.
3. SQL Editor에서 UUID를 바꾸고 기존 로그인과 보류된 계정 변경을 정리합니다.

   ```sql
   begin;
   update public.profiles
   set active = true,
       must_change_password = false,
       auth_version = auth_version + 1,
       updated_at = (extract(epoch from now()) * 1000)::bigint
   where id = 'ADMIN_USER_UUID'::uuid and role = 'admin';

   delete from private.portal_sessions
   where user_id = 'ADMIN_USER_UUID'::uuid;

   update private.portal_identities
   set pending_operation = null, pending_since = null
   where user_id = 'ADMIN_USER_UUID'::uuid;
   commit;
   ```

4. 관리자 아이디와 새 비밀번호로 다시 로그인하고 계정·기록을 확인합니다. 복구한 비밀번호를 승인된 비밀번호 관리 도구에 갱신합니다.

## 계정 정보와 키 보관 원칙

- `public/portal-config.js`의 Supabase URL과 **publishable key**는 브라우저 연결용 공개 설정입니다.
- Supabase **service role / secret key**, 데이터베이스 비밀번호, GitHub 토큰, 실제 계정 비밀번호를 `public/`, README, 커밋, GitHub Pages에 넣지 않습니다.
- Supabase 서버 비밀키는 **Edge Functions → Secrets** 또는 운영자가 승인한 비밀번호 관리 도구에만 보관합니다.
- 계정 상태는 `public.profiles`, 제출 기록은 `public.records`, 로그인 인증 정보는 Supabase Auth에서 관리합니다. 관리자 계정 삭제·역할 변경은 웹 관리 기능과 공식 복구 절차를 사용합니다.
- 테스트 결과·브라우저 로그인 상태·CSV는 `.gitignore`로 제외합니다. 실운영 자료를 테스트 파일로 커밋하지 않습니다.

## 로컬 확인

별도 빌드 없이 Node.js로 정적 자료를 점검할 수 있습니다.

```sh
node tests/static-check.cjs
node tests/serve.cjs
```

미리보기 주소는 `http://127.0.0.1:8803/uridongne-mentor-guide/`입니다. 실제 GitHub Pages처럼 저장소 이름이 포함된 경로에서 확인합니다. 인증·서버 동작을 로컬에서 확인하려면 해당 주소가 Supabase 서버의 허용 출처에 포함되어야 합니다.

브라우저 점검은 Playwright가 설치된 환경에서 실행합니다. 기존 설치를 사용하려면 `PLAYWRIGHT_MODULE`에 모듈 경로를, 필요한 경우 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에 Chromium 실행 파일 경로를 설정합니다.

```sh
node tests/browser-smoke.cjs
```

스모크 검사는 31개 hash 경로를 PC·360px에서 열어 화면 내용·이미지·가로 넘침·로그인 필요 화면을 확인합니다. 인증 회귀 검사는 직접 주소 접근·로그인 후 원래 경로 복귀·인증 대기 중 내용 비노출·로그인 실패·연결 실패와 재시도·로그아웃·세션 만료·임시 비밀번호 변경을 확인합니다. 로그인 조회는 테스트 응답으로 대체하고 외부 서버의 변경 요청은 차단하므로 실운영 계정·기록을 만들지 않습니다. 결과와 화면 캡처는 `tests/results/`에 생성되며 커밋하지 않습니다.
