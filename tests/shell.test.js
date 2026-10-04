import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNavigator } from '../src/js/lib/shell.js';

// 실행: npm test
// #44 뒤로 버튼·휴대폰 뒤로가기 (10/4 전체 설계: 화면_이동_설계.md). 브라우저 기록은 가짜 window 로 흉내 낸다.
// 앱 앞에는 다른 페이지('before')가 하나 있다고 본다. 거기로 돌아가면 앱을 나간 것(left).

let clock = 1_000_000; // 순번(seq)에 쓰는 시각. 새로고침을 흉내 낼 때도 같은 시계를 이어 쓴다
const now = () => { clock += 1; return clock; };

function fakeWindow({ android = false, kakao = false, closeWatcher = android, firstPage = false } = {}) {
  const win = {
    entries: firstPage ? [{ state: null, url: '/' }] : [{ state: 'before', url: 'https://other/' }, { state: null, url: '/' }],
    index: firstPage ? 0 : 1, left: false, closed: false, listeners: {}, watchers: [], timers: [], navigatedTo: null,
  };
  const ua = android ? 'Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile' : 'Mozilla/5.0 (Windows NT 10.0) Chrome/140';
  win.navigator = { userAgent: kakao ? `${ua} KAKAOTALK 10.8.0` : ua };
  win.document = { visibilityState: 'visible' };
  win.location = { pathname: '/', get href() { return win.entries[win.index].url; }, set href(v) { win.navigatedTo = v; } };
  const fire = () => (win.listeners.popstate ?? []).forEach((f) => f({ state: win.entries[win.index].state }));
  win.history = {
    get state() { return win.entries[win.index].state; },
    pushState(state, _, url) { win.entries.splice(win.index + 1); win.entries.push({ state, url: url ?? win.entries[win.index].url }); win.index += 1; },
    replaceState(state, _, url) { win.entries[win.index].state = state; if (url) win.entries[win.index].url = url; },
    back() { win.history.go(-1); },
    go(n) {
      const target = win.index + n;
      if (target < 0 || target >= win.entries.length) return; // 갈 곳이 없으면 아무 일도 없다(popstate 없음)
      win.index = target;
      if (win.entries[win.index].state === 'before') { win.left = true; return; }
      fire();
    },
  };
  win.close = () => { win.closed = true; };
  win.setTimeout = (f) => { win.timers.push(f); return win.timers.length; };
  win.flushTimers = () => { const due = win.timers.splice(0); due.forEach((f) => f()); };
  win.addEventListener = (type, f) => { (win.listeners[type] ??= []).push(f); };
  if (closeWatcher) {
    win.CloseWatcher = class {
      constructor() { win.watchers.push(this); }
      destroy() { win.watchers = win.watchers.filter((w) => w !== this); }
    };
  }
  /** 휴대폰 뒤로가기 버튼: 걸린 CloseWatcher 가 있으면 그게 먼저 받고, 없으면 브라우저 뒤로가기 */
  win.systemBack = () => {
    const watcher = win.watchers.pop();
    if (watcher) watcher.onclose?.();
    else win.history.back();
  };
  /** 화면을 누름(탭이 끝난 뒤 click). target 을 주면 그 요소를 누른 것 */
  win.touch = (target) => (win.listeners.click ?? []).forEach((f) => f({ target }));
  /** 주소창에 링크를 붙여넣음: 브라우저가 칸을 만들고 주소만 바꾼다(state 없음) */
  win.pasteHash = (hash) => { win.history.pushState(null, '', `/${hash}`); win.entries[win.index].state = null; };
  return win;
}

// 화면 위쪽 [뒤로] 버튼을 누른 click 의 target
const backButton = { closest: (selector) => (selector === '.icon-btn.back' ? backButton : null) };

/** 그려진 화면 기록: [화면 이름, params] */
function setup({ win = fakeWindow() } = {}) {
  const drawn = [];
  const screen = (name) => (container, params) => drawn.push([name, params]);
  const hints = [];
  const stays = [];
  const nav = createNavigator(win, { onExitHint: () => hints.push('hint'), onStay: () => stays.push('stay'), now });
  /** 화면 위쪽 [뒤로]를 누른다: click(캡처)이 먼저, 그다음 버튼 동작 */
  const pressBack = () => { win?.touch?.(backButton); nav.goBack(); };
  const states = () => win.entries.map((e) => (e.state && typeof e.state === 'object' ? (e.state.root ? 'root' : `d${e.state.eodiga3}`) : String(e.state)));
  return { win, nav, drawn, screen, hints, stays, pressBack, states, last: () => drawn[drawn.length - 1] };
}

// ---------- 쌓기·뒤로 ----------

test('#44: 화면을 이동할 때마다 브라우저 기록이 하나씩 쌓이고, 출발점 위에 나가기 확인 자리가 먼저 생긴다', () => {
  const { win, nav, screen, states } = setup();
  nav.startAt(screen('form'), null, {});
  assert.deepEqual(states(), ['before', 'root']); // 열자마자는 자리를 만들지 않는다
  win.touch();
  nav.go(screen('people'), null, { request: 1 });
  nav.go(screen('result'), null, { participants: [] });
  assert.equal(nav.depth(), 2);
  assert.deepEqual(states(), ['before', 'root', 'd0', 'd1', 'd2']);
  const seqs = win.entries.slice(1).map((e) => e.state.seq);
  assert.ok(seqs.every((s, i) => i === 0 || s > seqs[i - 1]), '순번은 커지기만 한다');
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
  win.systemBack();
  assert.equal(last()[0], 'people');
  nav.go(screen('result'), null, { again: true }); // 돌아온 뒤 다시 앞으로 가도 기록이 맞게 쌓인다
  win.systemBack();
  assert.equal(last()[0], 'people');
  win.systemBack();
  assert.equal(last()[0], 'form');
});

test('#44: 앞으로 가기(PC)는 무시한다', () => {
  const { win, nav, screen, drawn } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('people'), null, {});
  win.systemBack();
  const count = drawn.length;
  win.history.go(1);
  assert.equal(drawn.length, count);
});

test('#44: 우리 기록이 아닌 항목은 건드리지 않는다', () => {
  const { nav, screen, drawn } = setup();
  nav.startAt(screen('form'), null, {});
  assert.equal(nav.onPop(null), undefined);
  assert.equal(nav.onPop({ other: 1 }), undefined);
  assert.equal(drawn.length, 1);
});

// ---------- 출발점: 두 번이면 종료 ----------

test('#44: 출발점에서 휴대폰 뒤로가기 1번은 안내만, 이어서 1번 더 누르면 앱을 나간다', () => {
  const { win, nav, screen, hints, drawn } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch(); // 목적을 고르는 등 화면을 한 번이라도 누름
  win.systemBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  assert.equal(drawn.length, 1); // 화면은 그대로
  win.systemBack();
  assert.equal(win.left, true);
});

test('#44: 안내 뒤에 화면을 다시 누르면 다음 뒤로가기는 다시 안내부터', () => {
  const { win, nav, screen, hints } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  win.systemBack();
  win.touch();
  win.systemBack();
  assert.deepEqual(hints, ['hint', 'hint']);
  assert.equal(win.left, false);
});

test('#44: 다른 화면에서 출발점으로 돌아온 뒤에도 두 번 규칙이 적용된다', () => {
  const { win, nav, screen, hints } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('people'), null, {});
  win.systemBack(); // people → form
  win.systemBack(); // form 에서 → 안내
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  win.systemBack();
  assert.equal(win.left, true);
});

test('#44: 링크로 바로 연 화면에서 [뒤로]를 두 번 누르면 앱을 나간다 (우리 칸을 모두 건너뛰고 앱을 열기 전 페이지로)', () => {
  const { win, nav, screen, hints, pressBack } = setup();
  nav.startAt(screen('route'), null, {});
  pressBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  pressBack();
  assert.deepEqual(hints, ['hint']); // 안내가 반복되지 않는다
  assert.equal(win.left, true);
});

test('#44: [뒤로] 안내 뒤에 화면의 다른 곳을 누르면 다음 [뒤로]는 다시 안내부터', () => {
  const { win, nav, screen, hints, pressBack } = setup();
  nav.startAt(screen('route'), null, {});
  pressBack();
  win.touch();
  pressBack();
  assert.deepEqual(hints, ['hint', 'hint']);
  assert.equal(win.left, false);
});

test('#44: [뒤로]와 휴대폰 뒤로가기를 섞어 눌러도 2번째에 나간다', () => {
  const a = setup();
  a.nav.startAt(a.screen('route'), null, {});
  a.pressBack();
  a.win.systemBack();
  assert.deepEqual(a.hints, ['hint']);
  assert.equal(a.win.left, true);

  const b = setup();
  b.nav.startAt(b.screen('form'), null, {});
  b.win.touch();
  b.win.systemBack();
  b.pressBack();
  assert.deepEqual(b.hints, ['hint']);
  assert.equal(b.win.left, true);
});

test('#44: 앱을 열기 전 페이지가 없고 창도 닫을 수 없으면 "브라우저 창을 닫아 주세요" 안내', () => {
  const win = fakeWindow({ firstPage: true });
  const { nav, screen, stays, pressBack } = setup({ win });
  nav.startAt(screen('route'), null, {});
  pressBack();
  pressBack();
  win.flushTimers(); // 뒤로 갈 곳이 없어 popstate 가 오지 않음 → 창 닫기 시도
  assert.equal(win.closed, true);
  win.flushTimers(); // 그래도 화면이 보이면 안내
  assert.deepEqual(stays, ['stay']);
});

test('#44: 브라우저 기록을 쓸 수 없어도 [뒤로]는 앱 안 기록으로 동작하고, 출발점에서는 안내 → 창 닫기 안내', () => {
  const { nav, screen, last, hints, stays } = setup({ win: null });
  nav.startAt(screen('form'), null, {});
  nav.go(screen('people'), null, { x: 1 });
  nav.goBack();
  assert.equal(last()[0], 'form');
  nav.goBack();
  assert.deepEqual(hints, ['hint']);
  nav.goBack();
  assert.deepEqual(stays, ['stay']);
});

// ---------- 안드로이드 CloseWatcher ----------

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

test('#44 안드로이드: 다른 화면에서는 휴대폰 뒤로가기가 이전 화면으로, 출발점으로 돌아오면 다시 두 번 규칙', () => {
  const { win, nav, screen, hints, last } = setup({ win: fakeWindow({ android: true }) });
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('people'), null, {});
  assert.deepEqual(win.watchers, []); // 다른 화면에서는 걸지 않는다
  win.systemBack();
  assert.equal(last()[0], 'form');
  assert.deepEqual(hints, []);
  win.systemBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  win.systemBack();
  assert.equal(win.left, true);
});

test('#44 카카오톡 안 브라우저: CloseWatcher 를 걸지 않고, [뒤로] 두 번이면 카카오톡 창을 닫는다', () => {
  const { win, nav, screen, hints, pressBack } = setup({ win: fakeWindow({ android: true, kakao: true }) });
  nav.startAt(screen('route'), null, {});
  assert.deepEqual(win.watchers, []);
  pressBack();
  pressBack();
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.navigatedTo, 'kakaotalk://inappbrowser/close');
});

test('#44: PC(안드로이드가 아님)에서는 CloseWatcher 를 걸지 않는다 (Esc 키로 종료되지 않게)', () => {
  const { win, nav, screen } = setup({ win: fakeWindow({ closeWatcher: true }) });
  nav.startAt(screen('form'), null, {});
  assert.deepEqual(win.watchers, []);
});

// ---------- 바꾸기·새 출발·주소·받아들이기 ----------

test('#44 바꾸기(replace): 같은 자리를 다른 화면으로. 기록은 늘지 않고 뒤로가기는 그 전 화면', () => {
  const { win, nav, screen, last, states } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('participants'), null, { room_id: 'R' });
  nav.replace(screen('route'), null, { room_id: 'R', room: {} }); // 방이 확정됨
  assert.equal(last()[0], 'route');
  assert.deepEqual(states(), ['before', 'root', 'd0', 'd1']);
  win.systemBack();
  assert.equal(last()[0], 'form');
});

test('#44 쌓기에 주소(url)를 주면 그 칸의 주소가 바뀐다 (내 약속 열기, 확정 → 경로)', () => {
  const { win, nav, screen } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('meetings'), null, {});
  nav.go(screen('route'), null, { confirmation: {} }, { url: '/#d=abc' });
  assert.equal(win.location.href, '/#d=abc');
  win.systemBack(); // 돌아가면 브라우저가 그 칸의 주소를 되돌린다
  assert.equal(win.location.href, '/');
});

test('#44 받아들이기(adopt): 주소창에 공유 링크를 붙여넣으면 그 칸을 새 화면으로 쌓고, 뒤로가기는 직전 화면', () => {
  const { win, nav, screen, last, states } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('meetings'), null, {});
  win.pasteHash('#d=xyz'); // 브라우저가 만든 칸(state 없음)
  nav.go(screen('route'), null, { confirmation: {} }, { adopt: true });
  assert.deepEqual(states(), ['before', 'root', 'd0', 'd1', 'd2']); // 칸이 더 늘지 않고 그 칸이 d2 가 됐다
  win.systemBack();
  assert.equal(last()[0], 'meetings');
});

test('#44 새 출발(restart·[홈]): 기록을 비우고 주소를 앱 주소로. 그 뒤 뒤로가기는 옛 기록을 지나 안내 → 종료', () => {
  const { win, nav, screen, last, hints } = setup();
  nav.startAt(screen('form'), null, {});
  win.touch();
  nav.go(screen('people'), null, {});
  nav.go(screen('result'), null, {}, { url: '/?room=R' });
  nav.restart(screen('form'), null, {});
  assert.equal(last()[0], 'form');
  assert.equal(nav.depth(), 0);
  assert.equal(win.location.href, '/');
  win.systemBack(); // 옛 기록(d1)으로 떨어짐 → 출발점처럼 안내
  assert.deepEqual(hints, ['hint']);
  assert.equal(win.left, false);
  win.systemBack(); // 옛 기록을 연쇄로 건너뛰고 나간다
  assert.equal(win.left, true);
  assert.deepEqual(hints, ['hint']);
});

test('#44 setHome·goHome: 등록한 첫 화면으로 새 출발', () => {
  const { win, nav, screen, last } = setup();
  nav.setHome(screen('form'), null);
  nav.startAt(screen('route'), null, { confirmation: {} });
  win.touch();
  nav.go(screen('people'), null, {});
  nav.goHome();
  assert.equal(last()[0], 'form');
  assert.equal(nav.depth(), 0);
});

test('#44 새로고침 뒤: 옛 기록으로 뒤로가기해도 죽은 누름 없이 안내 → 종료', () => {
  const win = fakeWindow();
  const first = setup({ win });
  first.nav.startAt(first.screen('form'), null, {});
  win.touch();
  first.nav.go(first.screen('people'), null, {});
  first.nav.go(first.screen('result'), null, {});
  // 새로고침: 앱 안 기록은 사라지고 브라우저 기록만 남은 채 같은 칸에서 다시 시작한다
  win.listeners = {};
  const second = setup({ win });
  second.nav.startAt(second.screen('form'), null, {});
  assert.equal(second.nav.depth(), 0);
  win.systemBack(); // 옛 d1 칸
  assert.deepEqual(second.hints, ['hint']);
  assert.equal(second.drawn.length, 1);
  win.systemBack(); // 옛 칸들을 모두 건너뛰고 나간다
  assert.equal(win.left, true);
});
