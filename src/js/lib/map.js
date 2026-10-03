// 지도 표시 (개발 A) — FUNC-015 (필수), FUNC-018 (여유 되면)
// ※ 지도 방식(카카오 지도 SDK 사용 여부)은 미결 (CLAUDE.md 10장). 정해지기 전에는 지도 영역 없이 구간 정보만 보여준다.
// 카카오 지도 SDK를 쓴다면: dapi.kakao.com/v2/maps/sdk.js?appkey={KAKAO_JS_KEY}. 불러오기 실패 시 false.
// 경로선은 경로 단계(steps)의 역 좌표를 직선으로 이어 그린다.

import { KAKAO_JS_KEY } from '../config.js';

/** 지도 SDK 불러오기. @returns {Promise<boolean>} */
export async function loadMapSdk() {
  throw new Error('아직 구현되지 않았습니다');
}

/** 출발역·만남 장소 표시 + 경로선(steps의 역 좌표를 직선으로 연결). FUNC-015 */
export function drawRoute(container, { from, to, steps }) {
  throw new Error('아직 구현되지 않았습니다');
}

/** 참여자 출발역들과 추천 역 표시. FUNC-018 */
export function drawStations(container, { origins, station }) {
  throw new Error('아직 구현되지 않았습니다');
}
