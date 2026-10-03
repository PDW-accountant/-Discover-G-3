// 카카오 지도 (개발 A) — FUNC-015 (필수), FUNC-018 (여유 되면)
// SDK: dapi.kakao.com/v2/maps/sdk.js?appkey={KAKAO_JS_KEY}. 불러오기 실패 시 false를 돌려주고,
// 화면은 지도 대신 '카카오맵에서 경로 보기' 링크를 보여준다.

import { KAKAO_JS_KEY } from '../config.js';

/** 지도 SDK 불러오기. @returns {Promise<boolean>} */
export async function loadMapSdk() {
  throw new Error('아직 구현되지 않았습니다');
}

/** 출발역·만남 장소 표시 + 경로선. FUNC-015 */
export function drawRoute(container, { from, to, steps }) {
  throw new Error('아직 구현되지 않았습니다');
}

/** 참여자 출발역들과 추천 역 표시. FUNC-018 */
export function drawStations(container, { origins, station }) {
  throw new Error('아직 구현되지 않았습니다');
}
