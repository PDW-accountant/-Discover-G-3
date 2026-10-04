import { test, before, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../src/js/lib/data.js';
import { buildShareMessage, canShareKakao, copyLink, formatMeetingTime, shareKakao } from '../src/js/lib/share.js';

// 화면 문구(data/copy.json)를 실제 파일에서 읽어 t()가 동작하게 한다.
before(async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(await readFile(new URL(`../${url}`, import.meta.url)));
  await loadData();
  globalThis.fetch = realFetch;
});

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
afterEach(() => {
  mock.restoreAll();
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
});
function setClipboard(clipboard) {
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true, writable: true });
}

const confirmation = {
  v: 1, p: '회식', a: '2026-10-08T19:00', s: 'S-SAMPLE-1', pl: 'P-001', e: '2026-11-07T10:00:00.000Z',
  people: [{ n: '감자', s: 'S-SAMPLE-2', m: 24 }, { n: '2번', s: 'S-SAMPLE-3', m: 31 }, { n: '여섯글자닉네', s: 'S-SAMPLE-1', m: 0 }],
  share_url: 'https://eodiga3.vercel.app/#d=abc',
};
const names = { stationName: '종로3가', placeName: '종로 고깃집' };

/** 카카오 SDK 흉내. 보낸 설정을 기록한다. */
function fakeKakao({ initialized = false, sendError } = {}) {
  const calls = { init: [], send: [] };
  const Kakao = {
    isInitialized: () => initialized,
    init: (key) => { calls.init.push(key); initialized = true; },
    Share: { sendDefault: (settings) => { if (sendError) throw sendError; calls.send.push(settings); } },
  };
  return { Kakao, calls };
}

test('FUNC-013: 메시지에 장소(역·장소명)·도착 시각·링크가 들어간다', () => {
  const message = buildShareMessage(confirmation, names);
  assert.equal(message.title, '만남 장소와 경로가 확정되었어요');
  assert.equal(message.description, '종로3가역 · 종로 고깃집\n10월 8일 (목) 19시 00분');
  assert.equal(message.link, confirmation.share_url);
  assert.deepEqual(Object.keys(message).sort(), ['description', 'link', 'title'], 'ShareMessage(title, description, link) 형태 그대로');
});

test('FUNC-013: 참여자별 소요시간·닉네임은 메시지에 넣지 않는다', () => {
  const text = JSON.stringify(buildShareMessage(confirmation, names));
  for (const person of confirmation.people) assert.ok(!text.includes(person.n), `닉네임 ${person.n}`);
  assert.ok(!/\d+분(?!\S)/.test(text.replace('19시 00분', '')), '소요시간(분)이 들어가면 안 된다');
});

test('FUNC-013: 역·장소 이름을 모르면 id로 대신 쓴다', () => {
  assert.equal(buildShareMessage(confirmation).description.split('\n')[0], 'S-SAMPLE-1역 · P-001');
});

test('formatMeetingTime: 확정 화면과 같은 날짜 표시, 잘못된 값은 그대로', () => {
  assert.equal(formatMeetingTime('2026-10-08T19:05'), '10월 8일 (목) 19시 05분');
  assert.equal(formatMeetingTime('아무거나'), '아무거나');
});

test('FUNC-013 예외: JS 키가 없으면 카카오 버튼을 숨긴다', () => {
  assert.equal(canShareKakao(''), false);
  assert.equal(canShareKakao('public-js-key'), true);
});

test('FUNC-013: 카카오 공유는 피드 템플릿으로 장소·시각·링크 버튼을 보낸다', async () => {
  const { Kakao, calls } = fakeKakao();
  const message = buildShareMessage(confirmation, names);
  assert.equal(await shareKakao(message, { key: 'public-js-key', loadSdk: async () => Kakao }), true);
  assert.deepEqual(calls.init, ['public-js-key']);
  const link = { mobileWebUrl: confirmation.share_url, webUrl: confirmation.share_url };
  assert.deepEqual(calls.send, [{
    objectType: 'feed',
    content: { title: message.title, description: message.description, link },
    buttons: [{ title: '내 경로 보기', link }],
  }]);
});

test('FUNC-013: 이미 초기화된 SDK는 다시 init하지 않는다', async () => {
  const { Kakao, calls } = fakeKakao({ initialized: true });
  assert.equal(await shareKakao(buildShareMessage(confirmation, names), { key: 'k', loadSdk: async () => Kakao }), true);
  assert.deepEqual(calls.init, []);
  assert.equal(calls.send.length, 1);
});

test('FUNC-013 예외: 키 없음·링크 없음·SDK 실패·공유 오류면 예외 없이 false', async () => {
  mock.method(console, 'warn', () => {});
  let loaded = 0;
  const loadSdk = async () => { loaded += 1; return fakeKakao().Kakao; };
  const message = buildShareMessage(confirmation, names);
  assert.equal(await shareKakao(message, { key: '', loadSdk }), false);
  assert.equal(await shareKakao({ ...message, link: '' }, { key: 'k', loadSdk }), false);
  assert.equal(loaded, 0, '키·링크가 없으면 SDK를 불러오지 않는다');
  assert.equal(await shareKakao(message, { key: 'k', loadSdk: async () => { throw new Error('load'); } }), false);
  const broken = fakeKakao({ sendError: new Error('domain') }).Kakao;
  assert.equal(await shareKakao(message, { key: 'k', loadSdk: async () => broken }), false);
});

test('FUNC-013: 링크 복사는 클립보드에 링크만 넣는다', async () => {
  const written = [];
  setClipboard({ writeText: async (text) => { written.push(text); } });
  assert.equal(await copyLink(confirmation.share_url), true);
  assert.deepEqual(written, [confirmation.share_url]);
});

test('FUNC-013 예외: 클립보드 권한 거부·미지원·빈 링크면 false (→ 선택 가능한 글자로 표시)', async () => {
  setClipboard({ writeText: async () => { throw new Error('NotAllowedError'); } });
  assert.equal(await copyLink(confirmation.share_url), false);
  setClipboard(undefined);
  assert.equal(await copyLink(confirmation.share_url), false);
  assert.equal(await copyLink(''), false);
});

test('FUNC-021 연계: 방 만들기 화면이 만든 ShareMessage(title, description, link)도 그대로 보낼 수 있다', async () => {
  const { Kakao, calls } = fakeKakao();
  const joinMessage = { title: '모임 출발역을 입력해 주세요', description: '회식 · 10월 8일', link: 'https://eodiga3.vercel.app/?room=room1234567' };
  assert.equal(await shareKakao(joinMessage, { key: 'k', loadSdk: async () => Kakao }), true);
  assert.equal(calls.send[0].content.link.webUrl, joinMessage.link);
  assert.equal(calls.send[0].buttons[0].link.webUrl, joinMessage.link);
});
