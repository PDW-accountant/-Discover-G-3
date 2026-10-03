// 콘텐츠팀 구글 시트 + 공공데이터 CSV → data/*.json 변환 (개발 C) — FUNC-016
// 실행: node scripts/convert.js
// 입력: 시트에서 내려받은 CSV (후보 역 / 카테고리 / 장소 탭)
//       공공데이터 CSV: 서울시 역사마스터 정보(OA-21232), 서울교통공사 역간거리 및 소요시간(OA-12034),
//       서울교통공사 환승역 거리·소요시간(공공데이터포털 15044419)
// 출력: data/stations.json, data/transit-graph.json, data/candidates.json, data/places.json
// 검사: 역 이름 불일치, 빈 칸, 목적별 후보 역 8곳 미만, 장소 링크 없음, 그래프에 연결되지 않은 역 → 목록으로 출력
// JSON은 손으로 고치지 않고 항상 이 스크립트로 만든다.

console.log('아직 구현되지 않았습니다 (FUNC-016)');
