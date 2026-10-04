// 지도 표시 (개발 A) — FUNC-015 (필수), FUNC-018 (여유 되면)
// 10/4 결정(#16): 카카오 지도 JavaScript SDK(dapi.kakao.com/v2/maps/sdk.js?appkey={KAKAO_JS_KEY}) + 실패하면 SVG 약도.
//   drawRoute는 먼저 SVG 약도(모이자 UI 프로토타입2의 mapSVG 모양)를 그리고, SDK가 열리면 같은 자리를 실제 지도로 바꾼다.
//   SDK는 카카오 개발자 콘솔에 등록한 Web 도메인에서만 열린다. 내려받아 localhost로 실행하거나 등록 안 한 미리보기 주소,
//   불러오기 실패·5초 초과면 SVG 약도가 그대로 남는다. 함수 모양(drawRoute 등)은 바꾸지 않는다.
// 경로선은 길찾기 API 없이 구간에서 열차가 서는 역(steps[].via)의 좌표를 이어 그린다.

import { KAKAO_JS_KEY } from '../config.js';
import { t } from './data.js';

const W = 320;
const H = 170;
const PAD = 40;

const hasCoords = (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng);
const escapeXml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const MAP_SDK_TIMEOUT_MS = 5000;
let sdkPromise = null;

/**
 * 카카오 지도 SDK를 한 번만 불러온다. 키가 없거나 브라우저가 아니면 불러오지 않는다.
 * @returns {Promise<boolean>} 쓸 수 있으면 true. 등록 안 한 도메인·네트워크 실패·5초 초과면 false(→ SVG 약도 유지)
 */
export function loadMapSdk({ key = KAKAO_JS_KEY, doc = globalThis.document, win = globalThis.window, timeout = MAP_SDK_TIMEOUT_MS } = {}) {
  if (!key || !doc?.createElement || !win) return Promise.resolve(false);
  if (win.kakao?.maps?.LatLng) return Promise.resolve(true);
  sdkPromise ??= new Promise((resolve) => {
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; clearTimeout(timer); resolve(ok); } };
    const timer = setTimeout(() => done(false), timeout);
    const script = doc.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.onload = () => { try { win.kakao.maps.load(() => done(true)); } catch { done(false); } };
    script.onerror = () => done(false);
    doc.head.append(script);
  });
  return sdkPromise;
}

/**
 * 경로선의 점: 출발역 → 구간마다 열차가 서는 역(via, 없으면 하차역) → 만남 역.
 * 같은 좌표가 이어지면 하나로 줄이고 좌표 없는 역은 뺀다.
 * @param {{from: Station, to: Station, steps?: Array<{to: Station, via?: Station[]}>}} route
 * @returns {Station[]|null} 출발·도착 좌표가 없으면 null
 */
export function routePoints({ from, to, steps = [] }) {
  if (!hasCoords(from) || !hasCoords(to)) return null;
  const middle = steps.flatMap((s) => (s?.via?.length ? s.via : [s?.to]));
  const points = [from, ...middle.filter(hasCoords), to];
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
  const transfers = (steps ?? []).slice(1).map((s) => s?.from).filter(hasCoords);
  loadMapSdk().then((ok) => {
    if (ok && container.isConnected) drawKakaoRoute(container, { points, from, to, transfers });
  }).catch(() => {});
  return true;
}

/** 카카오 지도 위의 역 이름표(출발·환승·만남). */
function labelOverlay(maps, station, text, kind) {
  return new maps.CustomOverlay({
    position: new maps.LatLng(station.lat, station.lng),
    content: `<div class="kmap-label ${kind}">${escapeXml(text)}</div>`,
    yAnchor: 1.4,
  });
}

/**
 * SVG 약도 자리를 카카오 지도로 바꾼다. 경로선 + 출발역·환승역·만남 역 이름표. 지도는 움직이지 않게 고정해
 * 화면 세로 스크롤을 방해하지 않는다. 실패하면 SVG 약도를 그대로 둔다.
 */
function drawKakaoRoute(container, { points, from, to, transfers }) {
  const { maps } = globalThis.window.kakao;
  const svg = [...container.childNodes];
  const box = document.createElement('div');
  box.className = 'kmap';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', t('route.mapLabel', { from: from.name, to: to.name }));
  try {
    container.replaceChildren(box);
    const path = points.map((p) => new maps.LatLng(p.lat, p.lng));
    const map = new maps.Map(box, { center: path[path.length - 1], level: 7, draggable: false, scrollwheel: false, disableDoubleClickZoom: true });
    new maps.Polyline({ map, path, strokeWeight: 5, strokeColor: '#D9512C', strokeOpacity: 0.9, strokeStyle: 'solid' });
    for (const station of transfers) labelOverlay(maps, station, t('route.mapTransfer', { name: station.name }), 'transfer').setMap(map);
    labelOverlay(maps, from, t('route.mapFrom'), 'from').setMap(map);
    labelOverlay(maps, to, t('route.mapTo'), 'to').setMap(map);
    const bounds = new maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.setBounds(bounds, 36, 36, 36, 36);
  } catch (e) {
    console.warn('카카오 지도를 그리지 못해 약도를 보여줍니다', e);
    container.replaceChildren(...svg);
  }
}

/** 참여자 출발역들과 추천 역 표시. FUNC-018 */
export function drawStations(container, { origins, station }) {
  throw new Error('아직 구현되지 않았습니다');
}
