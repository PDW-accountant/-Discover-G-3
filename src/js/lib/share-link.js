// 공유 링크 만들기·읽기 (개발 C) — FUNC-012, FUNC-014
// 저장소(Redis)가 있으면 방 링크 …/?room={id}를 쓰고,
// 없을 때만 확정 정보를 주소 # 뒤에 담는다 (…/#d=…). 키는 짧게, 역·장소는 id로.
// MeetingConfirmation: { v:1, p:목적, a:도착시각, s:역id, pl:장소id, people:[{n:닉네임, s:역id, m:분}] }

/** 확정 정보를 # 뒤에 넣을 문자열로 만든다. */
export function encodeConfirmation(confirmation) {
  throw new Error('아직 구현되지 않았습니다');
}

/** # 뒤 문자열을 확정 정보로 되돌린다. 형식이 맞지 않으면 null (→ 안내 화면). */
export function decodeConfirmation(text) {
  throw new Error('아직 구현되지 않았습니다');
}

/** 방 링크 주소. */
export function roomUrl(roomId, origin = location.origin) {
  return `${origin}/?room=${encodeURIComponent(roomId)}`;
}
