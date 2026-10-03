// POST /api/room (방 만들기), GET /api/room?id= (방 읽기) (개발 B) — FUNC-021, FUNC-014, FUNC-023
// POST: 무작위 10자 이상 id + host_token 생성, room:{id}에 purpose·arrival_time·created_at·host_token_hash·status 저장, 30일 만료.
// GET: 방 정보 + 참여자 목록. host_token_hash는 돌려주지 않는다. 없거나 만료면 404.

export default async function handler(req, res) {
  res.status(501).json({ error: '아직 구현되지 않았습니다' });
}
