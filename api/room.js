// POST /api/room (방 만들기), GET /api/room?id= (방 읽기) (개발 B) — FUNC-021, FUNC-014, FUNC-023
// POST: 무작위 10자 이상 id + host_token 생성, room:{id}에 purpose·arrival_time·created_at·host_token_hash·status 저장, 30일 만료.
// GET: 방 정보 + 참여자 목록. host_token_hash는 돌려주지 않는다. 없거나 만료면 404.

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

export default async function handler(req, res) {
  if (req.method === 'POST') return createRoom(req, res);
  if (req.method === 'GET') return readRoom(req, res);
  res.status(501).json({ error: '아직 구현되지 않았습니다' });
}
