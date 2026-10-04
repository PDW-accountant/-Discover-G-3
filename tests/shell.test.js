import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNavigator, exitApp } from '../src/js/lib/shell.js';

// 실행: npm test
// #44 뒤로 버튼·휴대폰 뒤로가기. 브라우저 기록은 가짜 window로 흉내 낸다(back()이 곧바로 popstate를 보낸다).
// 앱 앞에는 다른 페이지('before')가 하나 있다고 본다. 거기로 돌아가면 앱을 나간 것.

function fakeWindow({ android = false, kakao = false, closeWatcher = android } = {}) {
  const win = { entries: [{ state: 'before' }, { state: null }], index: 1, left: false, listeners: {}, watchers: [] };
  const ua = android ? 'Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile' : 'Mozilla/5.0 (Windows NT 10.0) Chrome/140';
  win.navigator = { userAgent: kakao ? `${ua} KAKAOTALK 10.8.0` : ua };
  // CloseWatcher: 휴대폰 뒤로가기를 페이지가 먼저 받는다. 받으면(close) 사라진다
  if (closeWatcher) {
    win.CloseWatcher = class {
      constructor() { win.watchers.push(this); }
      destroy() { win.watchers = win.watchers.filter((w) => w !== this); }
    };
  }
  // 휴대폰 뒤로가기 버튼: 걸린 CloseWatcher가 있으면 그게 먼저 받고, 없으면 브라우저 뒤로가기
  win.systemBack = () => {
    const watcher = win.watchers.pop();
    if (watcher) watcher.onclose?.();
    else win.history.back();
  };
  win.history = {
    get state() { return win.entries[win.index].state; },
    pushState(state) { win.entries.splice(win.index + 1); win.entries.push({ state }); win.index += 1; },
    replaceState(state) { win.entries[win.index].state = state; },
    back() { win.history.go(-1); },
    go(n) {
      win.index += n;
      if (win.entries[win.index].state === 'before') { win.left = true; return; }
      (win.listeners.popstate ?? []).forEach((f) => f({ state: win.entries[win.index].state }));
    },
  };
  win.addEventListener = (type, f) => { (win.listeners[type] ??= []).push(f); };
  win.touch = (target) => (win.listeners.click ?? []).forEach((f) => f({ target })); // 화면을 누름(탭이 끝난 뒤 click)
  return win;
}

// 화면 위쪽 [뒤로] 버튼을 누른 click의 target
const backButton = { closest: (selector) => (selector === '.icon-btn.back' ? backButton : null) };

/** 그려진 화면 기록: [화면 이름, params] */
function setup({ win = fakeWindow() } = {}) {
  const drawn = [];
  const screen = (name) => (container, params) => drawn.push([name, params]);
  const hints = [];
  const homes = [];
  const exits = [];
  const nav = createNavigator(win, {
    onExitHint: () => hints.push('hint'), onFallbackHome: () => homes.push('home'),
    onExit: (steps) => { exits.push(steps); win?.history.go(-steps); },
  });
  /** 화면 위쪽 [뒤로]를 누른다: click(캡처)이 먼저, 그다음 버튼 동작 */
  const pressBack = () => { win?.touch(backButton); nav.goBack(); };
  return { win, nav, drawn, screen, hints, homes, exits, pressBack, last: () => drawn[drawn.length - 1] };
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

test('#44: 링크로 바로 연 화면에서 [뒤로]를 두 번 누르면 앱을 나간다 (두 번째 누름이 자리를 다시 만들지 않음)', () => {
  const { win, nav, screen, hints, exits, pressBack } = setup();
  nav.startAt(screen('route'), null, {});
  pressBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  pressBack();
  assert.deepEqual(hints, ['hint']); // 안내가 반복되지 않는다
  assert.deepEqual(exits, [2]);      // 나가기 확인 자리 위에서 → 2칸 뒤 = 앱을 열기 전 페이지
  assert.equal(win.left, true);
});

test('#44: [뒤로] 안내 뒤에 화면의 다른 곳을 누르면 다음 [뒤로]는 다시 안내부터', () => {
  const { win, nav, screen, hints, exits, pressBack } = setup();
  nav.startAt(screen('route'), null, {});
  pressBack();
  win.touch(); // 다른 곳을 누름
  pressBack();
  assert.deepEqual(hints, ['hint', 'hint']);
  assert.deepEqual(exits, []);
});

test('#44: 휴대폰 뒤로가기로 안내를 본 뒤 화면의 [뒤로]를 누르면 나간다', () => {
  const { win, nav, screen, hints, exits, pressBack } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  win.history.back(); // 휴대폰 뒤로가기 → 안내
  pressBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(exits.length, 1);
  assert.equal(win.left, true);
});

test('#44: [뒤로]로 안내를 본 뒤 휴대폰 뒤로가기를 누르면 안내를 반복하지 않고 나간다', () => {
  const { win, nav, screen, hints, pressBack } = setup();
  nav.startAt(screen('route'), null, {});
  pressBack();
  win.history.back();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, true);
});

test('#44 안드로이드: 화면을 누르기 전에도 휴대폰 뒤로가기 1번은 안내, 2번째에 나간다', () => {
  const { win, nav, screen, hints } = setup({ win: fakeWindow({ android: true }) });
  nav.startAt(screen('form'), null, {});
  win.systemBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  win.systemBack();
  assert.equal(win.left, true);
});

test('#44 안드로이드: 화면을 누른 뒤에도 휴대폰 뒤로가기는 두 번에 나간다 (안내 1번)', () => {
  const { win, nav, screen, hints } = setup({ win: fakeWindow({ android: true }) });
  nav.startAt(screen('form'), null, {});
  win.touch();
  win.systemBack();
  win.systemBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, true);
});

test('#44 안드로이드: 다른 화면에서는 휴대폰 뒤로가기가 이전 화면으로, 첫 화면으로 돌아오면 다시 두 번 규칙', () => {
  const { win, nav, screen, hints, last } = setup({ win: fakeWindow({ android: true }) });
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('people'), null, {});
  win.systemBack();
  assert.equal(last()[0], 'form');
  assert.deepEqual(hints, []);
  win.systemBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  win.systemBack();
  assert.equal(win.left, true);
});

test('#44 카카오톡 안 브라우저: CloseWatcher를 걸지 않고, [뒤로] 두 번이면 나간다 (10/4 회귀 수정)', () => {
  const { win, nav, screen, hints, exits, pressBack } = setup({ win: fakeWindow({ android: true, kakao: true }) });
  nav.startAt(screen('route'), null, {});
  assert.deepEqual(win.watchers, []);
  pressBack();
  pressBack();
  assert.deepEqual(hints, ['hint']);
  assert.deepEqual(exits, [2]);
  assert.equal(win.left, true);
});

test('#44 안드로이드: [뒤로] 두 번으로 나갈 때 걸어 둔 CloseWatcher를 먼저 거둔다', () => {
  const { win, nav, screen, exits, pressBack } = setup({ win: fakeWindow({ android: true }) });
  nav.startAt(screen('route'), null, {});
  assert.equal(win.watchers.length, 1);
  pressBack();
  pressBack();
  assert.deepEqual(win.watchers, []);
  assert.deepEqual(exits, [2]);
});

test('#44: PC(안드로이드가 아님)에서는 CloseWatcher를 걸지 않는다 (Esc 키로 종료되지 않게)', () => {
  const { win, nav, screen } = setup({ win: fakeWindow({ closeWatcher: true }) });
  nav.startAt(screen('form'), null, {});
  assert.deepEqual(win.watchers, []);
});

test('#44: 앱 나가기 — 카카오톡 안 브라우저는 카카오톡 주소로 창을 닫는다', () => {
  const win = { navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) KAKAOTALK 10.8.0' }, location: { href: '' } };
  exitApp(2, win);
  assert.equal(win.location.href, 'kakaotalk://inappbrowser/close');
});

test('#44: 앱 나가기 — 그 밖의 브라우저는 창 닫기 → 앱을 열기 전 페이지로, 그래도 남아 있으면 안내', () => {
  const calls = [];
  let timer;
  const win = {
    navigator: { userAgent: 'Mozilla/5.0 Chrome/140' }, document: { visibilityState: 'visible' },
    close: () => calls.push('close'), history: { go: (n) => calls.push(`go ${n}`) }, setTimeout: (f) => { timer = f; },
  };
  exitApp(2, win, () => calls.push('stay'));
  assert.deepEqual(calls, ['close', 'go -2']);
  timer(); // 0.7초 뒤에도 화면이 보이면(닫히지도 이동하지도 않음) 안내
  assert.deepEqual(calls, ['close', 'go -2', 'stay']);
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
