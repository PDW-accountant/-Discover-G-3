// 앱 전체 설정값. 숫자를 바꿀 때는 이 파일만 고칩니다.

// 카카오 JavaScript 키 (지도 SDK, 카카오톡 공유용). 등록 도메인에서만 동작하는 공개용 키. 값은 대원이 넣습니다.
// 등록 도메인(카카오 디벨로퍼스 JavaScript SDK 도메인·제품 링크 관리 웹 도메인): https://eodiga3.vercel.app
export const KAKAO_JS_KEY = '9fe6b06838b0a44ca0031e9af2a9ed25';

export const PURPOSES = ['회식', '회의', '오락'];     // 모임 목적 저장값 (화면·서버·데이터 공통)
export const MIN_PARTICIPANTS = 3;
export const MAX_PARTICIPANTS = 9;
export const NICKNAME_MAX_LENGTH = 6;
export const CANDIDATE_COUNT = 3;                  // 1차로 추리는 후보 역 수 (FUNC-005)
export const PLACE_COUNT = 3;                      // 만남 장소 추천 수 (FUNC-010)
export const POLL_INTERVAL_MS = 5000;              // 총무 화면 입력 현황 갱신 간격 (FUNC-023)
export const POLL_STOP_AFTER_MS = 10 * 60 * 1000;  // 변화 없으면 자동 확인 중단 (FUNC-023)
export const RESULT_TIMEOUT_MS = 10000;            // 결과 대기 한도 (NFR-001)
export const MAX_SAVED_MEETINGS = 20;              // 내 모임 목록 최대 건수 (FUNC-020)
export const WAIT_MINUTES = 3;                     // 배차 대기(분). 처음 탈 때·환승·급행 갈아타기마다 더한다 (FUNC-006). 검증 후 조정
export const DWELL_MINUTES = 0.5;                  // 정차 시간(분, 30초). 열차가 중간에 서는 역마다 더한다 — 공공데이터 역간 시간은 달리는 시간만이라서 (#25 10/4)
export const ESTIMATE_METERS_PER_MINUTE = 70;      // 그래프에 없는 역의 직선거리 예상 속도(분속 m) (SFR-020)
