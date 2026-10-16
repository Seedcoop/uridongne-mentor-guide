(function () {
  'use strict';
  const state = { week: '', rows: [], codes: [], detail: null, loading: false, message: '', error: '', truncated: false };
  let context = null, sequence = 0, detailSequence = 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(date); };
  const current = () => Boolean(context?.isCurrent() && !context.signal?.aborted);
  const request = (action, body) => window.MentorPortalClient.requestStudentAdmin(action, { body, signal: context?.signal });
  function message(error) { return error?.name === 'AbortError' ? '' : error?.message === 'Failed to fetch' ? '학생 응답 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' : error?.message || '요청을 완료하지 못했습니다.'; }
  function weekOptions() { return '<option value="">모든 주차</option>' + Array.from({ length: 6 }, (_, i) => '<option value="' + (i + 1) + '"' + (String(i + 1) === state.week ? ' selected' : '') + '>' + (i + 1) + '주차</option>').join(''); }
  function detail() {
    const row = state.detail;
    if (!row) return '<section class="mp-panel mp-empty">목록에서 학생 응답을 선택해 주세요.</section>';
    const labels = Object.fromEntries((window.WorkshopTools?.getFields?.(row.week) || []).map(field => [field.key, field.label]));
    return '<section class="mp-panel"><p class="mp-eyebrow">학생 제출 응답 · ' + esc(row.week) + '주차</p><h3>' + esc(row.team) + ' · ' + esc(row.name) + '</h3><p class="mp-note">' + esc(when(row.submittedAt)) + '</p><pre class="student-response-output">' + esc(row.output || '') + '</pre><details><summary>질문별 입력 보기</summary><dl class="mp-detail">' + Object.entries(row.answers || {}).map(([key, value]) => '<div><dt>' + esc(labels[key] || key) + '</dt><dd>' + esc(value) + '</dd></div>').join('') + '</dl></details></section>';
  }
  function codeSettings() {
    return '<details class="mp-panel student-code-settings"><summary>주차별 입장코드 관리</summary><p class="mp-note">코드를 바꾸거나 입장을 중지하면 해당 주차에 입장했던 학생도 새로 입장해야 합니다.</p><div class="student-code-grid">' + state.codes.map(code => '<form data-student-code-form data-week="' + esc(code.week) + '" class="student-code-form"><h4>' + esc(code.week) + '주차 <small>' + (code.configured ? '코드 설정됨' : '코드 미설정') + '</small></h4><label for="student-code-' + esc(code.week) + '">새 입장코드</label><input id="student-code-' + esc(code.week) + '" name="code" type="password" maxlength="64" autocomplete="new-password" placeholder="' + (code.configured ? '유지하려면 비워 두세요' : '입장코드를 정해 주세요') + '"><label class="mp-inline-check"><input type="checkbox" name="active"' + (code.active ? ' checked' : '') + '> 학생 입장 허용</label><button type="submit" class="mp-button mp-small">설정 저장</button><p class="student-code-result" role="status"></p></form>').join('') + '</div></details>';
  }
  function body() {
    const studentURL = new URL('./student.html', document.baseURI).href;
    return '<section class="mp-panel student-share"><h3>학생 도구 입장 주소</h3><p>학생은 계정 없이 주차별 입장코드로 도구에 들어와 팀명과 이름을 적고 응답을 제출합니다.</p><a class="mp-link" href="' + esc(studentURL) + '" target="_blank" rel="noopener noreferrer">학생 페이지 열기 ↗</a><button type="button" class="mp-button mp-secondary mp-small" data-student-admin-action="copy-link">주소 복사</button></section>' +
      (state.error ? '<p class="mp-message mp-error" role="alert">' + esc(state.error) + '</p>' : '') +
      (state.message ? '<p class="mp-message mp-success" role="status">' + esc(state.message) + '</p>' : '') +
      '<form data-student-filter-form class="mp-filters"><label>제출 주차<select name="week">' + weekOptions() + '</select></label><button class="mp-button mp-small" type="submit"' + (state.loading ? ' disabled' : '') + '>조회</button></form>' +
      (state.loading ? '<p class="mp-loading" role="status">학생 응답을 불러오는 중입니다…</p>' : '<div class="mp-admin-grid"><section class="mp-panel"><h3>학생 응답 ' + state.rows.length + '건</h3>' + (state.truncated ? '<p class="mp-note">최근 응답만 표시했습니다. 주차를 선택해 범위를 좁혀 주세요.</p>' : '') + (state.rows.length ? '<div class="mp-record-list">' + state.rows.map(row => '<button type="button" class="mp-record-row" data-student-admin-action="open" data-id="' + esc(row.id) + '"><span><strong>' + esc(row.week) + '주차 · ' + esc(row.team) + ' · ' + esc(row.name) + '</strong><small>' + esc(when(row.submittedAt)) + '</small></span><span>응답 보기 →</span></button>').join('') + '</div>' : '<p class="mp-empty">아직 제출된 학생 응답이 없습니다.</p>') + '</section>' + detail() + '</div>') + codeSettings();
  }
  function render() { return '<section id="studentAdminPanel">' + body() + '</section>'; }
  function draw() { const root = document.getElementById('studentAdminPanel'); if (root && current()) root.innerHTML = body(); }
  async function load(options) {
    context = options;
    const turn = ++sequence;
    ++detailSequence;
    state.loading = true; state.error = ''; state.detail = null; draw();
    try {
      const [records, codes] = await Promise.all([request('admin-list', state.week ? { week: Number(state.week) } : {}), request('admin-codes', {})]);
      if (turn !== sequence || !current()) return false;
      state.rows = records.submissions || []; state.truncated = Boolean(records.truncated); state.codes = codes.codes || [];
      return true;
    } catch (error) { if (turn === sequence && current()) state.error = message(error); return false; }
    finally { if (turn === sequence && current()) { state.loading = false; draw(); } }
  }
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-student-filter-form],[data-student-code-form]');
    if (!form || !current() || !form.closest('#studentAdminPanel')) return;
    event.preventDefault();
    if (form.dataset.busy === 'true') return;
    if (form.hasAttribute('data-student-filter-form')) { state.week = form.elements.week.value; state.message = ''; await load(context); return; }
    const code = form.elements.code.value.trim(), active = form.elements.active.checked, result = form.querySelector('[role="status"]');
    const configured = state.codes.find(item => item.week === Number(form.dataset.week))?.configured;
    if (active && !configured && !code) { result.textContent = '입장코드를 입력해 주세요.'; return; }
    if (code && code.length > 64) { result.textContent = '입장코드는 1~64자로 입력해 주세요.'; return; }
    form.dataset.busy = 'true'; form.querySelector('button').disabled = true; result.textContent = '저장 중입니다…';
    try {
      const response = await request('admin-code-set', { week: Number(form.dataset.week), active, ...(code ? { code } : {}) });
      form.elements.code.value = '';
      if (!current()) return;
      state.codes = response.codes || state.codes;
      state.message = form.dataset.week + '주차 입장 설정을 저장했습니다.'; state.error = ''; draw();
    } catch (error) { if (current() && form.isConnected) { result.textContent = message(error); form.querySelector('button').disabled = false; form.dataset.busy = ''; } }
  });
  document.addEventListener('click', async event => {
    const control = event.target.closest('[data-student-admin-action]');
    if (!control || !current() || !control.closest('#studentAdminPanel') || control.disabled) return;
    if (control.dataset.studentAdminAction === 'copy-link') {
      try { await navigator.clipboard.writeText(new URL('./student.html', document.baseURI).href); state.message = '학생 입장 주소를 복사했습니다.'; state.error = ''; }
      catch { state.error = '주소를 복사하지 못했습니다. 학생 페이지를 열어 주소를 복사해 주세요.'; }
      draw(); return;
    }
    const turn = ++detailSequence;
    control.disabled = true;
    try {
      const response = await request('admin-detail', { id: control.dataset.id });
      if (current() && turn === detailSequence) { state.detail = response.submission; state.error = ''; draw(); }
    } catch (error) { if (current() && turn === detailSequence) { state.error = message(error); draw(); } }
  });
  function reset() { ++sequence; ++detailSequence; context = null; Object.assign(state, { week: '', rows: [], codes: [], detail: null, loading: false, message: '', error: '', truncated: false }); }
  window.StudentAdmin = Object.freeze({ render, load, reset });
})();
