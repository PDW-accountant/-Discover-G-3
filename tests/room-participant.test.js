import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import handler from '../api/room-participant.js';

/** Vercel 서버 함수의 res 흉내. */
async function call(method, body) {
  const out = {};
  const res = {
    status(code) { out.status = code; return this; },
    json(data) { out.body = data; return this; },
  };
  await handler({ method, body }, res);
  return out;
}
const valid = { room_id: 'room1234567', participant_id: 'p_abcdefgh', nickname: '철수', origin_station_id: 'S1' };

const savedEnv = { ...process.env };
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});
afterEach(() => { process.env = { ...savedEnv }; mock.restoreAll(); });

test('POST·DELETE 외 요청은 501', async () => {
  assert.equal((await call('GET')).status, 501);
  assert.equal((await call('PUT', valid)).status, 501);
});

test('FUNC-022: 형식이 틀린 입력은 400 invalid', async () => {
  const bad = [
    undefined,                                          // 본문 없음
    { ...valid, room_id: undefined },
    { ...valid, room_id: 'short' },                     // 8자 미만
    { ...valid, room_id: 'room/../x123' },              // 허용되지 않는 문자
    { ...valid, participant_id: '' },
    { ...valid, participant_id: 'x'.repeat(65) },
    { ...valid, nickname: '일곱글자닉네임' },             // 6자 초과
    { ...valid, nickname: 123 },
    { ...valid, nickname: 'a\nb' },                     // 제어 문자
    { ...valid, origin_station_id: undefined },
    { ...valid, origin_station_id: '' },
    { ...valid, origin_station_id: 'S'.repeat(65) },
  ];
  for (const body of bad) {
    assert.deepEqual(await call('POST', body), { status: 400, body: { error: 'invalid' } }, JSON.stringify(body));
  }
});

test('FUNC-022: 닉네임 6자(한글), 앞뒤 공백, 빈 닉네임은 형식 검사를 통과한다', async () => {
  // 저장소가 없으므로 형식 검사를 통과하면 503까지 간다
  for (const nickname of ['여섯글자닉네', '  철수  ', '', undefined]) {
    assert.equal((await call('POST', { ...valid, nickname })).status, 503, `닉네임 ${nickname}`);
  }
});

test('NFR-011: 저장소 환경변수가 없으면 503 unavailable', async () => {
  assert.deepEqual(await call('POST', valid), { status: 503, body: { error: 'unavailable' } });
});

test('NFR-011: 저장소 호출이 실패해도 예외 없이 503 unavailable', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  mock.method(console, 'error', () => {});
  assert.deepEqual(await call('POST', valid), { status: 503, body: { error: 'unavailable' } });
});

// 저장소 결과 → 응답 변환. redis()를 정해진 결과로 바꿔 끼워야 해서 별도 Node 프로세스에서 실행한다.
function runWithRedisResult(result, body = valid, method = 'POST') {
  const redisUrl = new URL('../api/_lib/redis.js', import.meta.url).href;
  const handlerUrl = new URL('../api/room-participant.js', import.meta.url).href;
  const code = `
    import { mock } from 'node:test';
    const sent = [];
    mock.module(${JSON.stringify(redisUrl)}, { namedExports: {
      isRedisConfigured: () => true,
      redis: async (cmd) => { sent.push(cmd); return ${JSON.stringify(result)}; },
    } });
    const { default: handler } = await import(${JSON.stringify(handlerUrl)});
    const out = {};
    await handler({ method: ${JSON.stringify(method)}, body: ${JSON.stringify(body)} }, {
      status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; },
    });
    out.command = sent[0];
    console.log(JSON.stringify(out));
  `;
  const stdout = execFileSync(process.execPath,
    ['--experimental-test-module-mocks', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' });
  return JSON.parse(stdout);
}

test('FUNC-022: 저장 성공이면 200과 RoomParticipant, 저장소에는 정해진 키·인자로 한 번에 보낸다', () => {
  const out = runWithRedisResult(['ok', '철수'], { ...valid, nickname: '  철수 ' });
  assert.equal(out.status, 200);
  const { participant } = out.body;
  assert.deepEqual(Object.keys(participant).sort(), ['nickname', 'origin_station_id', 'participant_id', 'updated_at']);
  assert.equal(participant.participant_id, 'p_abcdefgh');
  assert.equal(participant.nickname, '철수');
  assert.equal(participant.origin_station_id, 'S1');
  assert.ok(!Number.isNaN(Date.parse(participant.updated_at)));

  const [name, script, keyCount, key, ...args] = out.command;
  assert.equal(name, 'EVAL');
  assert.match(script, /HSET/);
  assert.equal(keyCount, '1');
  assert.equal(key, 'room:room1234567');
  assert.deepEqual(args, ['p_abcdefgh', '철수', 'S1', participant.updated_at, '9']); // 닉네임은 앞뒤 공백 제거, 최대 인원 9
});

test('FUNC-022: 빈 닉네임이면 저장소가 정한 번호 닉네임을 돌려준다', () => {
  const out = runWithRedisResult(['ok', '2번'], { ...valid, nickname: '' });
  assert.equal(out.body.participant.nickname, '2번');
  assert.equal(out.command[5], '');
});

test('FUNC-022: 저장소가 거절한 이유를 상태 코드와 함께 돌려준다', () => {
  const cases = [
    [['not_found'], 404, 'not_found'],
    [['confirmed'], 409, 'confirmed'],
    [['full'], 409, 'full'],
    [['duplicate_nickname'], 409, 'duplicate_nickname'],
    [['뜻밖의값'], 503, 'unavailable'],
    [null, 503, 'unavailable'],
  ];
  for (const [result, status, error] of cases) {
    const out = runWithRedisResult(result);
    assert.deepEqual({ status: out.status, body: out.body }, { status, body: { error } }, JSON.stringify(result));
  }
});

// ---- FUNC-023: DELETE (총무의 참여자 삭제) ----
const del = { room_id: 'room1234567', participant_id: 'p_abcdefgh', host_token: 'host-token-12345' };

test('FUNC-023: 삭제 요청 형식이 틀리면 400 invalid', async () => {
  const bad = [
    undefined,
    { ...del, room_id: 'short' },
    { ...del, participant_id: 'a/b' },
    { ...del, host_token: undefined },
    { ...del, host_token: 'short' },        // 8자 미만
    { ...del, host_token: 'x'.repeat(257) },
    { ...del, host_token: 12345678 },
  ];
  for (const body of bad) {
    assert.deepEqual(await call('DELETE', body), { status: 400, body: { error: 'invalid' } }, JSON.stringify(body));
  }
});

test('NFR-011: 삭제도 저장소가 없으면 503 unavailable', async () => {
  assert.deepEqual(await call('DELETE', del), { status: 503, body: { error: 'unavailable' } });
});

test('FUNC-023: 삭제 성공이면 200, 저장소에는 토큰 해시만 보낸다', () => {
  const out = runWithRedisResult(['ok'], del, 'DELETE');
  assert.deepEqual({ status: out.status, body: out.body }, { status: 200, body: { ok: true } });
  const [name, script, keyCount, key, tokenHash, participantId] = out.command;
  assert.equal(name, 'EVAL');
  assert.match(script, /HDEL/);
  assert.match(script, /host_token_hash/);
  assert.equal(keyCount, '1');
  assert.equal(key, 'room:room1234567');
  assert.equal(tokenHash, createHash('sha256').update('host-token-12345').digest('hex'));
  assert.equal(participantId, 'p_abcdefgh');
  assert.ok(!JSON.stringify(out.command).includes('host-token-12345'), '토큰 원문은 저장소에 보내지 않는다');
});

test('FUNC-023: 삭제가 거절된 이유를 상태 코드와 함께 돌려준다', () => {
  const cases = [
    [['not_found'], 404, 'not_found'],
    [['forbidden'], 403, 'forbidden'],     // 총무 토큰이 다름
    [['confirmed'], 409, 'confirmed'],
    [['뜻밖의값'], 503, 'unavailable'],
    [null, 503, 'unavailable'],
  ];
  for (const [result, status, error] of cases) {
    const out = runWithRedisResult(result, del, 'DELETE');
    assert.deepEqual({ status: out.status, body: out.body }, { status, body: { error } }, JSON.stringify(result));
  }
});
