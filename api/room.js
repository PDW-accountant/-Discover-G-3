// POST /api/room (방 만들기), GET /api/room?id= (방 읽기), DELETE /api/room?id= (방 지우기) (개발 B) — FUNC-021, FUNC-014, FUNC-023, FUNC-020
// POST: 무작위 10자 이상 id + host_token 생성, room:{id}에 purpose·arrival_time·created_at·host_token_hash·status 저장, 30일 만료.
// GET: 방 정보 + 참여자 목록. host_token_hash는 돌려주지 않는다. 없거나 만료면 404.
// DELETE: 총무 토큰(x-host-token 헤더)이 맞을 때만 입력 받는 중인 방을 지운다(내 약속 목록에서 삭제, #18). 확정된 방은 참여자가
//   경로를 봐야 하므로 지우지 않는다(409 confirmed, 30일 뒤 만료).

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isRedisConfigured, redis } from './_lib/redis.js';
import { hashToken } from './_lib/token.js';
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

function roomIdOf(req) {
  const id = req.query?.id ?? new URL(req.url ?? '', 'http://localhost').searchParams.get('id');
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null;
}

/** 총무 토큰은 주소가 아니라 헤더(x-host-token)로 받는다. 저장된 해시와 같을 때만 true. */
function isHost(req, storedHash) {
  const token = req.headers?.['x-host-token'];
  if (typeof token !== 'string' || token.length < 8 || token.length > 256 || typeof storedHash !== 'string') return false;
  const given = Buffer.from(hashToken(token));
  const stored = Buffer.from(storedHash);
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/** HGETALL 결과(이름, 값, 이름, 값…)를 객체로. */
function toFields(flat) {
  const fields = {};
  for (let i = 0; i + 1 < flat.length; i += 2) fields[flat[i]] = flat[i + 1];
  return fields;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** p:{id} 필드들을 RoomParticipant 목록으로. 입력한 순서(updated_at)대로, 같으면 id 순. */
function toParticipants(fields) {
  const list = [];
  for (const [name, value] of Object.entries(fields)) {
    if (!name.startsWith('p:')) continue;
    const saved = parseJson(value);
    if (!saved || typeof saved.nickname !== 'string' || typeof saved.station_id !== 'string') continue;
    list.push({
      participant_id: name.slice(2), nickname: saved.nickname,
      origin_station_id: saved.station_id, updated_at: saved.updated_at ?? '',
    });
  }
  return list.sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.participant_id.localeCompare(b.participant_id));
}

// GET /api/room?id= — 방 정보 + 참여자 목록. 총무 토큰 해시는 돌려주지 않고, 총무인지(is_host)만 알려준다.
async function readRoom(req, res) {
  const roomId = roomIdOf(req);
  if (!roomId) return res.status(400).json({ error: 'invalid' });
  if (!isRedisConfigured()) return res.status(503).json({ error: 'unavailable' });

  let flat;
  try {
    flat = await redis(['HGETALL', `room:${roomId}`]);
  } catch (e) {
    console.error('방 읽기 실패', e);
    return res.status(503).json({ error: 'unavailable' });
  }
  if (!Array.isArray(flat)) return res.status(503).json({ error: 'unavailable' });
  if (flat.length === 0) return res.status(404).json({ error: 'not_found' }); // 없거나 만료

  const fields = toFields(flat);
  const confirmation = fields.confirmation ? parseJson(fields.confirmation) : null;
  res.setHeader?.('Cache-Control', 'no-store'); // 5초마다 읽는 값이라 캐시하지 않는다
  return res.status(200).json({
    room_id: roomId,
    purpose: fields.purpose,
    arrival_time: fields.arrival_time,
    status: fields.status ?? '입력중',
    is_host: isHost(req, fields.host_token_hash),
    participants: toParticipants(fields),
    ...(confirmation ? { confirmation } : {}),
  });
}

// 방이 있는지·총무인지·확정 전인지 확인과 삭제를 한 번에 한다(사이에 확정되는 일이 없게).
const DELETE_ROOM_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'not_found' end
if redis.call('HGET', KEYS[1], 'host_token_hash') ~= ARGV[1] then return 'forbidden' end
if redis.call('HGET', KEYS[1], 'status') == '확정' then return 'confirmed' end
redis.call('DEL', KEYS[1])
return 'ok'
`;
const DELETE_STATUS = { not_found: 404, forbidden: 403, confirmed: 409 };

// DELETE /api/room?id= — 총무가 입력 받는 중인 방을 지운다(#18). 토큰은 주소가 아니라 헤더로 받는다.
async function deleteRoom(req, res) {
  const roomId = roomIdOf(req);
  const token = req.headers?.['x-host-token'];
  if (!roomId || typeof token !== 'string' || token.length < 8 || token.length > 256) return res.status(400).json({ error: 'invalid' });
  if (!isRedisConfigured()) return res.status(503).json({ error: 'unavailable' });
  let result;
  try {
    result = await redis(['EVAL', DELETE_ROOM_SCRIPT, '1', `room:${roomId}`, hashToken(token)]);
  } catch (e) {
    console.error('방 지우기 실패', e);
    return res.status(503).json({ error: 'unavailable' });
  }
  if (result === 'ok') return res.status(200).json({ ok: true });
  if (result in DELETE_STATUS) return res.status(DELETE_STATUS[result]).json({ error: result });
  return res.status(503).json({ error: 'unavailable' });
}

export default async function handler(req, res) {
  if (req.method === 'POST') return createRoom(req, res);
  if (req.method === 'GET') return readRoom(req, res);
  if (req.method === 'DELETE') return deleteRoom(req, res);
  res.status(501).json({ error: '아직 구현되지 않았습니다' });
}
