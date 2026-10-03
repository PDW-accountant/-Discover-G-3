// GET /api/nearby?station={역id}&purpose= — 근처 장소 더 보기 (여유 되면) (개발 B) — FUNC-017
// 카카오 로컬 카테고리 검색(KAKAO_REST_API_KEY), 역 반경 약 500m, 거리순 5곳. 실패·한도 초과면 { fallback: true }.

export default async function handler(req, res) {
  res.status(501).json({ error: '아직 구현되지 않았습니다' });
}
