// 카카오톡 공유·문구 복사 (개발 A) — FUNC-013

/**
 * 정해진 템플릿으로 공유 문구를 만든다 (NFR-002). 9명이어도 잘리지 않게.
 * 만남 장소와 경로가 확정되었어요. 링크를 통해 본인의 경로를 확인하세요.
 * 만남 장소 : ○○ / 예상 소요시간 : 감이 00분, 택이 00분, … / 링크
 * @returns {{text:string, link:string}}
 */
export function buildShareMessage(confirmation, placeName, link) {
  throw new Error('아직 구현되지 않았습니다');
}

/** 카카오 SDK로 공유 창을 연다. 실패·취소면 false (→ '문구 복사' 안내). */
export async function shareKakao(message) {
  throw new Error('아직 구현되지 않았습니다');
}

/** 클립보드 복사. 권한이 없으면 false (→ 선택 가능한 텍스트로 표시). */
export async function copyText(text) {
  throw new Error('아직 구현되지 않았습니다');
}
