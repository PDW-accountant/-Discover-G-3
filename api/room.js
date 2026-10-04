// POST /api/room (방 만들기), GET /api/room?id= (방 읽기) (개발 B) — FUNC-021, FUNC-014, FUNC-023
// POST: 무작위 10자 이상 id + host_token 생성, room:{id}에 purpose·arrival_time·created_at·host_token_hash·status 저장, 30일 만료.
// GET: 방 정보 + 참여자 목록. host_token_hash는 돌려주지 않는다. 없거나 만료면 404.

import { createHash, randomBytes } from 'node:crypto';
import { isRedisConfigured, redis } from './_lib/redis.js';
import { PURPOSES } from '../src/js/config.js';

const ROOM_TTL_SECONDS = 30 * 24 * 60 * 60; // 30일 만료

// 이미 있는 방이면 아무것도 쓰지 않는다. 방 만들기와 만료 설정이 한 번에 실행되어 만료 없는 방이 생기지 않는다.
const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 'exists' end
redis.call('HSET', KEYS[1], 'purpose', ARGV[1], 'arrival_time', ARGV[2], 'created_at', ARGV[3], 'host_token_hash', ARGV[4], 'status', '입력중')
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
return 'ok'
`;

const MAX_ID_ATTEMPTS = 3;

function newRoomId() {
  return randomBytes(9).toString('base64url'); // 12자, 추측 불가
}

function newHostToken() {
  return randomBytes(24).toString('base64url');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function isValidArrival(value) {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

/** 링크의 앞부분(https://주소). 미리보기·심사용 어느 주소에서 불러도 그 주소로 만든다. */
function originOf(req) {
  const host = req.headers?.['x-forwarded-host'] ?? req.headers?.host;
  if (typeof host !== 'string' || !/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) return '';
  const forwarded = req.headers['x-forwarded-proto'];
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host); // 내 컴퓨터에서 vercel dev로 볼 때
  const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : isLocal ? 'http' : 'https';
  return `${proto}://${host}`;
}

async function createRoom(req, res) {
  const { purpose, arrival_time } = req.body ?? {};
  if (!PURPOSES.includes(purpose) || !isValidArrival(arrival_time)) {
    return res.status(400).json({ error: 'invalid' });
  }
  if (!isRedisConfigured()) return res.status(503).json({ error: 'unavailable' });

  const hostToken = newHostToken();
  const createdAt = new Date().toISOString();
  try {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const roomId = newRoomId();
      const result = await redis(['EVAL', CREATE_SCRIPT, '1', `room:${roomId}`,
        purpose, arrival_time, createdAt, hashToken(hostToken), String(ROOM_TTL_SECONDS)]);
      if (result === 'ok') {
        return res.status(200).json({ room_id: roomId, join_url: `${originOf(req)}/?room=${roomId}`, host_token: hostToken });
      }
      if (result !== 'exists') break;
    }
  } catch (e) {
    console.error('방 만들기 실패', e);
  }
  return res.status(503).json({ error: 'unavailable' });
}

export default async function handler(req, res) {
  if (req.method === 'POST') return createRoom(req, res);
  // GET(방 읽기)은 FUNC-014·023에서 구현한다.
  res.status(501).json({ error: '아직 구현되지 않았습니다' });
}
