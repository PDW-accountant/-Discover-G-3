// 앱 전체 설정값. 숫자를 바꿀 때는 이 파일만 고칩니다.

// 카카오 JavaScript 키 (지도 SDK, 카카오톡 공유용). 등록 도메인에서만 동작하는 공개용 키. 값은 대원이 넣습니다.
export const KAKAO_JS_KEY = '';

export const MIN_PARTICIPANTS = 3;
export const MAX_PARTICIPANTS = 9;
export const NICKNAME_MAX_LENGTH = 6;
export const CANDIDATE_COUNT = 3;                  // 1차로 추리는 후보 역 수 (FUNC-005)
export const PLACE_COUNT = 3;                      // 만남 장소 추천 수 (FUNC-010)
export const POLL_INTERVAL_MS = 5000;              // 총무 화면 입력 현황 갱신 간격 (FUNC-023)
export const POLL_STOP_AFTER_MS = 10 * 60 * 1000;  // 변화 없으면 자동 확인 중단 (FUNC-023)
export const RESULT_TIMEOUT_MS = 10000;            // 결과 대기 한도 (NFR-001)
export const MAX_SAVED_MEETINGS = 20;              // 내 모임 목록 최대 건수 (FUNC-020)
