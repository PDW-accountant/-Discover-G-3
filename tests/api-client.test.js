import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveParticipant, confirmRoom } from '../src/js/lib/api-client.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** fetch를 가짜로 바꾸고, 보낸 요청을 기록한다. */
function fakeFetch(respond) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return respond();
  };
  return calls;
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const participant = { participant_id: 'p_abcdefgh', nickname: '철수', origin_station_id: 'S1' };

test('FUNC-022: 서버 함수에 정해진 입력 형태 그대로 POST한다', async () => {
  const calls = fakeFetch(() => json(200, { participant: { ...participant, updated_at: 'T' } }));
  await saveParticipant('room1234567', participant);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/room-participant');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(calls[0].body, {
    room_id: 'room1234567', participant_id: 'p_abcdefgh', nickname: '철수', origin_station_id: 'S1',
  });
});

test('FUNC-023: 총무가 대신 입력하면 host_token을 함께 보낸다', async () => {
  const calls = fakeFetch(() => json(200, { participant: { ...participant, updated_at: 'T' } }));
  await saveParticipant('room1234567', participant, 'host-token');
  assert.equal(calls[0].body.host_token, 'host-token');
});

test('FUNC-022: 성공하면 RoomParticipant를 돌려준다', async () => {
  const saved = { participant_id: 'p_abcdefgh', nickname: '1번', origin_station_id: 'S1', updated_at: '2026-10-04T00:00:00.000Z' };
  fakeFetch(() => json(200, { participant: saved }));
  assert.deepEqual(await saveParticipant('room1234567', { ...participant, nickname: '' }), saved);
});

test('FUNC-022: 서버가 거절하면 예외 없이 { error }를 돌려준다', async () => {
  for (const [status, error] of [[404, 'not_found'], [409, 'confirmed'], [409, 'full'], [409, 'duplicate_nickname'], [400, 'invalid'], [503, 'unavailable']]) {
    fakeFetch(() => json(status, { error }));
    assert.deepEqual(await saveParticipant('room1234567', participant), { error });
  }
});

test('NFR-011: 서버가 없거나 응답이 이상해도 화면이 멈추지 않게 unavailable', async () => {
  const cases = [
    () => { throw new TypeError('Failed to fetch'); },                 // 네트워크 실패
    () => new Response('<html>Not Found</html>', { status: 404 }),     // Live Server처럼 서버 함수가 없을 때
    () => new Response('not json', { status: 500 }),                   // JSON이 아닌 응답
    () => json(200, {}),                                               // 성공인데 participant가 없음
    () => json(501, { message: '아직 구현되지 않았습니다' }),           // error 키가 없음
  ];
  for (const respond of cases) {
    fakeFetch(respond);
    assert.deepEqual(await saveParticipant('room1234567', participant), { error: 'unavailable' });
  }
});

test('FUNC-012: confirmRoom은 room_id·host_token·confirmation을 POST하고, 성공하면 { confirmation }', async () => {
  const confirmation = { v: 1, p: '회식' };
  const calls = fakeFetch(() => json(200, { confirmation }));
  assert.deepEqual(await confirmRoom('room1234567', confirmation, 'host-token'), { confirmation });
  assert.equal(calls[0].url, '/api/room-confirm');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(calls[0].body, { room_id: 'room1234567', host_token: 'host-token', confirmation });
});

test('FUNC-012: confirmRoom이 실패해도 예외 없이 { error }', async () => {
  for (const [status, error] of [[403, 'forbidden'], [404, 'not_found'], [400, 'invalid'], [503, 'unavailable']]) {
    fakeFetch(() => json(status, { error }));
    assert.deepEqual(await confirmRoom('room1234567', {}, 't'), { error });
  }
  fakeFetch(() => { throw new TypeError('Failed to fetch'); });
  assert.deepEqual(await confirmRoom('room1234567', {}, 't'), { error: 'unavailable' });
  fakeFetch(() => new Response('<html>Not Found</html>', { status: 404 }));
  assert.deepEqual(await confirmRoom('room1234567', {}, 't'), { error: 'unavailable' });
});
