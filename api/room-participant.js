// POST·DELETE /api/room-participant — 참여자 저장·삭제 (개발 B) — FUNC-022, FUNC-023
// POST { room_id, participant_id, nickname, origin_station_id }: room:{id}의 p:{participant_id} 필드 하나만 저장 (동시 입력 시 덮어쓰기 없음).
// 9명 초과 → '인원이 가득 찼어요', 닉네임 중복 → 안내. 확정된 방이면 거절.
// DELETE: host_token이 맞을 때만.

export default async function handler(req, res) {
  res.status(501).json({ error: '아직 구현되지 않았습니다' });
}
