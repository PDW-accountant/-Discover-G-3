// POST /api/room-confirm — 모임 확정 저장 (개발 B) — FUNC-012
// { room_id, host_token, confirmation }: host_token이 맞으면 status=확정, confirmation 저장.
// confirmation은 lib/share-link.js의 MeetingConfirmation과 같은 형식(share_url 제외)으로 검사해 저장한다.
// 총무가 장소를 바꿔 다시 확정하면 덮어쓴다. 만료(30일)는 방을 만들 때 건 값을 그대로 둔다.

import { isRedisConfigured, redis } from './_lib/redis.js';
import { hashToken } from './_lib/token.js';
import { normalizeConfirmation } from '../src/js/lib/share-link.js';

// 방 확인·토큰 확인·저장을 한 번에 실행한다 (사이에 다른 요청이 끼어들지 않게).
const CONFIRM_SCRIPT = `
local key = KEYS[1]
if redis.call('EXISTS', key) == 0 then return {'not_found'} end
if redis.call('HGET', key, 'host_token_hash') ~= ARGV[1] then return {'forbidden'} end
redis.call('HSET', key, 'status', '확정', 'confirmation', ARGV[2])
return {'ok'}
`;

const STATUS_BY_ERROR = { not_found: 404, forbidden: 403 };

function isId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

function isToken(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 256;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { room_id, host_token, confirmation } = req.body ?? {};
  const clean = normalizeConfirmation(confirmation);
  if (!isId(room_id) || !isToken(host_token) || !clean) return res.status(400).json({ error: 'invalid' });
  if (!isRedisConfigured()) return res.status(503).json({ error: 'unavailable' });

  let result;
  try {
    result = await redis(['EVAL', CONFIRM_SCRIPT, '1', `room:${room_id}`, hashToken(host_token), JSON.stringify(clean)]);
  } catch (e) {
    console.error('모임 확정 저장 실패', e);
    return res.status(503).json({ error: 'unavailable' });
  }

  const [code] = Array.isArray(result) ? result : [];
  if (code !== 'ok') {
    return res.status(STATUS_BY_ERROR[code] ?? 503).json({ error: STATUS_BY_ERROR[code] ? code : 'unavailable' });
  }
  return res.status(200).json({ confirmation: clean });
}
