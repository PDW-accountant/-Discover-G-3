// 지도 표시 (개발 A) — FUNC-015 (필수), FUNC-018 (여유 되면)
// ※ 지도 방식(카카오 지도 SDK 사용 여부)은 미결 (CLAUDE.md 10장). 시그니처는 고정하고 안쪽만 바꾼다.
//   지금(#13): 외부 SDK 없이 역 좌표로 그리는 SVG 약도 — 모이자 UI 프로토타입2의 mapSVG 모양.
// 카카오 지도 SDK를 쓴다면: dapi.kakao.com/v2/maps/sdk.js?appkey={KAKAO_JS_KEY}. 불러오기 실패 시 false.
// 경로선은 경로 단계(steps)의 역 좌표를 직선으로 이어 그린다.

import { KAKAO_JS_KEY } from '../config.js';
import { t } from './data.js';

const W = 320;
const H = 170;
const PAD = 40;

const hasCoords = (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng);
const escapeXml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 지도 SDK 불러오기. @returns {Promise<boolean>} SVG 약도를 쓰는 동안은 SDK를 불러오지 않아 false. */
export async function loadMapSdk() {
  if (!KAKAO_JS_KEY) return false;
  return false; // 지도 방식이 정해지면 여기서 SDK를 불러온다
}

/**
 * 경로선의 점: 출발역 → 각 구간의 하차역 → 만남 역. 같은 역이 이어지면 하나로 줄이고 좌표 없는 역은 뺀다.
 * @param {{from: Station, to: Station, steps?: Array<{to: Station}>}} route
 * @returns {Station[]|null} 출발·도착 좌표가 없으면 null
 */
export function routePoints({ from, to, steps = [] }) {
  if (!hasCoords(from) || !hasCoords(to)) return null;
  const points = [from, ...steps.map((s) => s?.to).filter(hasCoords), to];
  return points.filter((p, i) => i === 0 || p.lat !== points[i - 1].lat || p.lng !== points[i - 1].lng);
}

/** 위경도를 약도 좌표로. 한 축의 폭이 0이면 가운데에 둔다. */
function projector(points) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const x = (lng) => (maxLng === minLng ? W / 2 : PAD + ((lng - minLng) / (maxLng - minLng)) * (W - PAD * 2));
  const y = (lat) => (maxLat === minLat ? H / 2 : PAD + ((maxLat - lat) / (maxLat - minLat)) * (H - PAD * 2));
  return (p) => [Math.round(x(p.lng) * 10) / 10, Math.round(y(p.lat) * 10) / 10];
}

/**
 * 출발역·만남 장소 표시 + 경로선(steps의 역 좌표를 직선으로 연결). FUNC-015
 * @param {HTMLElement} container 지도를 넣을 자리
 * @param {{from: Station, to: Station, steps: Array<{line, from: Station, to: Station, minutes}>}} route
 * @returns {boolean} 그리지 못하면 false (화면은 '카카오맵에서 보기' 링크로 대신한다)
 */
export function drawRoute(container, { from, to, steps }) {
  const points = routePoints({ from, to, steps });
  if (!container || !points || points.length < 2) return false;
  const coords = points.map(projector(points));
  const [x1, y1] = coords[0];
  const [x2, y2] = coords[coords.length - 1];
  const middle = coords.slice(1, -1)
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#D9512C" stroke-width="2"/>`).join('');
  const label = escapeXml(t('route.mapLabel', { from: from.name, to: to.name }));
  container.innerHTML = `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
    <rect width="${W}" height="${H}" fill="#F9F6F1"/>
    <path d="M-10 70 C 60 50, 90 105, 160 98 S 260 60, 330 72" fill="none" stroke="#CFC4B8" stroke-width="1.5"/>
    <path d="M-10 112 C 70 100, 110 140, 180 132 S 280 100, 330 108" fill="none" stroke="#CFC4B8" stroke-width="1.5"/>
    <polyline points="${coords.map((c) => c.join(',')).join(' ')}" fill="none" stroke="#D9512C" stroke-width="3.5" stroke-dasharray="2 8" stroke-linecap="round" stroke-linejoin="round"/>
    ${middle}
    <circle cx="${x1}" cy="${y1}" r="7" fill="#D9512C" stroke="#fff" stroke-width="3"/>
    <circle cx="${x2}" cy="${y2}" r="8" fill="#fff" stroke="#2B2A28" stroke-width="2"/><circle cx="${x2}" cy="${y2}" r="3" fill="#D9512C"/>
    <text x="${x1}" y="${Math.min(y1 + 24, H - 4)}" text-anchor="middle" font-size="13" font-weight="700" fill="#C2441F" font-family="Noto Sans KR, sans-serif">${escapeXml(t('route.mapFrom'))}</text>
    <text x="${x2}" y="${Math.max(y2 - 16, 14)}" text-anchor="middle" font-size="13" font-weight="700" fill="#C2441F" font-family="Noto Sans KR, sans-serif">${escapeXml(t('route.mapTo'))}</text>
  </svg>`;
  return true;
}

/** 참여자 출발역들과 추천 역 표시. FUNC-018 */
export function drawStations(container, { origins, station }) {
  throw new Error('아직 구현되지 않았습니다');
}
