// POST /api/room-confirm — 모임 확정 저장 (개발 B) — FUNC-012
// { room_id, host_token, confirmation }: host_token이 맞으면 status=확정, confirmation 저장.

export default async function handler(req, res) {
  res.status(501).json({ error: '아직 구현되지 않았습니다' });
}
