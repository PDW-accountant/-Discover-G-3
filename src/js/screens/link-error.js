// 잘못된·만료된 링크 안내 (개발 A) — FUNC-014
// 오류 화면 대신 '링크가 만료되었거나 올바르지 않아요'와 '처음으로' 버튼.
// 모양은 '모이자 UI 프로토타입2'의 빈 화면 안내(.empty-state)와 아래 고정 버튼(.btn)을 따른다.
// 문구는 lib/data.js의 t()로 읽는다.
// params: 부르는 쪽 값을 그대로 받지만 쓰지 않는다 (main.js: { reason }, join.js: { room_id }).

import { t } from '../lib/data.js';
import { createShell, el, goHome } from '../lib/shell.js';

/** 화면을 그린다. @param {HTMLElement} container */
export function render(container, params = {}) {
  const { screen, foot } = createShell(container);
  screen.replaceChildren(el('div', { className: 'empty-state', role: 'alert' }, [
    t('link.invalid'), el('br'), t('link.invalidHint'),
  ]));
  // [홈]과 같은 새 출발: 화면 이동 기록을 비우고 주소의 ?room=·#d=를 지운 첫 화면(#44). 페이지를 다시 불러오지 않는다.
  foot.replaceChildren(el('button', { type: 'button', className: 'btn', textContent: t('link.home'), onclick: () => goHome() }));
}
