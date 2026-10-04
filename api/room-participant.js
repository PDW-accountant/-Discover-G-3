// POST·DELETE /api/room-participant — 참여자 저장·삭제 (개발 B) — FUNC-022, FUNC-023
// POST { room_id, participant_id, nickname, origin_station_id }: room:{id}의 p:{participant_id} 필드 하나만 저장 (동시 입력 시 덮어쓰기 없음).
// 9명 초과 → '인원이 가득 찼어요', 닉네임 중복 → 안내. 확정된 방이면 거절.
// DELETE { room_id, participant_id, host_token }: host_token이 맞을 때만 p:{participant_id} 필드를 지운다. 확정된 방이면 거절.
//   없는 참여자를 지우라고 해도 성공으로 본다(이미 지워진 상태).

import { isRedisConfigured, redis } from './_lib/redis.js';
import { hashToken } from './_lib/token.js';
import { MAX_PARTICIPANTS, NICKNAME_MAX_LENGTH } from '../src/js/config.js';

// 방 확인·인원·닉네임 검사와 저장을 한 번에 실행한다. Redis가 스크립트를 한 번에 하나씩 돌리므로
// 두 사람이 동시에 저장해도 9명을 넘기거나 같은 닉네임이 생기지 않는다.
// 필드 값은 { nickname, station_id, updated_at } (CLAUDE.md 6장).
const SAVE_SCRIPT = `
local key = KEYS[1]
local field = 'p:' .. ARGV[1]
local nickname = ARGV[2]
if redis.call('EXISTS', key) == 0 then return {'not_found'} end
if redis.call('HGET', key, 'status') == '확정' then return {'confirmed'} end
local fields = redis.call('HGETALL', key)
local others = 0
local taken = {}
local mine = false
for i = 1, #fields, 2 do
  local f = fields[i]
  if string.sub(f, 1, 2) == 'p:' then
    if f == field then
      mine = true
    else
      others = others + 1
      local ok, p = pcall(cjson.decode, fields[i + 1])
      if ok and type(p) == 'table' and p.nickname then taken[p.nickname] = true end
    end
  end
end
if not mine and others >= tonumber(ARGV[5]) then return {'full'} end
if nickname == '' then
  local n = 1
  while taken[n .. '번'] do n = n + 1 end
  nickname = n .. '번'
elseif taken[nickname] then
  return {'duplicate_nickname'}
end
redis.call('HSET', key, field, cjson.encode({ nickname = nickname, station_id = ARGV[3], updated_at = ARGV[4] }))
return {'ok', nickname}
`;

// 방 확인·총무 토큰 확인·삭제를 한 번에 실행한다 (확인과 삭제 사이에 다른 요청이 끼어들지 않게).
const DELETE_SCRIPT = `
local key = KEYS[1]
if redis.call('EXISTS', key) == 0 then return {'not_found'} end
if redis.call('HGET', key, 'host_token_hash') ~= ARGV[1] then return {'forbidden'} end
if redis.call('HGET', key, 'status') == '확정' then return {'confirmed'} end
redis.call('HDEL', key, 'p:' .. ARGV[2])
return {'ok'}
`;

const STATUS_BY_ERROR = { not_found: 404, forbidden: 403, confirmed: 409, full: 409, duplicate_nickname: 409 };

function isId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

async function saveParticipant(req, res) {
  const { room_id, participant_id, nickname = '', origin_station_id } = req.body ?? {};
  const name = typeof nickname === 'string' ? nickname.trim() : null;
  if (!isId(room_id) || !isId(participant_id)
    || name === null || Array.from(name).length > NICKNAME_MAX_LENGTH || /[\u0000-\u001f]/.test(name)
    || typeof origin_station_id !== 'string' || !origin_station_id || origin_station_id.length > 64) {
    return res.status(400).json({ error: 'invalid' });
  }
  if (!isRedisConfigured()) return res.status(503).json({ error: 'unavailable' });

  const updatedAt = new Date().toISOString();
  let result;
  try {
    result = await redis(['EVAL', SAVE_SCRIPT, '1', `room:${room_id}`,
      participant_id, name, origin_station_id, updatedAt, String(MAX_PARTICIPANTS)]);
  } catch (e) {
    console.error('참여자 저장 실패', e);
    return res.status(503).json({ error: 'unavailable' });
  }

  const [code, savedNickname] = Array.isArray(result) ? result : [];
  if (code !== 'ok') {
    return res.status(STATUS_BY_ERROR[code] ?? 503).json({ error: STATUS_BY_ERROR[code] ? code : 'unavailable' });
  }
  return res.status(200).json({
    participant: { participant_id, nickname: savedNickname, origin_station_id, updated_at: updatedAt },
  });
}

async function deleteParticipant(req, res) {
  const { room_id, participant_id, host_token } = req.body ?? {};
  if (!isId(room_id) || !isId(participant_id)
    || typeof host_token !== 'string' || host_token.length < 8 || host_token.length > 256) {
    return res.status(400).json({ error: 'invalid' });
  }
  if (!isRedisConfigured()) return res.status(503).json({ error: 'unavailable' });

  let result;
  try {
    result = await redis(['EVAL', DELETE_SCRIPT, '1', `room:${room_id}`, hashToken(host_token), participant_id]);
  } catch (e) {
    console.error('참여자 삭제 실패', e);
    return res.status(503).json({ error: 'unavailable' });
  }

  const [code] = Array.isArray(result) ? result : [];
  if (code !== 'ok') {
    return res.status(STATUS_BY_ERROR[code] ?? 503).json({ error: STATUS_BY_ERROR[code] ? code : 'unavailable' });
  }
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (req.method === 'POST') return saveParticipant(req, res);
  if (req.method === 'DELETE') return deleteParticipant(req, res);
  res.status(501).json({ error: '아직 구현되지 않았습니다' });
}
