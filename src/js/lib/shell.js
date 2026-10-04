// 모든 화면이 함께 쓰는 틀 — 모이자 UI 프로토타입2의 헤더(뒤로·로고·홈), 본문(스크롤), 아래 고정 버튼 영역, 안내 토스트.
// 화면은 createShell(container)로 틀을 만든 뒤 screen·foot 안에 자기 내용을 채운다.

import { t } from './data.js';

const LOGO_SVG = '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M5 6 13 12.5M21 6 13 12.5M13 21v-8.5" stroke="#E7C3B4" stroke-width="1.6"/><circle cx="5" cy="6" r="3" fill="#D9512C"/><circle cx="21" cy="6" r="3" fill="#D9512C"/><circle cx="13" cy="21" r="3" fill="#D9512C"/><circle cx="13" cy="12.5" r="3.4" fill="#2B2A28"/></svg>';
const BACK_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M9 2 4 7l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HOME_SVG = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7M6.5 9.5V20h11V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** DOM 요소 만들기. children은 요소나 문자열. */
export function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function goHome() {
  location.href = location.pathname;
}

// ---------- 화면 이동 기록 (#44) ----------
// 화면을 바꿀 때 go()로 '이전 화면 + 그때 입력값'을 앱 안 기록에 쌓고 브라우저 기록도 하나 남긴다.
// [뒤로] 버튼과 휴대폰 뒤로가기는 둘 다 브라우저 뒤로가기(popstate)로 처리해 바로 이전 화면을 그때 입력값으로 다시 그린다.
// 첫 화면에서 뒤로가기: 1번이면 '한 번 더 누르면 종료돼요', 이어서 1번 더 누르면 앱 밖으로 나간다.
//   휴대폰 Chrome은 사용자가 화면을 누르기 전에 페이지가 스스로 만든 기록을 뒤로가기 때 건너뛴다.
//   그래서 '나가기 확인' 자리는 앱을 열 때가 아니라 첫 화면에서 처음 누르거나 키를 칠 때 만든다(guard).
//   안내를 띄운 뒤에는 자리를 다시 만들지 않아 다음 뒤로가기는 그대로 나간다. 그 사이 화면을 다시 누르면 자리를 다시 만든다.
// 브라우저 기록 항목의 state: { eodiga3: 깊이 } (root: true 는 앱을 연 자리 = 첫 화면 바깥)

/**
 * 화면 이동 기록을 만든다. 화면 코드는 아래 기본 인스턴스의 go·startAt·goBack을 쓴다(검사에서는 가짜 window를 넣는다).
 * @param {Window|null|undefined} win history·addEventListener를 가진 객체
 * @param {{onExitHint?: () => void, onFallbackHome?: () => void}} options
 */
export function createNavigator(win, { onExitHint = () => {}, onFallbackHome = goHome } = {}) {
  const stack = [];   // 이전 화면들 [{ renderFn, container, params }]
  let current = null; // 지금 화면
  let usingHistory = false; // 브라우저 기록을 쓸 수 있는지(막힌 환경이면 앱 안 기록만 쓴다)
  let guarded = false;      // 첫 화면 위에 '나가기 확인' 자리가 있는지
  let listening = false;

  const browserHistory = () => { try { return win?.history ?? null; } catch { return null; } };
  const push = (state) => { try { browserHistory().pushState(state, ''); return true; } catch { return false; } };

  function show(entry) {
    current = entry;
    return entry.renderFn(entry.container, entry.params);
  }

  /** 첫 화면에서 사용자가 누르거나 키를 쳤을 때: '나가기 확인' 자리를 만든다(사용자 동작 직후라 휴대폰이 건너뛰지 않음). */
  function onUserActivation() {
    if (!usingHistory || guarded || stack.length) return;
    guarded = push({ eodiga3: 0 });
  }

  /** 브라우저 뒤로가기(popstate) 처리. @returns {'back'|'hint'|undefined} */
  function onPop(state) {
    if (!state || typeof state !== 'object' || !('eodiga3' in state)) return undefined; // 우리 기록이 아님(#d= 붙여넣기 등)
    if (state.root) { // 첫 화면에서 뒤로 → 안내. 자리는 다시 만들지 않아 한 번 더 누르면 나간다
      guarded = false;
      onExitHint();
      return 'hint';
    }
    const target = state.eodiga3;
    if (!(target < stack.length)) return undefined; // 앞으로 가기는 무시
    let entry = current;
    while (stack.length > target) entry = stack.pop();
    show(entry);
    return 'back';
  }

  /** 앱을 열 때 첫 화면을 그린다. 앱 안 기록을 비우고 지금 브라우저 기록을 '앱을 연 자리'로 표시한다. */
  function startAt(renderFn, container, params = {}) {
    stack.length = 0;
    guarded = false;
    try {
      browserHistory().replaceState({ eodiga3: 0, root: true }, '');
      usingHistory = true;
    } catch {
      usingHistory = false;
    }
    if (usingHistory && !listening) {
      win.addEventListener('popstate', (event) => onPop(event.state));
      // 누르는 순간(pointerdown)이 click보다 먼저라, 첫 화면의 버튼을 누르면 자리가 먼저 생기고 그다음 화면 이동 기록이 쌓인다
      win.addEventListener('pointerdown', onUserActivation, true);
      win.addEventListener('keydown', onUserActivation, true);
      listening = true;
    }
    return show({ renderFn, container, params });
  }

  /**
   * 다음 화면으로 이동한다.
   * @param {{back?: object}} options back: 지금 화면으로 돌아올 때 쓸 입력값(지금 화면의 params 대신). 예: 입력한 참여자 목록
   */
  function go(renderFn, container, params = {}, { back } = {}) {
    onUserActivation(); // 혹시 자리가 아직 없으면 첫 화면 위에 먼저 만든다
    if (current) stack.push(back ? { ...current, params: back } : current);
    current = { renderFn, container, params };
    if (usingHistory) push({ eodiga3: stack.length });
    return renderFn(container, params);
  }

  /** [뒤로] 버튼. 브라우저 기록이 있으면 휴대폰 뒤로가기와 같은 길로, 없으면 앱 안 기록으로. */
  function goBack() {
    if (usingHistory) {
      try { browserHistory().back(); return; } catch { usingHistory = false; }
    }
    if (stack.length) show(stack.pop());
    else onFallbackHome();
  }

  return { startAt, go, goBack, onPop, onUserActivation, depth: () => stack.length };
}

let activeToast = () => {};
const appNav = createNavigator(globalThis.window, { onExitHint: () => activeToast(t('nav.exitHint')) });
export const { startAt, go, goBack } = appNav;

function header(showNav) {
  const back = el('button', {
    type: 'button', className: 'icon-btn', ariaLabel: t('join.back'), hidden: !showNav,
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
