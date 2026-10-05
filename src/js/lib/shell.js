// 모든 화면이 함께 쓰는 틀 — 모이자 UI 프로토타입2의 헤더(뒤로·로고·홈), 본문(스크롤), 아래 고정 버튼 영역, 안내 토스트.
// 화면은 createShell(container)로 틀을 만든 뒤 screen·foot 안에 자기 내용을 채운다.

import { t } from './data.js';

// 탭·홈 화면 아이콘(favicon.svg)도 같은 그림이다. 바꾸면 함께 바꾼다(tests/icons.test.js가 확인, #76)
const LOGO_SVG = '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M5 6 13 12.5M21 6 13 12.5M13 21v-8.5" stroke="#E7C3B4" stroke-width="1.6"/><circle cx="5" cy="6" r="3" fill="#D9512C"/><circle cx="21" cy="6" r="3" fill="#D9512C"/><circle cx="13" cy="21" r="3" fill="#D9512C"/><circle cx="13" cy="12.5" r="3.4" fill="#2B2A28"/></svg>';
const BACK_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M9 2 4 7l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HOME_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7M6.5 9.5V20h11V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** DOM 요소 만들기. children은 요소나 문자열. */
export function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const BACK_BUTTON = '.icon-btn.back'; // 화면 위쪽 [뒤로] 버튼
const isBackButton = (event) => Boolean(event?.target?.closest?.(BACK_BUTTON));
const isKakaoTalk = (win) => /KAKAOTALK/i.test(win?.navigator?.userAgent ?? '');
const LEAVE_STEP_MS = 400; // 뒤로 한 칸 간 뒤 이만큼 아무 일도 없으면 더 돌아갈 곳이 없는 것

// ---------- 화면 이동 기록 (#44, 10/4 전체 설계: 화면_이동_설계.md) ----------
// 화면이 바뀌는 길은 셋뿐이다. 링크 누르기·주소 바꾸기·페이지 다시 불러오기로 화면을 바꾸지 않는다.
//   쌓기 go()      다음 화면. '지금 화면 + 돌아올 때 입력값'을 앱 안 기록(stack)에 쌓고 브라우저 기록도 한 칸 남긴다(주소도 함께 바꿀 수 있다)
//   바꾸기 replace() 같은 자리를 다른 화면으로(방이 확정되어 출발지 입력·참여자 입력 → 나의 경로). 기록은 그대로
//   새 출발 restart() 앱 안 기록을 비우고 첫 화면([홈], 링크 오류의 '처음으로'). 페이지를 다시 불러오지 않는다
// [뒤로] 버튼과 휴대폰 뒤로가기는 같은 결과: 앱 안 기록에서 하나 꺼내 그 화면을 그때 입력값으로 다시 그린다.
// 출발점(앱 안 기록이 비어 있음)에서 뒤로가기: 1번째 '한 번 더 누르면 종료돼요', 2번째 종료. 둘을 섞어 눌러도 2번째에 종료.
//   안내 뒤 화면의 다른 곳을 누르면 다시 안내부터. [뒤로] 버튼을 누른 것은 '화면을 누름'으로 치지 않는다.
// 브라우저 기록 칸의 state: { eodiga3: 깊이, seq: 순번, root?: true }
//   root 는 앱을 연 자리(출발점 바깥). 깊이 0 칸은 출발점 화면의 '나가기 확인 자리'(휴대폰 뒤로가기 한 번에 나가지 않게).
//   순번은 칸을 만들 때마다 커지는 수(시각 기준)라서, 뒤로가기로 떨어진 칸이 지금보다 작으면 '뒤로', 크면 '앞으로'(무시),
//   앱 안 기록에 없는데 작으면 '옛 기록'(새로고침·새 출발 뒤에 남은 것)으로 가린다. 옛 기록은 출발점처럼 안내 → 종료.
// 종료: 카카오톡 안 브라우저는 kakaotalk://inappbrowser/close 로 창을 닫는다. 그 밖은 우리 칸을 연쇄로 건너뛰어 앱을 열기 전
//   페이지로 간다. 더 돌아갈 곳이 없으면 창 닫기를 시도하고, 그래도 남아 있으면 '브라우저 창을 닫아 주세요'.
// 휴대폰 뒤로가기를 가로채는 두 장치:
//   나가기 확인 자리 — 출발점에서 사용자가 처음 누르거나 키를 칠 때 깐다(휴대폰 Chrome 은 누르기 전에 만든 칸을 뒤로가기 때 건너뛴다)
//   CloseWatcher — 안드로이드 크롬·출발점에서만. 누르기 전의 첫 뒤로가기도 안내로 바꾼다. PC(Esc 키에 반응)·카카오톡(받지 못하고
//   걸어 두면 [뒤로] 두 번 닫기까지 막힘, 10/4 확인)에서는 걸지 않는다.

/**
 * 화면 이동 기록을 만든다. 화면 코드는 아래 기본 인스턴스의 startAt·go·replace·restart·goBack·goHome 을 쓴다(검사에서는 가짜 window).
 * @param {Window|null|undefined} win history·addEventListener·location 을 가진 객체
 * @param {{onExitHint?: () => void, onStay?: () => void, now?: () => number}} options
 *   onExitHint '한 번 더 누르면 종료돼요' 안내 / onStay 나가지 못했을 때 안내 / now 순번에 쓸 시각(검사용)
 */
export function createNavigator(win, { onExitHint = () => {}, onStay = () => {}, now = Date.now } = {}) {
  const stack = [];      // 이전 화면들 [{ renderFn, container, params, seq }]
  let current = null;    // 지금 화면 { renderFn, container, params, seq }  (seq = 이 화면의 브라우저 기록 칸 순번)
  let rootSeq = null;    // 출발점 바깥(root) 칸의 순번
  let home = null;       // restart 에 쓸 첫 화면 { renderFn, container }
  let usingHistory = false; // 브라우저 기록을 쓸 수 있는지(막힌 환경이면 앱 안 기록만 쓴다)
  let guarded = false;      // 출발점 위에 '나가기 확인 자리'가 있는지
  let exitArmed = false;    // '한 번 더 누르면 종료돼요'를 띄운 뒤인지 (다음 뒤로가기는 종료)
  let leaving = 0;          // 종료 중(연쇄 뒤로가기)이면 그 회차 번호
  let watcher = null;       // 출발점에서 휴대폰 뒤로가기를 먼저 받는 CloseWatcher
  let listening = false;
  let lastSeq = 0;

  const nextSeq = () => { lastSeq = Math.max(now(), lastSeq + 1); return lastSeq; };
  const browserHistory = () => { try { return win?.history ?? null; } catch { return null; } };
  const pushState = (state, url) => { try { url ? browserHistory().pushState(state, '', url) : browserHistory().pushState(state, ''); return true; } catch { return false; } };
  const replaceState = (state, url) => { try { url ? browserHistory().replaceState(state, '', url) : browserHistory().replaceState(state, ''); return true; } catch { return false; } };
  const armExit = () => { exitArmed = true; onExitHint(); };
  const atRoot = () => !stack.length;

  // ----- CloseWatcher -----
  function watchBack() {
    const ua = win?.navigator?.userAgent ?? '';
    if (watcher || !atRoot() || typeof win?.CloseWatcher !== 'function' || !/Android/i.test(ua) || isKakaoTalk(win)) return;
    try {
      watcher = new win.CloseWatcher();
      watcher.onclose = () => { watcher = null; onBackAtRoot(); };
    } catch {
      watcher = null;
    }
  }
  function unwatchBack() {
    try { watcher?.destroy(); } catch { /* 이미 닫힘 */ }
    watcher = null;
  }

  // ----- 그리기 -----
  function show(entry) {
    current = entry;
    const drawn = entry.renderFn(entry.container, entry.params);
    if (atRoot()) watchBack(); // 출발점(으로 돌아옴)이면 CloseWatcher 를 건다
    return drawn;
  }

  // ----- 종료 -----
  /** 출발점에서 뒤로가기: 1번째 안내, 2번째 종료 */
  function onBackAtRoot() {
    if (!exitArmed) return armExit();
    exitArmed = false;
    leave();
  }

  /** 앱 밖으로 나간다. 카카오톡은 창 닫기, 그 밖은 우리 칸을 연쇄로 건너뛰기(onPop 이 이어 간다) → 못 나가면 창 닫기 시도 → 안내 */
  function leave() {
    unwatchBack();
    guarded = false;
    if (isKakaoTalk(win)) { win.location.href = 'kakaotalk://inappbrowser/close'; return; }
    if (!usingHistory) return stay();
    leaving += 1;
    leaveStep(leaving);
  }
  function leaveStep(round) {
    try { browserHistory().back(); } catch { return stay(); }
    win.setTimeout?.(() => { if (leaving === round) stay(); }, LEAVE_STEP_MS); // 뒤로 갈 곳이 없어 popstate 가 오지 않았다
  }
  function stay() {
    leaving = 0;
    try { win.close(); } catch { /* 스스로 연 창이 아니면 막힌다 */ }
    const notify = () => { if (win?.document?.visibilityState !== 'hidden') onStay(); };
    if (win?.setTimeout) win.setTimeout(notify, 300); else notify();
  }

  // ----- 사용자 동작 -----
  /** 출발점에서 사용자가 누르거나 키를 쳤을 때 '나가기 확인 자리'를 깐다(사용자 동작 직후라 휴대폰이 건너뛰지 않음).
   *  [뒤로] 버튼이 아닌 곳을 누르면 종료 안내를 거둔다(다음 뒤로가기는 다시 안내부터). */
  function onUserActivation(event) {
    if (event && !isBackButton(event)) { exitArmed = false; watchBack(); }
    if (!usingHistory || guarded || !atRoot() || leaving) return;
    const seq = nextSeq();
    guarded = pushState({ eodiga3: 0, seq });
    if (guarded && current) current.seq = seq; // 출발점 화면의 칸은 이제 이 자리다
  }

  // ----- 휴대폰 뒤로가기(popstate) -----
  /** @returns {'back'|'hint'|'leave'|'forward'|undefined} */
  function onPop(state) {
    if (!state || typeof state !== 'object' || !('eodiga3' in state)) { leaving = 0; return undefined; } // 우리 칸이 아님
    if (leaving) { leaveStep(leaving); return 'leave'; } // 종료 중: 우리 칸이면 계속 건너뛴다
    if (current && state.seq > current.seq) return 'forward'; // 앞으로 가기는 무시
    const live = stack.find((e) => e.seq === state.seq); // 앱 안 기록에 있는 화면인가
    if (live) {
      let entry = current;
      while (stack.length && stack[stack.length - 1].seq >= state.seq) entry = stack.pop();
      show(entry);
      return 'back';
    }
    // 출발점 바깥(root)이거나 옛 기록(새로고침·새 출발 뒤에 남은 칸): 출발점에서 뒤로가기한 것과 같게 본다
    if (state.root && state.seq === rootSeq) guarded = false;
    if (!exitArmed) { armExit(); return 'hint'; }
    exitArmed = false;
    leave();
    return 'leave';
  }

  // ----- 세 가지 이동 -----
  /**
   * 출발점. 앱 안 기록을 비우고 지금 브라우저 칸을 '앱을 연 자리'로 표시한다. @param {{url?: string}} options url 이 있으면 주소도 바꾼다(restart)
   */
  function startAt(renderFn, container, params = {}, { url } = {}) {
    stack.length = 0;
    guarded = false;
    exitArmed = false;
    leaving = 0;
    unwatchBack();
    rootSeq = nextSeq();
    usingHistory = replaceState({ eodiga3: 0, seq: rootSeq, root: true }, url);
    if (usingHistory && !listening) {
      win.addEventListener('popstate', (event) => onPop(event.state));
      // 휴대폰은 손가락이 닿는 순간이 아니라 탭이 끝날 때를 사용자 동작으로 인정하므로 click 에서 깐다.
      // 캡처 단계라 버튼 자신의 click 보다 먼저 실행된다 → 출발점에서 버튼을 누르면 자리가 먼저 생기고 그다음 화면 이동 칸이 쌓인다
      win.addEventListener('click', onUserActivation, true);
      win.addEventListener('keydown', onUserActivation, true);
      listening = true;
    }
    return show({ renderFn, container, params, seq: rootSeq });
  }

  /**
   * 쌓기: 다음 화면으로.
   * @param {{back?: object, url?: string, adopt?: boolean}} options
   *   back  지금 화면으로 돌아올 때 쓸 입력값(지금 params 대신). 예: 입력한 참여자 목록
   *   url   함께 바꿀 주소(새로고침·공유용). 예: 내 약속에서 연 약속의 링크
   *   adopt 브라우저가 이미 칸을 만들었을 때(주소창에 링크를 붙여넣음) 그 칸을 이 화면의 칸으로 받아들인다
   */
  function go(renderFn, container, params = {}, { back, url, adopt = false } = {}) {
    if (!adopt) onUserActivation(); // 출발점 화면의 자리가 아직 없으면 먼저 깐다(받아들이는 칸 위에는 깔지 않는다)
    unwatchBack();      // 다른 화면에서는 휴대폰 뒤로가기가 그대로 이전 화면으로 가야 한다
    exitArmed = false;
    if (current) stack.push(back ? { ...current, params: back } : current);
    current = { renderFn, container, params, seq: nextSeq() };
    if (usingHistory) (adopt ? replaceState : pushState)({ eodiga3: stack.length, seq: current.seq }, url);
    return renderFn(container, params);
  }

  /** 바꾸기: 같은 자리를 다른 화면으로. 뒤로가기는 그 전 화면으로 간다 */
  function replace(renderFn, container, params = {}) {
    current = { ...(current ?? { seq: nextSeq() }), renderFn, container, params };
    return renderFn(container, params);
  }

  /** 새 출발: 앱 안 기록을 비우고 첫 화면. 주소는 앱 주소로. 남은 옛 칸은 뒤로가기 때 출발점처럼 처리된다 */
  function restart(renderFn, container, params = {}) {
    let url;
    try { url = win?.location?.pathname; } catch { url = undefined; }
    return startAt(renderFn, container, params, { url });
  }

  /** [홈]·'처음으로'가 열 첫 화면을 등록한다(main.js). 등록 전에는 goHome 이 페이지를 다시 불러온다 */
  function setHome(renderFn, container) { home = { renderFn, container }; }
  function goHome() {
    if (home) return restart(home.renderFn, home.container, {});
    try { win.location.href = win.location.pathname; } catch { /* 검사용 가짜 window */ }
    return undefined;
  }

  /** [뒤로] 버튼. 기록이 있으면 휴대폰 뒤로가기와 같은 길로, 출발점이면 안내 → 종료 */
  function goBack() {
    if (atRoot()) return onBackAtRoot();
    if (usingHistory) {
      try { browserHistory().back(); return; } catch { usingHistory = false; }
    }
    show(stack.pop());
  }

  return { startAt, go, replace, restart, goBack, goHome, setHome, onPop, onUserActivation, depth: () => stack.length };
}

let activeToast = () => {};
const appNav = createNavigator(globalThis.window, {
  onExitHint: () => activeToast(t('nav.exitHint')),
  onStay: () => activeToast(t('nav.closeHint')),
});
export const { startAt, go, replace, restart, goBack, goHome, setHome } = appNav;

function header(showNav) {
  const back = el('button', {
    type: 'button', className: 'icon-btn back', ariaLabel: t('join.back'), hidden: !showNav,
    onclick: () => goBack(),
  });
  back.innerHTML = `${BACK_SVG}${t('join.back')}`;
  const logo = el('div', { className: 'logo', ariaLabel: t('app.name') });
  logo.innerHTML = LOGO_SVG;
  logo.append(t('app.name'));
  const home = el('button', {
    type: 'button', className: 'icon-btn home', ariaLabel: t('join.home'), title: t('join.home'), hidden: !showNav, onclick: goHome,
  });
  home.innerHTML = HOME_SVG;
  return el('header', { className: 'bar' }, [back, logo, home]);
}

/**
 * 화면 틀을 만들어 container에 넣는다.
 * @param {HTMLElement} container
 * @param {{nav?: boolean}} options nav=false면 뒤로·홈 버튼을 숨긴다(첫 화면)
 * @returns {{screen: HTMLElement, foot: HTMLElement, toast: (message: string) => void}}
 */
export function createShell(container, { nav = true } = {}) {
  const screen = el('section', { className: 'screen' });
  const foot = el('footer', { className: 'foot' });
  const toastNode = el('div', { className: 'toast', role: 'status' });
  container.replaceChildren(header(nav), screen, foot, toastNode);
  let timer;
  const toast = (message) => {
    toastNode.textContent = message;
    toastNode.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => toastNode.classList.remove('show'), 1800);
  };
  activeToast = toast; // 뒤로가기 '한 번 더 누르면 종료돼요' 안내는 지금 화면의 토스트로
  return { screen, foot, toast };
}
