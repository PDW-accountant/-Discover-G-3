// GET /api/status — 서버 기능 사용 가능 여부 (개발 B) — NFR-011
// 응답: { rooms: Redis가 연결되어 있는지 }. 키·토큰 값 자체는 절대 돌려주지 않는다.

export default async function handler(req, res) {
  res.status(501).json({ error: '아직 구현되지 않았습니다' });
}
