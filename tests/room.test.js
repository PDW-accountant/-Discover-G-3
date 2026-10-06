import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import handler from '../api/room.js';

/** Vercel 서버 함수의 res 흉내. */
async function call(method, body, headers = {}) {
  const out = {};
  const res = {
    status(code) { out.status = code; return this; },
    json(data) { out.body = data; return this; },
  };
  await handler({ method, body, headers }, res);
  return out;
}
const valid = { purpose: '회식', arrival_time: '2026-10-10T10:00:00.000Z' };
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/; // api/room-participant.js가 받는 방 id 형식

const savedEnv = { ...process.env };
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});
afterEach(() => { process.env = { ...savedEnv }; mock.restoreAll(); });

test('POST·GET·DELETE 외 요청은 501', async () => {
  assert.equal((await call('PUT', valid)).status, 501);
  assert.equal((await call('PATCH', valid)).status, 501);
});

test('FUNC-021: 목적이나 도착 시간이 올바르지 않으면 400 invalid', async () => {
  const bad = [
    undefined,                                              // 본문 없음
    {},
    { ...valid, purpose: undefined },
    { ...valid, purpose: '식사' },                           // 정해진 값(회식·회의·오락·기타)만 받는다
    { ...valid, purpose: '회식 / 식사' },
    { ...valid, arrival_time: undefined },
    { ...valid, arrival_time: '' },
    { ...valid, arrival_time: '내일 7시' },                   // 날짜로 읽히지 않는 값
    { ...valid, arrival_time: 1760000000000 },               // 숫자
    { ...valid, arrival_time: '2026-10-10T10:00:00.000Z'.padEnd(100, '0') },
  ];
  for (const body of bad) {
    assert.deepEqual(await call('POST', body), { status: 400, body: { error: 'invalid' } }, JSON.stringify(body));
  }
});

test('NFR-011: 저장소 환경변수가 없으면 503 unavailable (형식이 맞아도 방을 만들지 않는다)', async () => {
  assert.deepEqual(await call('POST', valid), { status: 503, body: { error: 'unavailable' } });
});

test('NFR-011: 저장소 호출이 실패해도 예외 없이 503 unavailable', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  mock.method(console, 'error', () => {});
  assert.deepEqual(await call('POST', valid), { status: 503, body: { error: 'unavailable' } });
});

// redis()를 정해진 결과로 바꿔 끼워야 해서 별도 Node 프로세스에서 실행한다. results는 호출 순서대로 돌려줄 값.
function runWithRedisResults(results, { method = 'POST', body = valid, query, headers = { host: 'eodiga3.vercel.app' } } = {}) {
  const redisUrl = new URL('../api/_lib/redis.js', import.meta.url).href;
  const handlerUrl = new URL('../api/room.js', import.meta.url).href;
  const code = `
    import { mock } from 'node:test';
    const sent = [];
    const results = ${JSON.stringify(results)};
    mock.module(${JSON.stringify(redisUrl)}, { namedExports: {
      isRedisConfigured: () => true,
      redis: async (cmd) => { sent.push(cmd); const r = results[sent.length - 1]; if (r === 'THROW') throw new Error('boom'); return r; },
    } });
    console.error = () => {};
    const { default: handler } = await import(${JSON.stringify(handlerUrl)});
    const out = {};
    out.headers = {};
    await handler({ method: ${JSON.stringify(method)}, body: ${JSON.stringify(body)}, query: ${JSON.stringify(query)}, headers: ${JSON.stringify(headers)} }, {
      status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; },
      setHeader(name, value) { out.headers[name] = value; },
    });
    out.commands = sent;
    console.log(JSON.stringify(out));
  `;
  const stdout = execFileSync(process.execPath,
    ['--experimental-test-module-mocks', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' });
  return JSON.parse(stdout);
}

test('FUNC-021: 성공하면 200과 Room(room_id, join_url, host_token)을 돌려준다', () => {
  const out = runWithRedisResults(['ok']);
  assert.equal(out.status, 200);
  assert.deepEqual(Object.keys(out.body).sort(), ['host_token', 'join_url', 'room_id']);
  assert.match(out.body.room_id, ID_PATTERN);
  assert.ok(out.body.room_id.length >= 10, '방 id는 10자 이상');
  assert.ok(out.body.host_token.length >= 20);
  assert.equal(out.body.join_url, `https://eodiga3.vercel.app/?room=${out.body.room_id}`);
});

test('FUNC-021: 저장소에는 정해진 키·인자로 한 번에 보내고 30일 만료를 건다', () => {
  const out = runWithRedisResults(['ok']);
  assert.equal(out.commands.length, 1);
  const [name, script, keyCount, key, ...args] = out.commands[0];
  assert.equal(name, 'EVAL');
  assert.match(script, /HSET[^\n]*'purpose'[^\n]*'arrival_time'[^\n]*'created_at'[^\n]*'host_token_hash'[^\n]*'status', '입력중'/);
  assert.match(script, /EXPIRE/);
  assert.equal(keyCount, '1');
  assert.equal(key, `room:${out.body.room_id}`);
  const [purpose, arrival, createdAt, tokenHash, ttl] = args;
  assert.equal(purpose, '회식');
  assert.equal(arrival, valid.arrival_time);
  assert.ok(!Number.isNaN(Date.parse(createdAt)));
  assert.equal(ttl, String(30 * 24 * 60 * 60)); // 30일
  assert.equal(args.length, 5);
});

test('FUNC-021: 서버에는 host_token의 해시만 저장하고 원본은 보내지 않는다', () => {
  const out = runWithRedisResults(['ok']);
  const sentArgs = out.commands[0].slice(4);
  assert.equal(sentArgs[3], createHash('sha256').update(out.body.host_token).digest('hex'));
  assert.ok(!JSON.stringify(out.commands).includes(out.body.host_token), '저장소 명령에 토큰 원본이 들어가면 안 된다');
});

test('FUNC-021: 목적 세 가지(회식·회의·오락) 모두 방을 만들 수 있다', () => {
  for (const purpose of ['회식', '회의', '오락', '기타']) {
    const out = runWithRedisResults(['ok'], { body: { ...valid, purpose } });
    assert.equal(out.status, 200, purpose);
    assert.equal(out.commands[0][4], purpose);
  }
});

test('FUNC-021: 방 id가 겹치면 새 id로 다시 시도하고, 계속 겹치면 503', () => {
  const retried = runWithRedisResults(['exists', 'exists', 'ok']);
  assert.equal(retried.status, 200);
  assert.equal(retried.commands.length, 3);
  const keys = retried.commands.map((c) => c[3]);
  assert.equal(new Set(keys).size, 3, '시도마다 다른 id');
  assert.equal(retried.body.room_id, keys[2].replace('room:', ''));

  const failed = runWithRedisResults(['exists', 'exists', 'exists']);
  assert.deepEqual({ status: failed.status, body: failed.body }, { status: 503, body: { error: 'unavailable' } });
  assert.equal(failed.commands.length, 3);
});

test('NFR-011: 저장소가 이상한 값을 돌려주거나 실패해도 503 unavailable (토큰은 응답에 넣지 않는다)', () => {
  for (const results of [['뜻밖의값'], [null], ['THROW']]) {
    const out = runWithRedisResults(results);
    assert.deepEqual({ status: out.status, body: out.body }, { status: 503, body: { error: 'unavailable' } }, JSON.stringify(results));
  }
});

test('FUNC-021: 링크는 요청이 들어온 주소(미리보기·심사용)를 따라 만든다', () => {
  const preview = runWithRedisResults(['ok'], {
    headers: { host: 'internal.local', 'x-forwarded-host': 'eodiga3-git-feature-x-team.vercel.app', 'x-forwarded-proto': 'https' },
  });
  assert.equal(preview.body.join_url, `https://eodiga3-git-feature-x-team.vercel.app/?room=${preview.body.room_id}`);

  const local = runWithRedisResults(['ok'], { headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' } });
  assert.equal(local.body.join_url, `http://localhost:3000/?room=${local.body.room_id}`);

  // 프록시 헤더가 없을 때: 내 컴퓨터(localhost)는 http, 그 밖의 주소는 https
  const localNoProxy = runWithRedisResults(['ok'], { headers: { host: 'localhost:3000' } });
  assert.equal(localNoProxy.body.join_url, `http://localhost:3000/?room=${localNoProxy.body.room_id}`);
  const remoteNoProxy = runWithRedisResults(['ok'], { headers: { host: 'eodiga3.vercel.app' } });
  assert.equal(remoteNoProxy.body.join_url, `https://eodiga3.vercel.app/?room=${remoteNoProxy.body.room_id}`);
});

test('FUNC-021: 이상한 host 헤더는 링크에 쓰지 않는다', () => {
  const out = runWithRedisResults(['ok'], { headers: { host: 'evil.com/<script>' } });
  assert.equal(out.body.join_url, `/?room=${out.body.room_id}`);
});

// ---- FUNC-023: GET /api/room (방 읽기) ----
const ROOM_ID = 'room1234567';
const HOST_TOKEN = 'host-token-12345';
const hostHash = createHash('sha256').update(HOST_TOKEN).digest('hex');
const stored = (extra = []) => [
  'purpose', '회식', 'arrival_time', '2026-10-10T10:00:00.000Z', 'created_at', '2026-10-04T00:00:00.000Z',
  'host_token_hash', hostHash, 'status', '입력중',
  ...extra,
];
const person = (nickname, station, updatedAt) => JSON.stringify({ nickname, station_id: station, updated_at: updatedAt });
const get = (results, options = {}) => runWithRedisResults(results, { method: 'GET', query: { id: ROOM_ID }, ...options });

test('FUNC-023: 방 id가 없거나 형식이 틀리면 400 invalid', async () => {
  for (const query of [undefined, {}, { id: '' }, { id: 'short' }, { id: 'room/../x123' }, { id: ['a', 'b'] }, { id: 'x'.repeat(65) }]) {
    const out = {};
    await handler({ method: 'GET', query, headers: {} }, {
      status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; },
    });
    assert.deepEqual(out, { status: 400, body: { error: 'invalid' } }, JSON.stringify(query));
  }
});

test('NFR-011: 방 읽기도 저장소 환경변수가 없으면 503 unavailable', async () => {
  const out = {};
  await handler({ method: 'GET', query: { id: ROOM_ID }, headers: {} }, {
    status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; },
  });
  assert.deepEqual(out, { status: 503, body: { error: 'unavailable' } });
});

test('FUNC-023: 없거나 만료된 방은 404 not_found', () => {
  const out = get([[]]);
  assert.deepEqual({ status: out.status, body: out.body }, { status: 404, body: { error: 'not_found' } });
  assert.deepEqual(out.commands, [['HGETALL', `room:${ROOM_ID}`]]);
});

test('NFR-011: 저장소가 실패하거나 이상한 값을 돌려주면 503 unavailable', () => {
  for (const results of [['THROW'], [null], ['문자열']]) {
    const out = get(results);
    assert.deepEqual({ status: out.status, body: out.body }, { status: 503, body: { error: 'unavailable' } }, JSON.stringify(results));
  }
});

test('FUNC-023: 방 정보와 참여자 목록을 입력한 순서대로 돌려주고 총무 토큰 해시는 숨긴다', () => {
  const out = get([stored([
    'p:p_second0001', person('택이', 'S2', '2026-10-04T01:00:02.000Z'),
    'p:p_first00001', person('감이', 'S1', '2026-10-04T01:00:01.000Z'),
  ])]);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, {
    room_id: ROOM_ID, purpose: '회식', arrival_time: '2026-10-10T10:00:00.000Z', status: '입력중', is_host: false,
    participants: [
      { participant_id: 'p_first00001', nickname: '감이', origin_station_id: 'S1', updated_at: '2026-10-04T01:00:01.000Z' },
      { participant_id: 'p_second0001', nickname: '택이', origin_station_id: 'S2', updated_at: '2026-10-04T01:00:02.000Z' },
    ],
  });
  assert.ok(!JSON.stringify(out.body).includes(hostHash), '토큰 해시는 응답에 없다');
  assert.equal(out.headers['Cache-Control'], 'no-store');
});

test('FUNC-023: 참여자가 없는 방도 빈 목록으로 읽힌다', () => {
  const out = get([stored()]);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.participants, []);
});

test('FUNC-023: 총무 토큰(x-host-token 헤더)이 맞을 때만 is_host가 true', () => {
  const headers = (token) => ({ host: 'eodiga3.vercel.app', ...(token === undefined ? {} : { 'x-host-token': token }) });
  assert.equal(get([stored()], { headers: headers(HOST_TOKEN) }).body.is_host, true);
  assert.equal(get([stored()], { headers: headers('wrong-token-123') }).body.is_host, false);
  assert.equal(get([stored()], { headers: headers('short') }).body.is_host, false);
  assert.equal(get([stored()], { headers: headers('x'.repeat(300)) }).body.is_host, false);
  assert.equal(get([stored()], { headers: headers(undefined) }).body.is_host, false);
  // 저장된 해시가 없는 방은 누구도 총무가 아니다
  assert.equal(get([['purpose', '회식', 'status', '입력중']], { headers: headers(HOST_TOKEN) }).body.is_host, false);
});

test('FUNC-012: 확정된 방은 confirmation도 돌려주고, 깨진 값은 빼고 돌려준다', () => {
  const confirmation = { v: 1, p: '회식', a: '2026-10-10T10:00:00.000Z', s: 'S1', pl: 'P1', e: '2026-11-09T10:00:00.000Z', people: [{ n: '감이', s: 'S2', m: 20 }] };
  const base = stored().map((v) => (v === '입력중' ? '확정' : v));
  const ok = get([[...base, 'confirmation', JSON.stringify(confirmation)]]);
  assert.equal(ok.body.status, '확정');
  assert.deepEqual(ok.body.confirmation, confirmation);
  const broken = get([[...base, 'confirmation', '{깨진']]);
  assert.equal(broken.status, 200);
  assert.ok(!('confirmation' in broken.body));
});

test('FUNC-023: 깨진 참여자 항목은 건너뛰고 나머지는 보여준다', () => {
  const out = get([stored([
    'p:p_good000001', person('감이', 'S1', '2026-10-04T01:00:01.000Z'),
    'p:p_broken0001', '{깨진',
    'p:p_nostation1', JSON.stringify({ nickname: '택이' }),
    'extra_field', 'x',
  ])]);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.participants.map((p) => p.participant_id), ['p_good000001']);
});

// ---- FUNC-020(#18): DELETE /api/room?id= (내 약속 목록에서 입력 받는 중인 방 지우기) ----
const del = (results, headers = { 'x-host-token': HOST_TOKEN }) => runWithRedisResults(results, { method: 'DELETE', query: { id: ROOM_ID }, headers });

test('#18: 방 id나 총무 토큰(헤더)이 없거나 형식이 틀리면 400 invalid', async () => {
  const cases = [
    { query: { id: ROOM_ID }, headers: {} },
    { query: { id: ROOM_ID }, headers: { 'x-host-token': 'short' } },
    { query: { id: 'bad/id' }, headers: { 'x-host-token': HOST_TOKEN } },
    { query: {}, headers: { 'x-host-token': HOST_TOKEN } },
  ];
  for (const { query, headers } of cases) {
    const out = {};
    await handler({ method: 'DELETE', query, headers }, { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } });
    assert.deepEqual(out, { status: 400, body: { error: 'invalid' } }, JSON.stringify({ query, headers }));
  }
});

test('#18·NFR-011: 저장소 환경변수가 없으면 방 지우기도 503 unavailable', async () => {
  const out = {};
  await handler({ method: 'DELETE', query: { id: ROOM_ID }, headers: { 'x-host-token': HOST_TOKEN } }, {
    status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; },
  });
  assert.deepEqual(out, { status: 503, body: { error: 'unavailable' } });
});

test('#18: 총무 토큰 해시로 확인하고 지우면 200 ok — 확인·삭제는 한 번에(EVAL)', () => {
  const out = del(['ok']);
  assert.deepEqual({ status: out.status, body: out.body }, { status: 200, body: { ok: true } });
  assert.equal(out.commands.length, 1);
  const [name, script, keyCount, key, tokenHash] = out.commands[0];
  assert.equal(name, 'EVAL');
  assert.match(script, /host_token_hash[\s\S]*'확정'[\s\S]*DEL/);
  assert.equal(keyCount, '1');
  assert.equal(key, `room:${ROOM_ID}`);
  assert.equal(tokenHash, hostHash); // 토큰 자체가 아니라 해시를 보낸다
});

test('#18: 없는 방 404, 총무가 아니면 403, 확정된 방은 지우지 않고 409, 저장소 실패는 503', () => {
  const pick = (out) => ({ status: out.status, body: out.body });
  assert.deepEqual(pick(del(['not_found'])), { status: 404, body: { error: 'not_found' } });
  assert.deepEqual(pick(del(['forbidden'])), { status: 403, body: { error: 'forbidden' } });
  assert.deepEqual(pick(del(['confirmed'])), { status: 409, body: { error: 'confirmed' } });
  assert.deepEqual(pick(del(['THROW'])), { status: 503, body: { error: 'unavailable' } });
  assert.deepEqual(pick(del([null])), { status: 503, body: { error: 'unavailable' } });
});
