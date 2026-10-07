// 방 참여자 명단 비교 (#96)
// 총무가 '찾기'를 누를 때와 확정할 때, 서버의 최신 명단이 화면·결과에 쓴 명단과 같은지 확인한다.
// 다르면(그사이 누가 입력·수정·삭제) 옛 명단으로 계산·확정하지 않고 다시 확인하게 한다.

/**
 * 비교용 값. 참여자 id·닉네임·출발역만 본다(입력 시각은 빼서, 같은 값으로 다시 저장한 것은 바뀐 것으로 보지 않는다). 순서는 상관없다.
 * @param {Array<{participant_id, nickname, origin_station_id}>} participants
 */
export function rosterKey(participants = []) {
  const rows = participants.map((p) => [String(p.participant_id ?? ''), String(p.nickname ?? ''), String(p.origin_station_id ?? '')]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(rows);
}

/** 두 명단이 같은지. */
export function sameRoster(a, b) {
  return rosterKey(a) === rosterKey(b);
}
