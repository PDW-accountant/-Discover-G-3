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

// ---------- FUNC-019 입력 임시저장 (#17) ----------

const form = { purpose: '회식', date: '2026-10-08', hour: '19', min: '00' };
const people = [
  { participant_id: 'p_1', nickname: '감자', origin_station_id: 'S1' },
  { participant_id: 'p_2', nickname: '', origin_station_id: null },
  { participant_id: 'p_3', nickname: '', origin_station_id: null },
];

test('FUNC-019: 입력값을 eodiga3:draft에 버전·저장 시각과 함께 저장하고 다시 읽는다', async () => {
  const { saveDraft, loadDraft, DRAFT_VERSION } = await load();
  const at = new Date(2026, 9, 4, 19, 20);
  assert.equal(saveDraft({ form }, at), true);
  assert.deepEqual(loadDraft(), { form, version: DRAFT_VERSION, saved_at: at.toISOString() });
  assert.equal(JSON.parse(store['eodiga3:draft']).version, DRAFT_VERSION);
});

test('FUNC-019: 첫 화면은 form만, 출발지 입력은 참여자까지 — 저장할 때 기존 값에 합친다', async () => {
  const { saveDraft, loadDraft } = await load();
  const request = { purpose: '회식', arrival_time: '2026-10-08T10:00:00.000Z' };
  saveDraft({ form, request, participants: people });
  saveDraft({ form: { ...form, hour: '20' } }); // 출발지 입력에서 뒤로 가 시각만 바꿈
  const d = loadDraft();
  assert.equal(d.form.hour, '20');
  assert.deepEqual(d.participants, people); // 참여자 입력은 남는다
  assert.deepEqual(d.request, request);
});

test('FUNC-019: 저장 형식 버전이 다르면 무시하고 지운다', async () => {
  const { loadDraft } = await load();
  store['eodiga3:draft'] = JSON.stringify({ version: 999, form });
  assert.equal(loadDraft(), null);
  assert.equal('eodiga3:draft' in store, false);
  store['eodiga3:draft'] = '"문자열"';
  assert.equal(loadDraft(), null);
});

test('FUNC-019: 시크릿 모드·차단이면 저장 없이 정상 동작한다 (오류 없음)', async () => {
  const { saveDraft, loadDraft, clearDraft, saveDraftSoon } = await load();
  blocked = true;
  assert.equal(saveDraft({ form }), false);
  assert.equal(loadDraft(), null);
  clearDraft();
  saveDraftSoon({ form }, 1);
  await new Promise((r) => setTimeout(r, 10));
});

test('FUNC-019: 입력할 때마다 불러도 마지막 입력 0.5초 뒤에 한 번만 저장한다', async () => {
  const { saveDraftSoon, loadDraft, DRAFT_SAVE_DELAY_MS } = await load();
  assert.equal(DRAFT_SAVE_DELAY_MS, 500);
  saveDraftSoon({ form: { ...form, hour: '18' } }, 20);
  saveDraftSoon({ form: { ...form, hour: '21' } }, 20);
  assert.equal(loadDraft(), null); // 아직 저장 전
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(loadDraft().form.hour, '21');
});

test('FUNC-019: 지우면(확정·방 만들기·처음부터) 기다리던 저장도 취소된다', async () => {
  const { saveDraft, saveDraftSoon, clearDraft, loadDraft } = await load();
  saveDraft({ form });
  saveDraftSoon({ form: { ...form, hour: '22' } }, 20);
  clearDraft();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(loadDraft(), null);
});

test("FUNC-019: 목적을 골랐거나 닉네임·출발역을 넣었을 때만 '이어서 입력할까요?'를 묻는다", async () => {
  const { hasDraftContent } = await load();
  assert.equal(hasDraftContent(null), false);
  assert.equal(hasDraftContent({ form: { ...form, purpose: null } }), false);
  assert.equal(hasDraftContent({ form: { ...form, purpose: null }, participants: people.slice(1) }), false); // 빈 줄만
  assert.equal(hasDraftContent({ form }), true);
  assert.equal(hasDraftContent({ participants: [{ nickname: '', origin_station_id: 'S1' }] }), true);
});
