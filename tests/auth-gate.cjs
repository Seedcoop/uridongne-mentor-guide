'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createServer} = require('./serve.cjs');
let chromium;
try { ({chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); }
catch { console.error('Set PLAYWRIGHT_MODULE to an available Playwright module path.'); process.exit(1); }

const detailSelector = '.week-title,.week-support,.timeline-section,.studio-head,.studio-form,.studio-cards,.mb-head,.mb-guide,#moodboardCanvas,.mb-editor,.mentor-reference,#toolPane,a[href="./starter/index.html"]';
const user = {id:'test-mentor',username:'test.mentor',name:'테스트 멘토',team:'테스트 팀',role:'mentor',mustChangePassword:false};
const session = () => ({access_token:'test-access',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600});
const results = {checks:[],errors:[],actions:[]};
const output = path.join(__dirname,'results');
fs.mkdirSync(output,{recursive:true});
function check(label,value) { assert(value,label); results.checks.push(label); }

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:'+server.address().port;
  const base = origin+'/uridongne-mentor-guide/';
  let browser;
  const contexts = [];
  try {
    browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
    async function setup(options={}) {
      const context = await browser.newContext({viewport:{width:1280,height:900}});
      contexts.push(context);
      const page = await context.newPage();
      const state = {authenticated:false,meFailure:false,expired:false,loginFailure:false,mustChangePassword:false,waitForMe:null,...options};
      page.on('pageerror',error => results.errors.push(error.message));
      // Keep a history so briefly rendering protected content before checking me also fails.
      await page.addInitScript(selector => {
        window.__protectedRenderCount = 0;
        new MutationObserver(() => {
          if (document.querySelector('#main')?.querySelector(selector)) window.__protectedRenderCount++;
        }).observe(document,{childList:true,subtree:true});
      },detailSelector);
      await page.route('**/*',async route => {
        const request = route.request();
        const url = new URL(request.url());
        const reply = (body,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
        if (url.pathname.includes('/auth/v1/token')) {
          results.actions.push('refresh');
          if (state.expired) return reply({error:{code:'SESSION_EXPIRED',message:'로그인이 만료되었습니다.'}},401);
          return reply(session());
        }
        if (url.pathname.includes('/functions/v1/')) {
          let body;
          try { body = request.postDataJSON(); } catch {}
          const action = body?.action || url.searchParams.get('action');
          results.actions.push(action);
          if (action==='me') {
            if (state.waitForMe) await state.waitForMe;
            if (state.meFailure) return reply({error:{code:'UNAVAILABLE',message:'테스트 연결 오류'}},503);
            if (state.expired) return reply({error:{code:'SESSION_EXPIRED',message:'로그인이 만료되었습니다.'}},401);
            const authorized = state.authenticated && request.headers().authorization==='Bearer test-access';
            return reply({ok:true,user:authorized?{...user,mustChangePassword:state.mustChangePassword}:null,needsSetup:false,canSetup:false,canRecover:false});
          }
          if (action==='login') {
            if (state.loginFailure) return reply({error:{code:'INVALID_CREDENTIALS',message:'아이디 또는 비밀번호를 확인해 주세요.'}},401);
            state.authenticated = true;
            return reply({ok:true,user:{...user,mustChangePassword:state.mustChangePassword},session:session()});
          }
          if (action==='logout') { state.authenticated=false; return reply({ok:true}); }
          if (action==='records') return reply({ok:true,records:[]});
          if (action==='password') { state.mustChangePassword=false; return reply({ok:true}); }
          return reply({error:{code:'UNEXPECTED_TEST_ACTION',message:'Unexpected test action: '+action}},500);
        }
        // No real login, record, password, or other mutation leaves this test.
        if (url.origin!==origin&&!['GET','HEAD','OPTIONS'].includes(request.method())) return route.abort();
        return route.continue();
      });
      return {page,state,context};
    }
    async function noDetails(page,label,neverRendered=false) {
      check(label+' has no weekly details',await page.locator('#main').locator(detailSelector).count()===0);
      check(label+' has no private editor',await page.locator('[data-mp-form="record"],[data-mp-form="review"],[data-mp-form="account-edit"]').count()===0);
      if (neverRendered) check(label+' never rendered details',await page.evaluate(() => window.__protectedRenderCount===0));
    }
    async function gate(page) {
      await page.locator('#mentorPortal [data-mp-action="login"]').waitFor();
      await page.waitForFunction(() => !document.querySelector('#mentorPortal .mp-loading'));
    }
    async function login(page) {
      await page.locator('#mentorPortal [data-mp-action="login"]').first().click();
      await page.locator('#mpLoginUsername').fill('test.mentor');
      await page.locator('#mpLoginPassword').fill('test-password-only');
      await page.locator('[data-mp-form="login"] button[type="submit"]').click();
    }

    const anonymous = await setup();
    await anonymous.page.goto(base+'#home');
    await anonymous.page.locator('.week-grid .week-card').first().waitFor();
    check('public home keeps six week summary links',await anonymous.page.locator('.week-grid .week-card').count()===6);
    await anonymous.page.locator('.week-grid a[href="#week-1"]').click();
    await gate(anonymous.page);
    await noDetails(anonymous.page,'home week link before login',true);
    check('week route preserved at gate',new URL(anonymous.page.url()).hash==='#week-1');
    await login(anonymous.page);
    await anonymous.page.locator('.week-title').waitFor();
    check('successful login resumes selected week',new URL(anonymous.page.url()).hash==='#week-1');
    check('successful login shows week support and timeline',await anonymous.page.locator('.week-support,.timeline-section').count()===2);
    for (const [hash,selector] of [['#week-6','.week-title'],['#studio','.studio-cards'],['#studio/2','.studio-form'],['#moodboard','#moodboardCanvas'],['#toolbox/prompts','#promptText']]) {
      await anonymous.page.evaluate(hash => { location.hash=hash; },hash);
      await anonymous.page.locator(selector).waitFor();
      check('authenticated access '+hash,true);
    }
    await anonymous.page.evaluate(() => { location.hash='#records'; });
    await anonymous.page.locator('[data-mp-action="new"][data-kind="plan"]').click();
    await anonymous.page.locator('[data-mp-action="seed"]').click();
    await anonymous.page.waitForFunction(() => document.querySelector('[data-mp-field="goal"]')?.value.trim().length>0);
    check('record plan seed fills weekly goal',await anonymous.page.locator('[data-mp-field="goal"]').inputValue().then(value=>value.trim().length>0));
    check('record plan seed fills weekly flow',await anonymous.page.locator('[data-mp-field="flow"]').inputValue().then(value=>value.trim().length>0&&value.includes('분')));

    const resumed = await setup();
    await resumed.page.goto(base+'#studio/4');
    await gate(resumed.page);
    await noDetails(resumed.page,'studio direct link before login',true);
    await login(resumed.page);
    await resumed.page.locator('.studio-form').waitFor();
    check('login resumes exact studio deep link',new URL(resumed.page.url()).hash==='#studio/4');
    await resumed.page.evaluate(() => { location.hash='#toolbox/prompts'; });
    await resumed.page.locator('#promptText').waitFor();
    await resumed.page.locator('#portalAuth [data-mp-action="account"]').click();
    await resumed.page.locator('[data-mp-action="logout"]').click();
    await resumed.page.locator('#portalAuth [data-mp-action="login"]').waitFor();
    await noDetails(resumed.page,'account after prompts and logout');
    check('logout clears stored session',await resumed.page.evaluate(() => [...Array(sessionStorage.length)].map((_,i)=>sessionStorage.key(i)).every(key=>!key.endsWith('.session.v1'))));
    await resumed.page.evaluate(() => { location.hash='#week-2'; });
    await gate(resumed.page);
    await noDetails(resumed.page,'weekly route after logout');

    let releaseMe;
    const delayed = await setup({waitForMe:new Promise(resolve => { releaseMe=resolve; })});
    const meRequest = delayed.page.waitForRequest(request => {
      try { return request.postDataJSON()?.action==='me'; } catch { return false; }
    });
    await delayed.page.goto(base+'#week-3');
    await meRequest;
    await noDetails(delayed.page,'authentication pending',true);
    releaseMe();
    await gate(delayed.page);
    await noDetails(delayed.page,'delayed anonymous response',true);

    const unavailable = await setup({meFailure:true});
    await unavailable.page.goto(base+'#moodboard/2');
    await unavailable.page.locator('#mentorPortal [data-mp-action="retry"]').waitFor();
    await noDetails(unavailable.page,'authentication service failure',true);
    unavailable.state.meFailure=false;
    await unavailable.page.locator('#mentorPortal [data-mp-action="retry"]').click();
    await gate(unavailable.page);
    await noDetails(unavailable.page,'retry remains anonymous',true);

    const retry = await setup();
    await retry.page.goto(base+'#week-3');
    await gate(retry.page);
    await login(retry.page);
    await retry.page.locator('.week-title').waitFor();
    retry.state.meFailure=true;
    await retry.page.reload();
    await retry.page.locator('#mentorPortal [data-mp-action="retry"]').waitFor();
    await noDetails(retry.page,'saved session authentication service failure',true);
    retry.state.meFailure=false;
    await retry.page.locator('#mentorPortal [data-mp-action="retry"]').click();
    await retry.page.locator('.week-title').waitFor();
    check('authenticated retry resumes original weekly route',new URL(retry.page.url()).hash==='#week-3');
    check('authenticated retry restores weekly details',await retry.page.locator('.week-support,.timeline-section').count()===2);

    const denied = await setup({loginFailure:true});
    await denied.page.goto(base+'#week-5');
    await gate(denied.page);
    await login(denied.page);
    await denied.page.locator('[data-mp-form="login"] .mp-form-message.mp-error').waitFor();
    await noDetails(denied.page,'failed login',true);
    check('failed login preserves selected week',new URL(denied.page.url()).hash==='#week-5');

    const expired = await setup();
    await expired.page.goto(base+'#week-1');
    await gate(expired.page);
    await login(expired.page);
    await expired.page.locator('.week-title').waitFor();
    expired.state.expired=true;
    await expired.page.evaluate(() => { dispatchEvent(new Event('focus')); });
    await gate(expired.page);
    await noDetails(expired.page,'expired session after focus revalidation');
    check('focus revalidation keeps selected week',new URL(expired.page.url()).hash==='#week-1');
    await expired.page.evaluate(() => { location.hash='#week-2'; });
    await gate(expired.page);
    await noDetails(expired.page,'expired session on weekly navigation');
    check('expired session clears identity',await expired.page.locator('#portalAuth [data-mp-action="login"]').count()===1);

    const password = await setup({mustChangePassword:true});
    await password.page.goto(base+'#week-4');
    await gate(password.page);
    await login(password.page);
    await password.page.locator('[data-mp-form="password"]').waitFor();
    await noDetails(password.page,'required password change',true);
    await password.page.evaluate(() => { location.hash='#studio/3'; });
    await password.page.locator('[data-mp-form="password"]').waitFor();
    await noDetails(password.page,'password change cannot be bypassed by deep link',true);

    check('all authentication flows have no JavaScript errors',results.errors.length===0);
    results.finishedAt=new Date().toISOString();
    console.log('Authentication gate passed: '+results.checks.length+' checks; no real server mutations.');
  } catch(error) {
    results.failure=error.stack;
    throw error;
  } finally {
    fs.writeFileSync(path.join(output,'auth-gate.json'),JSON.stringify(results,null,2));
    await Promise.all(contexts.map(context=>context.close()));
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
