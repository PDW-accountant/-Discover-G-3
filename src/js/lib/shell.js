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

function header(showNav) {
  const back = el('button', {
    type: 'button', className: 'icon-btn', ariaLabel: t('join.back'), hidden: !showNav,
    onclick: () => (history.length > 1 ? history.back() : goHome()),
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
  return { screen, foot, toast };
}
