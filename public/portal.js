(function () {
'use strict';
const CLIENT=window.MentorPortalClient, STATUS={draft:'임시저장',submitted:'제출됨',revision_requested:'보완 요청',reviewed:'확인 완료'};
const S={user:null,me:null,schema:null,epoch:0,controller:null,root:null,view:'home',week:1,records:[],accounts:[],active:null,adminDetail:null,adminTab:'records',filters:{week:'',type:'',status:''},accountEdit:null,dirty:false,busy:false,error:'',notice:'',loading:false,pending:null,suspended:null};
let modal=null,modalBusy=false,modalSequence=0,schemaPromise=null,listSequence=0,detailSequence=0,accountsLoading=false;
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selected=(a,b)=>String(a)===String(b)?' selected':'';
const button=(label,action,extra)=>{extra=extra||'';const classes=extra.match(/\bclass="([^"]*)"/);const css=Array.from(new Set(('mp-button '+(classes?.[1]||'')).split(/\s+/))).join(' ');return '<button type="button" class="'+css+'" data-mp-action="'+action+'" '+extra.replace(/\bclass="[^"]*"/,'')+'>'+esc(label)+'</button>';};
const status=s=>'<span class="mp-status mp-status-'+esc(s)+'">'+esc(STATUS[s]||s)+'</span>';
const titleFor=k=>S.schema?.forms?.[k]?.title||(k==='plan'?'활동계획':'멘토 교육일지');
const weekText=n=>S.schema?.weeks?.[Number(n)-1]||n+'회차';
const dateText=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(d);};
function errorMessage(e){if(e?.name==='AbortError')return '';if(e?.message==='Failed to fetch'||e instanceof TypeError)return '서버에 연결하지 못했습니다. 입력은 유지되어 있습니다. 연결을 확인하고 다시 시도해 주세요.';return e?.message||'요청을 완료하지 못했습니다. 다시 시도해 주세요.';}
async function api(action,options) {
 try{return await CLIENT.request(action,options);}
 catch(e){if(e.status===401&&action!=='login')expireSession();throw e;}
}
function connectionNotice(){return '<section class="mp-panel"><h3>멘토 기록 연결 준비 중</h3><p>활동계획과 교육일지 연결을 준비하고 있습니다. 교육 가이드와 주차별 도구는 계속 사용할 수 있어요.</p><p class="mp-note">계정·비밀번호 문의는 운영자에게 해주세요.</p></section>';}
function expireSession(){if(S.dirty&&S.active&&S.user)S.suspended={userId:S.user.id,record:structuredClone(S.active)};++S.epoch;S.controller?.abort();S.user=null;S.me={user:null};S.records=[];S.accounts=[];S.active=null;S.adminDetail=null;S.accountEdit=null;S.dirty=false;S.loading=false;S.error='로그인이 만료되었습니다. 다시 로그인해 주세요. 저장하지 않은 입력은 같은 계정으로 로그인하면 이어 쓸 수 있습니다.';S.notice='';closeModal(true);render();authSlot();}
function alive(epoch){return epoch===S.epoch&&S.root?.isConnected;}
function authSlot() {
 let slot=document.getElementById('portalAuth');
 if(!slot){const header=document.querySelector('.header');if(!header)return;slot=document.createElement('div');slot.id='portalAuth';header.append(slot);}
 slot.classList.add('mp-auth');
 slot.innerHTML=!CLIENT?.isConfigured()?'<span class="mp-auth-name">멘토 기록 연결 준비 중</span>':S.user?'<span class="mp-auth-name">'+esc(S.user.name||S.user.username)+'</span>'+button('내 계정','account','class="mp-auth-button"'):button('멘토 로그인','login','class="mp-auth-button"');
}
function banner() {return (S.error?'<div class="mp-message mp-error" role="alert">'+esc(S.error)+'</div>':'')+(S.notice?'<div class="mp-message mp-success" role="status">'+esc(S.notice)+'</div>':'');}
function setMessage(message,isError){S.error=isError?message:'';S.notice=isError?'':message;const slot=S.root?.querySelector('.mp-messages');if(slot)slot.innerHTML=banner();}
function heading(title,description){return '<div class="mp-heading"><p class="mp-eyebrow">MENTOR PORTAL</p><h2>'+esc(title)+'</h2>'+(description?'<p>'+esc(description)+'</p>':'')+'</div>';}
function links() {return '<nav class="mp-nav" aria-label="멘토 포털">'+
 '<a href="#records"'+(S.view==='records'?' aria-current="page"':'')+'>내 기록</a>'+
 (S.user?.role==='admin'?'<a href="#admin"'+(S.view==='admin'?' aria-current="page"':'')+'>관리자</a>':'')+
 '<a href="#account"'+(S.view==='account'?' aria-current="page"':'')+'>내 계정</a></nav>';}
function gate() {if(!CLIENT?.isConfigured())return connectionNotice();return '<section class="mp-panel mp-gate"><h3>멘토 계정으로 로그인해 주세요</h3><p>활동계획과 교육일지는 로그인한 멘토의 계정에 저장됩니다. 교육 가이드는 로그인 없이 볼 수 있어요.</p>'+button('멘토 로그인','login')+'</section>';}
function weekOptions(current,all) {return (all?'<option value="">모든 회차</option>':'')+(S.schema?.weeks||Array.from({length:6},(_,i)=>(i+1)+'회차')).map((x,i)=>'<option value="'+(i+1)+'"'+selected(current,i+1)+'>'+esc(x)+'</option>').join('');}
function homeView() {
 return heading('활동계획과 교육일지','활동 전에는 계획을 준비하고, 활동 뒤에는 실제로 진행한 내용을 남겨요.')+
 '<div class="mp-home-week"><label for="mpHomeWeek">작성할 회차</label><select id="mpHomeWeek" data-mp-week>'+weekOptions(S.week,false)+'</select></div>'+
 '<div class="mp-cards">'+['plan','log'].map((k,i)=>'<article class="mp-panel mp-card"><span class="mp-card-number">0'+(i+1)+'</span><h3>'+esc(titleFor(k))+'</h3><p>'+esc(k==='plan'?'이번 주 목표·활동 흐름·준비 재료를 작성해요.':'실제 진행·청소년 관찰·산출물·특이사항을 기록해요.')+'</p>'+button(S.user?'작성하기':'로그인하고 작성하기','new','data-kind="'+k+'"')+'</article>').join('')+'</div>'+
 (S.user?'<div class="mp-actions"><a class="mp-link" href="#records">내가 저장·제출한 기록 보기 →</a>'+(S.user.role==='admin'?'<a class="mp-link" href="#admin">관리자 화면 →</a>':'')+'</div>':'')+
 '<p class="mp-note">청소년과 만드는 1주차 게임 기획서는 ‘주차별 도구’에서 작성합니다. 이곳은 멘토의 활동 운영 기록입니다.</p>';
}
function recordList(records,admin) {
 if(!records.length)return '<div class="mp-empty">아직 기록이 없습니다.</div>';
 return '<div class="mp-record-list">'+records.map(r=>'<button type="button" class="mp-record-row" data-mp-action="'+(admin?'admin-open':'open')+'" data-id="'+esc(r.id)+'"><span><strong>'+esc(weekText(r.week))+' · '+esc(titleFor(r.kind))+'</strong>'+(admin?'<small>'+esc(r.authorName||'멘토')+' · '+esc(r.authorTeam||'팀 미지정')+'</small>':'')+'<small>최근 저장 '+esc(dateText(r.updatedAt))+'</small></span><span>'+status(r.status)+'<span class="mp-row-arrow" aria-hidden="true">↗</span></span></button>').join('')+'</div>';
}
function fieldMarkup(f,data,locked,prefix) {
 const id=prefix+'-'+f.key,v=data?.[f.key],label='<label for="'+id+'">'+esc(f.label)+(f.required?'<span class="mp-required">필수</span>':'')+'</label>',help=f.help?'<p class="mp-help" id="'+id+'-help">'+esc(f.help)+'</p>':'',attrs=' data-mp-field="'+esc(f.key)+'"'+(f.max?' maxlength="'+f.max+'"':'')+(locked?' disabled':'')+(f.help?' aria-describedby="'+id+'-help"':'');
 if(f.type==='checkboxes')return '<fieldset class="mp-field mp-check-group"><legend>'+esc(f.label)+(f.required?'<span class="mp-required">필수</span>':'')+'</legend>'+help+'<div class="mp-check-options">'+f.options.map((o,i)=>'<label><input type="checkbox" id="'+id+'-'+i+'" value="'+esc(o)+'"'+attrs+(Array.isArray(v)&&v.includes(o)?' checked':'')+'> <span>'+esc(o)+'</span></label>').join('')+'</div></fieldset>';
 if(f.type==='session')return '<div class="mp-field">'+label+help+'<select id="'+id+'"'+attrs+(!locked&&S.active?.id?' disabled':'')+'>'+weekOptions(v||S.week,false)+'</select></div>';
 if(f.type==='textarea')return '<div class="mp-field mp-wide">'+label+help+'<textarea id="'+id+'" rows="'+(f.key==='flow'?7:5)+'"'+attrs+'>'+esc(v||'')+'</textarea></div>';
 return '<div class="mp-field">'+label+help+'<input id="'+id+'" type="text"'+attrs+' value="'+esc(v||'')+'" autocomplete="off"></div>';
}
function recordEditor() {
 const r=S.active;if(!r)return '';
 const locked=!['draft','revision_requested'].includes(r.status),form=S.schema.forms[r.kind];
 return '<section class="mp-panel mp-editor"><div class="mp-editor-heading"><div><p class="mp-eyebrow">'+esc(weekText(r.week))+'</p><h3>'+esc(form.title)+'</h3></div>'+status(r.status)+'</div>'+
 (r.feedback?'<aside class="mp-feedback"><strong>관리자 피드백</strong><p>'+esc(r.feedback)+'</p></aside>':'')+
 (locked?'<p class="mp-lock-note">제출한 내용은 수정할 수 없습니다. 보완 요청을 받으면 수정하고 다시 제출할 수 있어요.</p>':'<p class="mp-note">작성 중인 내용은 자동 전송되지 않습니다. 임시저장 또는 제출을 눌러 주세요.</p>')+
 '<form data-mp-form="record" novalidate><div class="mp-form-message" role="alert"></div>'+
 (r.kind==='plan'&&!locked?'<div class="mp-seed"><p>이번 주 가이드의 목표와 흐름을 참고할 수 있어요. 이미 적은 내용은 바뀌지 않습니다.</p>'+button('주차 운영안으로 빈칸 채우기','seed')+'</div>':'')+
 '<div class="mp-fields">'+form.fields.map(f=>fieldMarkup(f,r.data,locked,'mpRecord')).join('')+'</div>'+
 '<div class="mp-actions">'+(!locked?'<button type="submit" class="mp-button mp-secondary" data-record-intent="save">임시저장</button><button type="submit" class="mp-button" data-record-intent="submit">'+(r.status==='revision_requested'?'수정 후 다시 제출':'제출하기')+'</button>':'')+button('작성 창 닫기','close-record','class="mp-button mp-secondary"')+'</div>'+
 '<p class="mp-note">'+(r.id?'서버에 최근 저장: '+esc(dateText(r.updatedAt)):'아직 서버에 저장하지 않은 기록입니다.')+'</p></form></section>';
}
function recordsView() {
 return heading('내 활동 기록','임시저장한 기록을 이어 쓰고, 제출 상태와 피드백을 확인해요.')+
 '<div class="mp-toolbar"><label>새로 작성할 회차<select data-mp-week>'+weekOptions(S.week,false)+'</select></label><div class="mp-actions">'+button('활동계획 작성','new','data-kind="plan"')+button('교육일지 작성','new','data-kind="log" class="mp-button mp-secondary"')+'</div></div>'+
 recordEditor()+'<section class="mp-panel"><div class="mp-section-title"><h3>저장·제출한 기록</h3>'+button('새로고침','reload','class="mp-button mp-secondary mp-small"')+'</div>'+recordList(S.records,false)+'</section>';
}
function recordDetail(r) {
 if(!r)return '<div class="mp-empty">목록에서 검토할 기록을 선택해 주세요.</div>';
 const form=S.schema.forms[r.kind];
 return '<section class="mp-panel mp-review"><div class="mp-editor-heading"><div><p class="mp-eyebrow">'+esc(r.authorName||'멘토')+' · '+esc(r.authorTeam||'팀 미지정')+'</p><h3>'+esc(weekText(r.week))+' · '+esc(form.title)+'</h3></div>'+status(r.status)+'</div>'+
 '<dl class="mp-detail">'+form.fields.map(f=>'<div><dt>'+esc(f.label)+'</dt><dd>'+esc(Array.isArray(r.data?.[f.key])?r.data[f.key].join(', '):f.type==='session'?weekText(r.data?.[f.key]||r.week):r.data?.[f.key]||'미입력')+'</dd></div>').join('')+'</dl>'+
 '<form data-mp-form="review" novalidate><div class="mp-form-message" role="alert"></div><div class="mp-field"><label for="mpFeedback">멘토에게 남길 피드백</label><textarea id="mpFeedback" name="feedback" rows="4" maxlength="4000">'+esc(r.feedback||'')+'</textarea></div><div class="mp-actions">'+button('확인 완료','review','data-status="reviewed"'+(r.status==='draft'?' disabled':''))+button('보완 요청','review','data-status="revision_requested" class="mp-button mp-secondary"'+(r.status==='draft'?' disabled':''))+'</div>'+(r.status==='draft'?'<p class="mp-note">임시저장 상태의 기록은 제출된 뒤 검토할 수 있습니다.</p>':'')+'</form></section>';
}
function adminFilters() {
 return '<form data-mp-form="filters" class="mp-filters"><label>회차<select name="week">'+weekOptions(S.filters.week,true)+'</select></label><label>종류<select name="type"><option value="">모든 종류</option><option value="plan"'+selected(S.filters.type,'plan')+'>활동계획</option><option value="log"'+selected(S.filters.type,'log')+'>교육일지</option></select></label><label>상태<select name="status"><option value="">모든 상태</option>'+Object.entries(STATUS).map(([v,k])=>'<option value="'+v+'"'+selected(S.filters.status,v)+'>'+k+'</option>').join('')+'</select></label><button class="mp-button mp-small" type="submit">조회</button>'+button('CSV 내려받기','export','class="mp-button mp-secondary mp-small"')+'</form>';
}
function accountEditor() {
 const a=S.accountEdit||{id:null,username:'',name:'',team:'',role:'mentor',active:true},editing=Boolean(a.id),self=editing&&String(a.id)===String(S.user?.id);
 return '<form data-mp-form="account-edit" class="mp-panel" novalidate><h3>'+esc(editing?'계정 수정':'멘토 계정 만들기')+'</h3><div class="mp-form-message" role="alert"></div><div class="mp-fields">'+
 '<div class="mp-field"><label for="mpUsername">아이디<span class="mp-required">필수</span></label><input id="mpUsername" name="username" autocomplete="off" minlength="3" maxlength="40" pattern="[a-z0-9._-]{3,40}" value="'+esc(a.username)+'"'+(editing?' disabled':'')+' required><p class="mp-help">영문 소문자·숫자·점·밑줄·하이픈, 3~40자</p></div>'+
 '<div class="mp-field"><label for="mpName">이름<span class="mp-required">필수</span></label><input id="mpName" name="name" maxlength="80" value="'+esc(a.name)+'" required></div>'+
 '<div class="mp-field"><label for="mpTeam">담당 팀</label><input id="mpTeam" name="team" maxlength="80" value="'+esc(a.team)+'"></div>'+
 '<div class="mp-field"><label for="mpRole">권한</label><select id="mpRole" name="role"'+(self?' disabled':'')+'><option value="mentor"'+selected(a.role,'mentor')+'>멘토</option><option value="admin"'+selected(a.role,'admin')+'>관리자</option></select></div>'+
 (!editing?'<div class="mp-field mp-wide"><label for="mpInitialPassword">임시 비밀번호<span class="mp-required">필수</span></label><input id="mpInitialPassword" type="password" name="password" autocomplete="new-password" minlength="8" maxlength="128" required><p class="mp-help">8~128자로 입력해 주세요. 처음 로그인한 뒤 본인 비밀번호로 바꾸게 됩니다.</p></div>':'<div class="mp-field mp-wide"><label class="mp-inline-check"><input type="checkbox" name="active"'+(a.active?' checked':'')+(self?' disabled':'')+'> 로그인 가능한 계정</label></div>')+'</div><div class="mp-actions"><button type="submit" class="mp-button">'+(editing?'계정 변경 저장':'계정 만들기')+'</button>'+(editing?(!self?button('임시 비밀번호 재설정','account-reset','class="mp-button mp-secondary"'):'<a class="mp-link" href="#account">내 비밀번호 변경 →</a>')+button('새 계정 만들기','account-new','class="mp-button mp-secondary"'):'')+'</div></form>';
}
function accountsView() {if(accountsLoading)return '<div class="mp-loading" role="status">계정 목록을 불러오는 중입니다…</div>';return accountEditor()+'<section class="mp-panel"><h3>등록된 계정</h3><div class="mp-account-list">'+S.accounts.map(a=>'<button type="button" class="mp-account-row" data-mp-action="account-edit" data-id="'+esc(a.id)+'"><span><strong>'+esc(a.name||a.username)+'</strong><small>'+esc(a.username)+' · '+esc(a.team||'팀 미지정')+'</small></span><span><b>'+esc(a.role==='admin'?'관리자':'멘토')+'</b><small>'+esc(!a.active?'비활성':a.mustChangePassword?'비밀번호 변경 필요':'사용 중')+'</small></span></button>').join('')+'</div></section>';}
function adminView() {
 if(S.user.role!=='admin')return '<section class="mp-panel"><h3>관리자만 볼 수 있는 화면입니다</h3><a class="mp-link" href="#records">내 기록으로 이동 →</a></section>';
 return heading('관리자','제출 기록을 검토하고 멘토 계정을 관리해요.')+'<div class="mp-tabs" role="tablist" aria-label="관리자 기능">'+['records','accounts'].map((t,i)=>'<button type="button" role="tab" aria-selected="'+(S.adminTab===t)+'" data-mp-action="admin-tab" data-tab="'+t+'">'+(i?'계정 관리':'제출 기록 검토')+'</button>').join('')+'</div>'+
 (S.adminTab==='accounts'?accountsView():adminFilters()+'<div class="mp-admin-grid"><section class="mp-panel"><h3>기록 '+S.records.length+'건</h3>'+recordList(S.records,true)+'</section>'+recordDetail(S.adminDetail)+'</div>');
}
function passwordForm(forced) {return '<form data-mp-form="password" class="mp-panel mp-account-form" novalidate><h3>'+esc(forced?'먼저 비밀번호를 바꿔 주세요':'비밀번호 변경')+'</h3>'+(forced?'<p class="mp-note">임시 비밀번호로 로그인했습니다. 본인 비밀번호로 변경한 뒤 기록을 작성할 수 있어요.</p>':'')+'<div class="mp-form-message" role="alert"></div><div class="mp-field"><label for="mpCurrentPassword">현재 비밀번호</label><input id="mpCurrentPassword" type="password" name="currentPassword" autocomplete="current-password" maxlength="128" required></div><div class="mp-field"><label for="mpNewPassword">새 비밀번호</label><input id="mpNewPassword" type="password" name="newPassword" autocomplete="new-password" minlength="8" maxlength="128" required><p class="mp-help">8~128자로 입력해 주세요.</p></div><div class="mp-field"><label for="mpConfirmPassword">새 비밀번호 확인</label><input id="mpConfirmPassword" type="password" name="confirmPassword" autocomplete="new-password" minlength="8" maxlength="128" required></div><button type="submit" class="mp-button">비밀번호 변경</button></form>';}
function accountView() {
 if(!S.user)return gate();
 return heading('내 계정',(S.user.name||S.user.username)+' · '+(S.user.role==='admin'?'관리자':'멘토'))+passwordForm(S.user.mustChangePassword)+'<p class="mp-note">계정·비밀번호 문의는 운영자에게 해주세요.</p><div class="mp-actions">'+button('로그아웃','logout','class="mp-button mp-secondary"')+'</div>';
}
function render() {
 if(!S.root?.isConnected)return;S.root.classList.add('mentor-portal');
 let content='';
 if(!CLIENT?.isConfigured())content=connectionNotice();
 else if(S.loading)content='<div class="mp-loading" role="status">멘토 포털을 불러오는 중입니다…</div>';
 else if(S.error&&!S.me)content='<section class="mp-panel"><h3>멘토 포털에 연결하지 못했습니다</h3><p>'+esc(S.error)+'</p>'+button('다시 연결','retry')+'</section>';
 else if(S.view==='account')content=accountView();
 else if(S.user?.mustChangePassword)content=passwordForm(true)+'<div class="mp-actions">'+button('로그아웃','logout','class="mp-button mp-secondary"')+'</div>';
 else if(S.view==='home')content=homeView();
 else if(!S.user)content=gate();
 else if(S.view==='admin')content=adminView();
 else content=recordsView();
 S.root.innerHTML=(S.user&&!S.loading?links():'')+'<div class="mp-messages">'+banner()+'</div>'+content;
 authSlot();
}
async function loadList(epoch) {
 if(!S.user||S.user.mustChangePassword)return;
 const action=S.view==='admin'&&S.user.role==='admin'?(S.adminTab==='accounts'?'accounts':'admin-records'):'records';
 if(!['records','admin'].includes(S.view))return;
 const sequence=++listSequence;
 if(action==='accounts'){accountsLoading=true;render();}
 try{const result=await api(action,{query:action==='admin-records'?Object.fromEntries(Object.entries(S.filters).filter(([,v])=>v)):undefined,signal:S.controller?.signal});if(!alive(epoch)||sequence!==listSequence)return false;accountsLoading=false;if(action==='accounts')S.accounts=result.accounts||[];else S.records=result.records||[];render();return true;}
 catch(e){if(e.name!=='AbortError'&&alive(epoch)){accountsLoading=false;render();setMessage(errorMessage(e),true);}return false;}
}
async function mount() {
 const root=document.getElementById('mentorPortal'),epoch=++S.epoch;S.controller?.abort();S.controller=new AbortController();
 if(!CLIENT?.isConfigured()){S.root=root;S.user=null;S.me={user:null};S.loading=false;render();authSlot();return;}
 if(!root){S.root=null;authSlot();try{const me=await api('me',{signal:S.controller.signal});if(epoch!==S.epoch)return;const prior=S.user?.id;if(prior&&!me.user){expireSession();S.me=me;return;}if(prior!==me.user?.id){S.active=null;S.adminDetail=null;S.records=[];S.accounts=[];S.accountEdit=null;S.dirty=false;}S.me=me;S.user=me.user||null;authSlot();}catch{}return;}
 const view=root.dataset.portalView||'home';if(view!==S.view)S.records=[];S.root=root;S.view=view;S.week=Number(root.dataset.week)||S.week||1;S.error='';S.notice='';S.loading=true;render();
 if(!schemaPromise)schemaPromise=fetch(new URL('./portal-fields.json',document.baseURI),{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('입력 항목을 불러오지 못했습니다.');return r.json();}).catch(e=>{schemaPromise=null;throw e;});
 try{const [schema,me]=await Promise.all([schemaPromise,api('me',{signal:S.controller.signal})]);if(!alive(epoch))return;S.schema=schema;const prior=S.user?.id,priorRole=S.user?.role;if(prior&&!me.user){expireSession();S.me=me;render();return;}S.user=me.user||null;S.me=me;if(prior&&(prior!==S.user?.id||priorRole!==S.user?.role)){S.active=null;S.adminDetail=null;S.records=[];S.accounts=[];S.dirty=false;}S.loading=false;render();if(S.pending&&S.user&&!S.user.mustChangePassword&&S.view==='records'){const p=S.pending;S.pending=null;newRecord(p.kind,p.week); }await loadList(epoch);}
 catch(e){if(e.name==='AbortError'||!alive(epoch))return;S.loading=false;S.error=errorMessage(e);S.me=null;render();}
}
function navigate(hash){if(location.hash===hash)mount();else location.hash=hash;}
function confirmLeave(){return !S.dirty||window.confirm('서버에 저장하지 않은 입력이 있습니다. 다른 기록을 열까요?');}
function newRecord(kind,week) {
 if(!S.user){S.pending={kind,week:week||S.week};openLogin();return;}
 if(S.user.mustChangePassword){S.pending={kind,week:week||S.week};navigate('#account');return;}
 if(!confirmLeave())return;const w=Number(week)||S.week||1;S.week=w;S.active={id:null,kind,week:w,status:'draft',version:undefined,data:{name:S.user.name||'',team:S.user.team||'',session:w}};S.dirty=false;S.notice='';S.error='';
 if(S.view!=='records'){S.pending={kind,week:w};navigate('#records');return;}render();S.root.querySelector('.mp-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
}
async function openRecord(id,admin) {
 if(!admin&&!confirmLeave())return;const epoch=S.epoch,sequence=++detailSequence;S.error='';setMessage('기록을 불러오는 중입니다.',false);
 try{const result=await api('record',{query:{id},signal:S.controller?.signal});if(!alive(epoch)||sequence!==detailSequence)return;if(admin)S.adminDetail=result.record;else{S.active=result.record;S.dirty=false;}S.notice='';render();}
 catch(e){if(e.name!=='AbortError'&&alive(epoch))setMessage(errorMessage(e),true);}
}
function readRecordForm(form) {
 const data={...S.active.data};
 for(const f of S.schema.forms[S.active.kind].fields){const all=[...form.querySelectorAll('[data-mp-field="'+f.key+'"]')];if(f.type==='checkboxes')data[f.key]=all.filter(x=>x.checked).map(x=>x.value);else if(all[0])data[f.key]=f.type==='session'?Number(all[0].value):all[0].value;}
 return data;
}
function formError(form,message,conflict) {
 const box=form.querySelector('.mp-form-message');if(!box)return;box.textContent=message;box.className='mp-form-message mp-error';if(conflict){const b=document.createElement('button');b.type='button';b.className='mp-button mp-secondary mp-small';b.dataset.mpAction='latest';b.textContent='최신 기록 불러오기';box.append(document.createElement('br'),b);}box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function formClear(form){const box=form.querySelector('.mp-form-message');if(box){box.textContent='';box.className='mp-form-message';}}
function busy(form,value) {
 form.dataset.busy=String(value);
 form.querySelectorAll('input,textarea,select,button').forEach(el=>{if(value){el.dataset.mpDisabled=String(el.disabled);el.disabled=true;}else{el.disabled=el.dataset.mpDisabled==='true';delete el.dataset.mpDisabled;}});
}
function validateRequired(form,data) {
 for(const f of S.schema.forms[S.active.kind].fields)if(f.required&&(Array.isArray(data[f.key])?!data[f.key].length:!String(data[f.key]??'').trim())){formError(form,'‘'+f.label+'’을 작성해 주세요.');form.querySelector('[data-mp-field="'+f.key+'"]')?.focus();return false;}return true;
}
async function saveRecord(form,intent) {
 if(form.dataset.busy==='true'||!S.active)return;const data=readRecordForm(form);S.active.data=data;S.active.week=Number(data.session);S.dirty=true;if(intent==='submit'&&!validateRequired(form,data))return;
 const record=S.active,epoch=S.epoch,payload={kind:record.kind,week:record.week,data};if(record.id){payload.id=record.id;payload.version=record.version;}
 formClear(form);S.notice='';S.error='';const messages=S.root.querySelector('.mp-messages');if(messages)messages.innerHTML='';busy(form,true);
 try{const result=await api(intent,{body:payload});if(!alive(epoch))return;S.active=result.record||record;S.dirty=false;S.notice=intent==='save'?'서버에 임시저장했습니다.':'제출했습니다. 관리자 확인을 기다려 주세요.';S.error='';render();await loadList(epoch);}
 catch(e){if(alive(epoch)){formError(form,e.status===409?'다른 곳에서 이 기록이 변경됐습니다. 입력은 유지됩니다. 최신 기록을 확인한 뒤 다시 작성·저장해 주세요.':errorMessage(e),e.status===409);}}
 finally{if(form.isConnected)busy(form,false);}
}
function seedPlan() {
 if(!S.active||S.active.kind!=='plan'||!['draft','revision_requested'].includes(S.active.status))return;
 const form=S.root.querySelector('[data-mp-form="record"]');S.active.data=readRecordForm(form);const seed=window.MentorGuidePlanSeed?.(S.active.week);if(!seed){formError(form,'이번 주 운영안을 불러오지 못했습니다. 가이드를 참고해 직접 작성해 주세요.');return;}
 let count=0;for(const key of ['goal','flow','question','materials','completion'])if(!String(S.active.data[key]||'').trim()&&seed[key]!=null){S.active.data[key]=Array.isArray(seed[key])?seed[key].join('\n'):String(seed[key]);count++;}if(count){S.dirty=true;S.notice='비어 있던 '+count+'개 항목에 이번 주 운영안을 담았습니다. 내 활동에 맞게 확인해 주세요.';render();}else setMessage('이미 적은 내용을 유지했습니다. 채울 빈칸이 없습니다.',false);
}
function modalFrame(title,body) {
 closeModal(true);modalSequence++;modal=document.createElement('dialog');modal.className='mp-modal';modal.setAttribute('aria-labelledby','mpModalTitle');modal.innerHTML='<div class="mp-modal-header"><h2 id="mpModalTitle">'+esc(title)+'</h2><button type="button" class="mp-modal-close" data-mp-action="modal-close" aria-label="닫기">×</button></div>'+body;document.body.append(modal);modal.addEventListener('cancel',e=>{if(modalBusy)e.preventDefault();else closeModal();});modal.showModal();modal.querySelector('input:not([disabled])')?.focus();
}
function closeModal(force){if(modalBusy&&!force)return;if(modal){modal.close();modal.remove();modal=null;}modalBusy=false;modalSequence++;}
function openLogin() {
 if(!CLIENT?.isConfigured()){render();return;}
 if(S.user){navigate('#account');return;}
 modalFrame('멘토 로그인','<form data-mp-form="login" novalidate><p class="mp-note">운영자가 안내한 멘토 계정을 사용해 주세요.</p><div class="mp-form-message" role="alert"></div><div class="mp-field"><label for="mpLoginUsername">아이디</label><input id="mpLoginUsername" name="username" autocomplete="username" maxlength="40" required></div><div class="mp-field"><label for="mpLoginPassword">비밀번호</label><input id="mpLoginPassword" name="password" type="password" autocomplete="current-password" maxlength="128" required></div><button type="submit" class="mp-button mp-full">로그인</button></form><p class="mp-note">계정·비밀번호 문의는 운영자에게 해주세요.</p>');
}
async function accountRequest(form,action,body) {
 if(form.dataset.busy==='true')return;const epoch=S.epoch;formClear(form);busy(form,true);const inModal=Boolean(form.closest('.mp-modal'));if(inModal)modalBusy=true;
 try{const result=await api(action,{body});
 if(action==='login'){S.user=result.user||null;if(!S.user){const me=await api('me');S.user=me.user;S.me=me;}S.records=[];S.accounts=[];S.adminDetail=null;S.active=null;S.dirty=false;const restored=S.suspended&&String(S.suspended.userId)===String(S.user?.id);if(restored){S.active=S.suspended.record;S.dirty=true;}S.suspended=null;closeModal(true);authSlot();if(S.user?.mustChangePassword)navigate('#account');else if(S.pending||restored)navigate('#records');else {S.notice='로그인했습니다.';mount();}}
 else if(action==='password'){const me=await api('me');S.user=me.user;S.me=me;closeModal(true);if(S.pending)navigate('#records');else{render();setMessage('비밀번호를 변경했습니다.',false);}}
 else if(alive(epoch)){if(action==='account-update'&&result.user){S.user=result.user;S.me={...S.me,user:result.user};authSlot();}S.accountEdit=null;const loaded=await loadList(epoch);if(alive(epoch)&&loaded!==false)setMessage(action==='account-create'?'계정을 만들었습니다.':action==='account-reset'?'임시 비밀번호를 재설정했습니다. 다음 로그인에서 변경해야 합니다.':'계정 정보를 저장했습니다.',false);closeModal(true);}
 }catch(e){if(form.isConnected)formError(form,errorMessage(e));}
 finally{if(form.isConnected)busy(form,false);modalBusy=false;}
}
async function logout() {
 if(S.busy)return;if(S.dirty&&!window.confirm('저장하지 않은 입력을 닫고 로그아웃할까요?'))return;S.busy=true;
 let failed=false;
 try{await api('logout',{body:{}});}catch(e){failed=true;}finally{CLIENT.clearSession();++S.epoch;S.controller?.abort();S.user=null;S.me={user:null};S.active=null;S.adminDetail=null;S.accountEdit=null;S.records=[];S.accounts=[];S.dirty=false;S.pending=null;S.suspended=null;closeModal(true);S.notice=failed?'이 창에서 로그아웃했습니다.':'로그아웃했습니다.';S.error='';S.busy=false;render();authSlot();}
}
async function reviewRecord(buttonEl) {
 const r=S.adminDetail,form=buttonEl.closest('form');if(!r||form.dataset.busy==='true')return;const feedback=form.elements.feedback.value,statusValue=buttonEl.dataset.status;
 if(statusValue==='revision_requested'&&!feedback.trim()){formError(form,'보완할 내용을 피드백으로 남겨 주세요.');form.elements.feedback.focus();return;}
 const epoch=S.epoch;busy(form,true);formClear(form);
 try{const result=await api('review',{body:{id:r.id,status:statusValue,feedback,version:r.version}});if(!alive(epoch))return;S.adminDetail=result.record||null;await loadList(epoch);setMessage(statusValue==='reviewed'?'확인 완료로 처리했습니다.':'멘토에게 보완을 요청했습니다.',false);}
 catch(e){if(form.isConnected)formError(form,e.status===409?'기록이 변경됐습니다. 목록에서 최신 기록을 다시 열어 주세요.':errorMessage(e));}
 finally{if(form.isConnected)busy(form,false);}
}
async function exportCSV(buttonEl) {
 if(buttonEl.disabled)return;buttonEl.disabled=true;
 try{const blob=await api('export',{query:Object.fromEntries(Object.entries(S.filters).filter(([,v])=>v))}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mentor-records.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);setMessage('CSV 파일을 내려받았습니다.',false);}
 catch(e){if(e.status!==401)setMessage(errorMessage(e),true);}finally{if(buttonEl.isConnected)buttonEl.disabled=false;}
}
document.addEventListener('input',e=>{if(e.target.matches('[data-mp-form="review"] textarea[name="feedback"]')&&S.adminDetail)S.adminDetail.feedback=e.target.value;if(e.target.matches('[data-mp-field]')&&S.active){const form=e.target.closest('[data-mp-form="record"]');if(form){S.active.data=readRecordForm(form);S.active.week=Number(S.active.data.session);S.dirty=true;}}});
document.addEventListener('change',e=>{if(e.target.matches('[data-mp-week]'))S.week=Number(e.target.value);});
document.addEventListener('submit',e=>{
 const form=e.target.closest('[data-mp-form]');if(!form)return;e.preventDefault();if(form.dataset.busy==='true')return;const type=form.dataset.mpForm,data=Object.fromEntries(new FormData(form));
 if(type==='account-edit'&&!S.accountEdit?.id&&data.username&&!/^[a-z0-9._-]{3,40}$/.test(data.username.trim())){formError(form,'아이디는 영문 소문자·숫자·점·밑줄·하이픈으로 3~40자 입력해 주세요.');return;}
 const newPassword=type==='password'?data.newPassword:['account-edit','account-reset'].includes(type)?data.password:null;if(newPassword!=null&&(newPassword.length<8||newPassword.length>128)){formError(form,'새 비밀번호는 8~128자로 입력해 주세요.');return;}
 if(type==='record'){saveRecord(form,e.submitter?.dataset.recordIntent||'save');return;}
 if(type==='filters'){S.filters={week:data.week||'',type:data.type||'',status:data.status||''};loadList(S.epoch);return;}
 if(type==='login'){if(!data.username?.trim()||!data.password){formError(form,'아이디와 비밀번호를 입력해 주세요.');return;}accountRequest(form,'login',{username:data.username.trim(),password:data.password});return;}
 if(type==='password'){if(!data.currentPassword||!data.newPassword){formError(form,'현재 비밀번호와 새 비밀번호를 입력해 주세요.');return;}if(data.newPassword!==data.confirmPassword){formError(form,'새 비밀번호가 서로 다릅니다.');return;}accountRequest(form,'password',{currentPassword:data.currentPassword,newPassword:data.newPassword});return;}
 if(type==='account-edit'){const a=S.accountEdit,role=form.elements.role.value;if(!data.name?.trim()||(!a?.id&&(!data.username?.trim()||!data.password))){formError(form,'아이디·이름·임시 비밀번호를 확인해 주세요.');return;}if(role==='admin'&&a?.role!=='admin'&&!window.confirm('이 계정에 관리자 권한을 부여할까요?'))return;accountRequest(form,a?.id?'account-update':'account-create',a?.id?{id:a.id,name:data.name.trim(),team:data.team||'',role,active:form.elements.active.checked}:{username:data.username.trim(),name:data.name.trim(),team:data.team||'',role,password:data.password});return;}
 if(type==='account-reset'){if(!data.password){formError(form,'새 임시 비밀번호를 입력해 주세요.');return;}accountRequest(form,'account-reset',{id:S.accountEdit.id,password:data.password});}
});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-mp-action]');if(!b||b.disabled)return;const action=b.dataset.mpAction;
 if(action==='login')openLogin();if(action==='modal-close')closeModal();if(action==='account')navigate('#account');if(action==='logout')logout();if(action==='retry')mount();
 if(action==='new')newRecord(b.dataset.kind,S.week);if(action==='open')openRecord(b.dataset.id,false);if(action==='admin-open')openRecord(b.dataset.id,true);
 if(action==='close-record'){if(confirmLeave()){S.active=null;S.dirty=false;render();}}
 if(action==='seed')seedPlan();if(action==='latest'&&S.active?.id&&confirmLeave())openRecord(S.active.id,false);
 if(action==='reload')loadList(S.epoch);
 if(action==='admin-tab'){S.adminTab=b.dataset.tab;S.records=[];S.adminDetail=null;S.accountEdit=null;render();loadList(S.epoch);}
 if(action==='review')reviewRecord(b);if(action==='export')exportCSV(b);
 if(action==='account-edit'){S.accountEdit=S.accounts.find(a=>String(a.id)===b.dataset.id)||null;render();S.root.querySelector('[data-mp-form="account-edit"]')?.scrollIntoView({behavior:'smooth',block:'start'});}
 if(action==='account-new'){S.accountEdit=null;render();}
 if(action==='account-reset'&&S.accountEdit)modalFrame('임시 비밀번호 재설정','<form data-mp-form="account-reset" novalidate><p>'+esc(S.accountEdit.name||S.accountEdit.username)+' 계정의 비밀번호를 재설정합니다. 다음 로그인에서 본인 비밀번호로 변경해야 합니다.</p><div class="mp-form-message" role="alert"></div><div class="mp-field"><label for="mpResetPassword">새 임시 비밀번호</label><input id="mpResetPassword" type="password" name="password" autocomplete="new-password" minlength="8" maxlength="128" required><p class="mp-help">8~128자로 입력해 주세요.</p></div><button type="submit" class="mp-button">임시 비밀번호 재설정</button></form>');
});
window.addEventListener('beforeunload',e=>{if(S.dirty){e.preventDefault();e.returnValue='';}});
window.MentorPortal={mount,openLogin};
})();

