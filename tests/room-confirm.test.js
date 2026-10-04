import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import handler from '../api/room-confirm.js';
import { hashToken } from '../api/_lib/token.js';

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
const confirmation = {
  v: 1, p: '회의', a: '2026-10-05T18:00:00+09:00', s: 'S-SAMPLE-2', pl: 'P-002', e: '2026-11-04T09:00:00.000Z',
  people: [{ n: '철수', s: 'S1', m: 20 }, { n: '영희', s: 'S2', m: 25 }, { n: '1번', s: 'S3', m: 30 }],
};
const valid = { room_id: 'room1234567', host_token: 'host-token-abcdef', confirmation };

const savedEnv = { ...process.env };
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});
afterEach(() => { process.env = { ...savedEnv }; mock.restoreAll(); });

test('POST 외 요청은 405', async () => {
  assert.equal((await call('GET')).status, 405);
});

test('FUNC-012: 형식이 틀린 입력은 400 invalid', async () => {
  const bad = [
    undefined,
    { ...valid, room_id: 'short' },
    { ...valid, host_token: undefined },
    { ...valid, host_token: 'short' },
    { ...valid, confirmation: undefined },
    { ...valid, confirmation: { ...confirmation, p: '술자리' } },
    { ...valid, confirmation: { ...confirmation, people: [] } },
  ];
  for (const body of bad) {
    assert.deepEqual(await call('POST', body), { status: 400, body: { error: 'invalid' } }, JSON.stringify(body));
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

test('hashToken: 같은 토큰은 같은 해시, 원문은 남지 않는다', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), hashToken('abd'));
  assert.match(hashToken('abc'), /^[0-9a-f]{64}$/);
});

// 저장소 결과 → 응답 변환. redis()를 정해진 결과로 바꿔 끼워야 해서 별도 Node 프로세스에서 실행한다.
function runWithRedisResult(result, body = valid) {
  const redisUrl = new URL('../api/_lib/redis.js', import.meta.url).href;
  const handlerUrl = new URL('../api/room-confirm.js', import.meta.url).href;
  const code = `
    import { mock } from 'node:test';
    const sent = [];
    mock.module(${JSON.stringify(redisUrl)}, { namedExports: {
      isRedisConfigured: () => true,
      redis: async (cmd) => { sent.push(cmd); return ${JSON.stringify(result)}; },
    } });
    const { default: handler } = await import(${JSON.stringify(handlerUrl)});
    const out = {};
    await handler({ method: 'POST', body: ${JSON.stringify(body)} }, {
      status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; },
    });
    out.command = sent[0];
    console.log(JSON.stringify(out));
  `;
  const stdout = execFileSync(process.execPath,
    ['--experimental-test-module-mocks', '--no-warnings', '--input-type=module', '-e', code], { encoding: 'utf8' });
  return JSON.parse(stdout);
}

test('FUNC-012: 확정 성공이면 200과 저장한 확정 정보, 저장소에는 토큰 해시와 정리된 확정 정보를 보낸다', () => {
  const out = runWithRedisResult(['ok'], { ...valid, confirmation: { ...confirmation, share_url: 'https://x/?room=1' } });
  assert.deepEqual(out, {
    status: 200,
    body: { confirmation },
    command: out.command,
  });
  const [name, script, keyCount, key, tokenHash, saved] = out.command;
  assert.equal(name, 'EVAL');
  assert.match(script, /HSET/);
  assert.match(script, /확정/);
  assert.equal(keyCount, '1');
  assert.equal(key, 'room:room1234567');
  assert.equal(tokenHash, hashToken('host-token-abcdef')); // 토큰 원문은 보내지 않는다
  assert.deepEqual(JSON.parse(saved), confirmation);      // share_url은 버리고 저장
});

test('FUNC-012: 저장소가 거절한 이유를 상태 코드와 함께 돌려준다', () => {
  const cases = [
    [['not_found'], 404, 'not_found'],
    [['forbidden'], 403, 'forbidden'],
    [['뜻밖의값'], 503, 'unavailable'],
    [null, 503, 'unavailable'],
  ];
  for (const [result, status, error] of cases) {
    const out = runWithRedisResult(result);
    assert.deepEqual({ status: out.status, body: out.body }, { status, body: { error } }, JSON.stringify(result));
  }
});
