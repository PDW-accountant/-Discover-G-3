import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNavigator } from '../src/js/lib/shell.js';

// 실행: npm test
// #44 뒤로 버튼·휴대폰 뒤로가기. 브라우저 기록은 가짜 window로 흉내 낸다(back()이 곧바로 popstate를 보낸다).
// 앱 앞에는 다른 페이지('before')가 하나 있다고 본다. 거기로 돌아가면 앱을 나간 것.

function fakeWindow() {
  const win = { entries: [{ state: 'before' }, { state: null }], index: 1, left: false, listeners: {} };
  win.history = {
    get state() { return win.entries[win.index].state; },
    pushState(state) { win.entries.splice(win.index + 1); win.entries.push({ state }); win.index += 1; },
    replaceState(state) { win.entries[win.index].state = state; },
    back() {
      win.index -= 1;
      if (win.entries[win.index].state === 'before') { win.left = true; return; }
      (win.listeners.popstate ?? []).forEach((f) => f({ state: win.entries[win.index].state }));
    },
  };
  win.addEventListener = (type, f) => { (win.listeners[type] ??= []).push(f); };
  win.touch = () => (win.listeners.pointerdown ?? []).forEach((f) => f({})); // 화면을 누름
  return win;
}

/** 그려진 화면 기록: [화면 이름, params] */
function setup({ win = fakeWindow() } = {}) {
  const drawn = [];
  const screen = (name) => (container, params) => drawn.push([name, params]);
  const hints = [];
  const homes = [];
  const nav = createNavigator(win, { onExitHint: () => hints.push('hint'), onFallbackHome: () => homes.push('home') });
  return { win, nav, drawn, screen, hints, homes, last: () => drawn[drawn.length - 1] };
}

test('#44: 화면을 이동할 때마다 브라우저 기록이 하나씩 쌓이고, 첫 화면 위에 나가기 확인 자리가 먼저 생긴다', () => {
  const { win, nav, screen } = setup();
  nav.startAt(screen('form'), null, {});
  assert.deepEqual(win.entries.map((e) => e.state), ['before', { eodiga3: 0, root: true }]); // 열자마자는 자리를 만들지 않는다
  win.touch();
  nav.go(screen('people'), null, { request: 1 });
  nav.go(screen('result'), null, { participants: [] });
  assert.equal(nav.depth(), 2);
  assert.deepEqual(win.entries.map((e) => e.state), ['before', { eodiga3: 0, root: true }, { eodiga3: 0 }, { eodiga3: 1 }, { eodiga3: 2 }]);
});

test('#44: [뒤로]는 바로 이전 화면을 돌아올 때 쓸 입력값(back)으로 다시 그린다', () => {
  const { win, nav, screen, last } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('people'), null, { request: 1 }, { back: { form: { purpose: '회식' } } });
  nav.go(screen('result'), null, { request: 1, participants: ['a'] }, { back: { request: 1, participants: ['감자'] } });
  nav.goBack();
  assert.deepEqual(last(), ['people', { request: 1, participants: ['감자'] }]);
  nav.goBack();
  assert.deepEqual(last(), ['form', { form: { purpose: '회식' } }]);
  assert.equal(nav.depth(), 0);
});

test('#44: 휴대폰 뒤로가기(브라우저 뒤로)도 [뒤로]와 같은 화면으로 간다', () => {
  const { win, nav, screen, last } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('people'), null, {});
  nav.go(screen('result'), null, {});
  win.history.back();
  assert.equal(last()[0], 'people');
  nav.go(screen('result'), null, { again: true }); // 돌아온 뒤 다시 앞으로 가도 기록이 맞게 쌓인다
  win.history.back();
  assert.equal(last()[0], 'people');
  win.history.back();
  assert.equal(last()[0], 'form');
});

test('#44: 첫 화면에서 뒤로가기 1번은 안내만, 이어서 1번 더 누르면 앱을 나간다', () => {
  const { win, nav, screen, hints, drawn } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch(); // 목적을 고르는 등 화면을 한 번이라도 누름
  win.history.back();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  assert.equal(drawn.length, 1); // 화면은 그대로
  win.history.back();
  assert.equal(win.left, true);
});

test('#44: 안내 뒤에 화면을 다시 누르면 다음 뒤로가기는 다시 안내부터', () => {
  const { win, nav, screen, hints } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  win.history.back();
  win.touch();
  win.history.back();
  assert.deepEqual(hints, ['hint', 'hint']);
  assert.equal(win.left, false);
});

test('#44: 다른 화면에서 첫 화면으로 돌아온 뒤에도 두 번 규칙이 적용된다', () => {
  const { win, nav, screen, hints } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('people'), null, {});
  win.history.back(); // people → form
  win.history.back(); // form에서 → 안내
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  win.history.back();
  assert.equal(win.left, true);
});

test('#44: 링크로 바로 들어온 화면의 [뒤로]도 첫 화면과 같은 규칙(누른 순간 자리가 생겨 안내부터)', () => {
  const { win, nav, screen, hints } = setup();
  nav.startAt(screen('join'), null, { room_id: 'R' });
  win.touch(); // [뒤로] 버튼을 누르는 순간
  nav.goBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
});

test('#44: 우리 기록이 아닌 항목(#d= 붙여넣기 등)은 건드리지 않는다', () => {
  const { nav, screen, drawn } = setup();
  nav.startAt(screen('form'), null, {});
  assert.equal(nav.onPop(null), undefined);
  assert.equal(nav.onPop({ other: 1 }), undefined);
  assert.equal(drawn.length, 1);
});

test('#44: 브라우저 기록을 쓸 수 없어도 [뒤로]는 앱 안 기록으로 동작하고, 더 없으면 첫 화면으로', () => {
  const { nav, screen, last, homes } = setup({ win: null });
  nav.startAt(screen('form'), null, {});
  nav.go(screen('people'), null, { x: 1 });
  nav.goBack();
  assert.equal(last()[0], 'form');
  nav.goBack();
  assert.deepEqual(homes, ['home']);
});
