import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 브라우저 localStorage 대신 쓰는 가짜 저장소
let store;
let blocked;
globalThis.localStorage = {
  getItem: (k) => { if (blocked) throw new Error('blocked'); return k in store ? store[k] : null; },
  setItem: (k, v) => { if (blocked) throw new Error('blocked'); store[k] = String(v); },
  removeItem: (k) => { if (blocked) throw new Error('blocked'); delete store[k]; },
};
beforeEach(() => { store = {}; blocked = false; });

// 모듈 안의 임시 id가 테스트끼리 섞이지 않도록 매번 새로 불러온다
let n = 0;
const load = () => import(`../src/js/lib/storage.js?t=${n++}`);
const SERVER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/; // api/room-participant.js가 받는 형식

test('FUNC-022: 저장된 id가 없으면 새로 만들어 eodiga3:pid에 저장한다', async () => {
  const { getParticipantId } = await load();
  const id = getParticipantId();
  assert.match(id, /^p_[0-9a-f]{32}$/);
  assert.match(id, SERVER_ID_PATTERN);
  assert.equal(JSON.parse(store['eodiga3:pid']), id);
});

test('FUNC-022: 같은 브라우저에서 다시 부르면 같은 id', async () => {
  const { getParticipantId } = await load();
  assert.equal(getParticipantId(), getParticipantId());
  const { getParticipantId: again } = await load(); // 다시 들어온 것처럼 새로 불러와도 저장값을 쓴다
  assert.equal(again(), JSON.parse(store['eodiga3:pid']));
});

test('FUNC-022: 이미 저장된 id가 있으면 그대로 쓴다', async () => {
  store['eodiga3:pid'] = JSON.stringify('p_existing_id_123');
  const { getParticipantId } = await load();
  assert.equal(getParticipantId(), 'p_existing_id_123');
});

test('FUNC-022: 저장값이 손상되었거나 빈 값이면 새로 만든다', async () => {
  for (const bad of ['{깨진', JSON.stringify(''), JSON.stringify(123), JSON.stringify(null)]) {
    store = { 'eodiga3:pid': bad };
    const { getParticipantId } = await load();
    const id = getParticipantId();
    assert.match(id, /^p_[0-9a-f]{32}$/, `저장값 ${bad}`);
    assert.equal(JSON.parse(store['eodiga3:pid']), id);
  }
});

test('FUNC-022: 저장소가 막힌 브라우저(시크릿 모드 등)에서도 오류 없이 화면에 있는 동안 같은 id', async () => {
  blocked = true;
  const { getParticipantId } = await load();
  const id = getParticipantId();
  assert.match(id, /^p_[0-9a-f]{32}$/);
  assert.equal(getParticipantId(), id);
});

test('FUNC-022: 다른 브라우저(새 저장소)는 다른 id', async () => {
  const a = (await load()).getParticipantId();
  store = {};
  const b = (await load()).getParticipantId();
  assert.notEqual(a, b);
});
