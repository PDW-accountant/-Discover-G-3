import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveParticipant, createRoom, getStatus, confirmRoom, getRoom, deleteParticipant, deleteRoom } from '../src/js/lib/api-client.js';

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

const meeting = { purpose: '회식', arrival_time: '2026-10-10T10:00:00.000Z' };
const room = { room_id: 'room1234567', join_url: 'https://eodiga3.vercel.app/?room=room1234567', host_token: 'host-token' };

test('FUNC-021: 방 만들기는 목적·도착 시간만 /api/room에 POST한다', async () => {
  const calls = fakeFetch(() => json(200, room));
  await createRoom({ ...meeting, extra: '보내면 안 되는 값' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/room');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(calls[0].body, meeting);
});

test('FUNC-021: 성공하면 Room(room_id, join_url, host_token)을 돌려준다', async () => {
  fakeFetch(() => json(200, { ...room, host_token_hash: '서버 내부 값' }));
  assert.deepEqual(await createRoom(meeting), room);
});

test('FUNC-021: 서버가 거절하면 예외 없이 { error }를 돌려준다', async () => {
  fakeFetch(() => json(400, { error: 'invalid' }));
  assert.deepEqual(await createRoom(meeting), { error: 'invalid' });
  fakeFetch(() => json(503, { error: 'unavailable' }));
  assert.deepEqual(await createRoom(meeting), { error: 'unavailable' });
});

test('NFR-011: 방 만들기도 서버가 없거나 응답이 이상하면 unavailable', async () => {
  const cases = [
    () => { throw new TypeError('Failed to fetch'); },
    () => new Response('<html>Not Found</html>', { status: 404 }),
    () => new Response('not json', { status: 500 }),
    () => json(200, {}),                                                 // 성공인데 Room이 없음
    () => json(200, { room_id: 'room1234567', join_url: 'x' }),          // host_token 없음
    () => json(501, { error: '아직 구현되지 않았습니다' }),
  ];
  for (const respond of cases) {
    fakeFetch(respond);
    assert.deepEqual(await createRoom(meeting), { error: 'unavailable' });
  }
});

test('NFR-011: 서버 상태 확인 — 연결되어 있으면 rooms:true', async () => {
  globalThis.fetch = async (url) => { assert.equal(url, '/api/status'); return json(200, { rooms: true }); };
  assert.deepEqual(await getStatus(), { rooms: true });
  globalThis.fetch = async () => json(200, { rooms: false });
  assert.deepEqual(await getStatus(), { rooms: false });
});

test('NFR-011: 서버 상태 확인 — 서버가 없거나 응답이 이상하면 예외 없이 rooms:false', async () => {
  const cases = [
    () => { throw new TypeError('Failed to fetch'); },
    () => new Response('<html>Not Found</html>', { status: 404 }),      // Live Server처럼 서버 함수가 없을 때
    () => json(503, { rooms: true }),                                    // 오류 응답은 믿지 않는다
    () => json(200, { rooms: 'yes' }),
    () => json(200, {}),
  ];
  for (const respond of cases) {
    globalThis.fetch = async () => respond();
    assert.deepEqual(await getStatus(), { rooms: false });
  }
});

// ---- FUNC-023: getRoom, deleteParticipant ----
const roomData = {
  room_id: 'room1234567', purpose: '회식', arrival_time: '2026-10-10T10:00:00.000Z', status: '입력중', is_host: true,
  participants: [{ participant_id: 'p_abcdefgh', nickname: '감이', origin_station_id: 'S1', updated_at: 'T' }],
};

/** fetch를 가짜로 바꾸되 body가 없는 GET도 기록한다. */
function fakeGet(respond) {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return respond(); };
  return calls;
}

test('FUNC-023: getRoom은 방 id를 주소에 넣어 GET하고 총무 토큰은 헤더로만 보낸다', async () => {
  const calls = fakeGet(() => json(200, roomData));
  await getRoom('room1234567', 'host-token-12345');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/room?id=room1234567');
  assert.ok(!calls[0].url.includes('host-token'), '토큰이 주소에 들어가면 로그에 남는다');
  assert.equal(calls[0].options.headers['x-host-token'], 'host-token-12345');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('FUNC-023: 총무 토큰이 없으면 헤더를 보내지 않는다', async () => {
  const calls = fakeGet(() => json(200, { ...roomData, is_host: false }));
  await getRoom('room1234567');
  assert.deepEqual(calls[0].options.headers, {});
});

test('FUNC-023: getRoom 성공하면 방 정보와 참여자 목록을 그대로 돌려준다', async () => {
  fakeGet(() => json(200, roomData));
  assert.deepEqual(await getRoom('room1234567', 'host-token-12345'), roomData);
});

test('FUNC-014: 방이 없거나 만료되면 null', async () => {
  fakeGet(() => json(404, { error: 'not_found' }));
  assert.equal(await getRoom('room1234567'), null);
});

test('NFR-011: 서버가 없거나 응답이 이상하면 null이 아니라 예외 (화면이 "불러오지 못했어요"로 안내)', async () => {
  const cases = [
    () => { throw new TypeError('Failed to fetch'); },
    () => new Response('<html>Not Found</html>', { status: 404 }),   // Live Server처럼 서버 함수가 없을 때
    () => new Response('not json', { status: 500 }),
    () => json(503, { error: 'unavailable' }),
    () => json(200, {}),                                              // participants가 없음
    () => json(200, { ...roomData, participants: 'x' }),
  ];
  for (const respond of cases) {
    fakeGet(respond);
    await assert.rejects(() => getRoom('room1234567'), /불러오지 못했습니다|Failed to fetch/);
  }
});

test('FUNC-023: 참여자 삭제는 DELETE로 방 id·참여자 id·총무 토큰을 보낸다', async () => {
  const calls = fakeFetch(() => json(200, { ok: true }));
  assert.deepEqual(await deleteParticipant('room1234567', 'p_abcdefgh', 'host-token-12345'), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/room-participant');
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(calls[0].body, { room_id: 'room1234567', participant_id: 'p_abcdefgh', host_token: 'host-token-12345' });
});

test('FUNC-023: 삭제가 거절되면 예외 없이 { error }를 돌려준다', async () => {
  for (const [status, error] of [[403, 'forbidden'], [404, 'not_found'], [409, 'confirmed'], [400, 'invalid'], [503, 'unavailable']]) {
    fakeFetch(() => json(status, { error }));
    assert.deepEqual(await deleteParticipant('room1234567', 'p_abcdefgh', 'host-token-12345'), { error });
  }
});

test('NFR-011: 삭제 요청도 서버가 없거나 응답이 이상하면 unavailable', async () => {
  const cases = [
    () => { throw new TypeError('Failed to fetch'); },
    () => new Response('<html>Not Found</html>', { status: 404 }),
    () => new Response('not json', { status: 500 }),
    () => json(200, {}),                                              // ok:true가 없음
    () => json(501, { message: '아직 구현되지 않았습니다' }),
  ];
  for (const respond of cases) {
    fakeFetch(respond);
    assert.deepEqual(await deleteParticipant('room1234567', 'p_abcdefgh', 'host-token-12345'), { error: 'unavailable' });
  }
});

// ---- FUNC-020(#18): deleteRoom (내 약속 목록에서 입력 받는 중인 방 지우기) ----
test('#18: 방 지우기는 DELETE /api/room?id= 로 보내고 총무 토큰은 주소가 아니라 헤더로', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return json(200, { ok: true }); };
  assert.deepEqual(await deleteRoom('room1234567', 'host-token-12345'), { ok: true });
  assert.equal(calls[0].url, '/api/room?id=room1234567');
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(calls[0].options.headers['x-host-token'], 'host-token-12345');
  assert.ok(!calls[0].url.includes('host-token'));
});

test('#18·NFR-011: 방 지우기가 거절되거나 서버가 없어도 예외 없이 { error }', async () => {
  for (const [status, error] of [[403, 'forbidden'], [404, 'not_found'], [409, 'confirmed'], [503, 'unavailable']]) {
    globalThis.fetch = async () => json(status, { error });
    assert.deepEqual(await deleteRoom('room1234567', 'host-token-12345'), { error });
  }
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); }; // Redis·서버 없이 실행
  assert.deepEqual(await deleteRoom('room1234567', 'host-token-12345'), { error: 'unavailable' });
  globalThis.fetch = async () => new Response('<html>Not Found</html>', { status: 404 }); // 간이 서버(api 없음)
  assert.deepEqual(await deleteRoom('room1234567', 'host-token-12345'), { error: 'unavailable' });
});
