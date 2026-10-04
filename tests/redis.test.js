import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isRedisConfigured, redis } from '../api/_lib/redis.js';
import statusHandler from '../api/status.js';

const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});
afterEach(() => { globalThis.fetch = realFetch; process.env = { ...savedEnv }; });

const configure = () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'secret-token-value';
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('NFR-011: URL과 토큰이 둘 다 있어야 연결된 것으로 본다', () => {
  assert.equal(isRedisConfigured(), false);
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
  assert.equal(isRedisConfigured(), false);
  process.env.UPSTASH_REDIS_REST_TOKEN = 'x';
  assert.equal(isRedisConfigured(), true);
});

test('redis(): 명령을 Upstash REST 주소에 토큰과 함께 POST하고 result를 돌려준다', async () => {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return json(200, { result: 'OK' }); };
  assert.equal(await redis(['HSET', 'room:abc', 'purpose', '회식']), 'OK');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://redis.example.test');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-token-value');
  assert.deepEqual(JSON.parse(calls[0].options.body), ['HSET', 'room:abc', 'purpose', '회식']);
});

test('redis(): 연결 정보가 없으면 요청 없이 예외', async () => {
  globalThis.fetch = async () => { throw new Error('호출되면 안 된다'); };
  await assert.rejects(() => redis(['PING']), /연결되어 있지 않습니다/);
});

test('redis(): 오류 응답·JSON 아닌 응답이면 예외, 메시지에 토큰이 들어가지 않는다', async () => {
  configure();
  const responses = [
    () => json(401, { error: 'WRONGPASS invalid or missing auth token' }),
    () => json(200, { error: 'ERR syntax error' }),
    () => new Response('<html>Bad Gateway</html>', { status: 502 }),
  ];
  for (const respond of responses) {
    globalThis.fetch = async () => respond();
    await assert.rejects(() => redis(['PING']), (error) => {
      assert.ok(!error.message.includes('secret-token-value'));
      return true;
    });
  }
});

async function callStatus(method) {
  const out = {};
  await statusHandler({ method }, {
    status(code) { out.status = code; return this; },
    json(data) { out.body = data; return this; },
  });
  return out;
}

test('NFR-011: /api/status는 저장소 연결 여부만 알려준다', async () => {
  assert.deepEqual(await callStatus('GET'), { status: 200, body: { rooms: false } });
  configure();
  const connected = await callStatus('GET');
  assert.deepEqual(connected, { status: 200, body: { rooms: true } });
  assert.ok(!JSON.stringify(connected).includes('secret-token-value'), '키·토큰 값은 응답에 없다');
  assert.ok(!JSON.stringify(connected).includes('redis.example.test'));
});

test('/api/status: GET 외 요청은 405', async () => {
  assert.equal((await callStatus('POST')).status, 405);
});
