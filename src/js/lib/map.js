// 지도 표시 (개발 A) — FUNC-015 (필수), FUNC-018 (여유 되면)
// 10/4 결정(#16): 카카오 지도 JavaScript SDK(dapi.kakao.com/v2/maps/sdk.js?appkey={KAKAO_JS_KEY}) + 실패하면 SVG 약도.
//   drawRoute는 먼저 SVG 약도(모이자 UI 프로토타입2의 mapSVG 모양)를 그리고, SDK가 열리면 같은 자리를 실제 지도로 바꾼다.
//   SDK는 카카오 개발자 콘솔에 등록한 Web 도메인에서만 열린다. 내려받아 localhost로 실행하거나 등록 안 한 미리보기 주소,
//   불러오기 실패·5초 초과면 SVG 약도가 그대로 남는다. 함수 모양(drawRoute 등)은 바꾸지 않는다.
// 경로선은 길찾기 API 없이 구간에서 열차가 서는 역(steps[].via)의 좌표를 이어 그린다.
// 10/6 (#74): 경로선을 구간(탄 노선)마다 그 노선 색(stations.js의 LINE_BADGES, 호선 동그라미와 같은 색)으로 나눠 그린다.
//   선 아래에 흰 테두리 선을 깔아 지도의 도로와 구분하고, 출발·환승·도착역에는 점과 흰 알약 이름표를 둔다.
//   출발·도착 이름표는 점 위, 환승 이름표는 점 아래. 다른 이름표와 LABEL_GAP_PX 안에 겹치는 환승 이름표는 글씨를 숨기고 점만 남긴다.

import { KAKAO_JS_KEY } from '../config.js';
import { t } from './data.js';
import { lineBadge } from './stations.js';

const W = 320;
const H = 176;
const PAD = { top: 44, right: 36, bottom: 44, left: 36 }; // 위·아래: 이름표 자리(선 반대쪽에 붙으므로 양쪽 다)
const INK = '#2B2A28';
const ACCENT = '#D9512C'; // 노선을 모를 때(직선거리 대체 등) 선 색
export const LABEL_GAP_PX = 40; // 이름표 사이가 이만큼 안 떨어지면 환승 글씨를 숨긴다
export const LABEL_SIDE_RADIUS_PX = 60; // 이름표를 위/아래 어느 쪽에 둘지 볼 때 세는 경로 점의 거리

const hasCoords = (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng);
const samePlace = (a, b) => a.lat === b.lat && a.lng === b.lng;
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

/** 노선 색(호선 동그라미와 같은 색). 노선을 모르면 주황(앱 강조색). */
export function lineColor(line) {
  return line == null ? ACCENT : lineBadge(line).background;
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
  return points.filter((p, i) => i === 0 || !samePlace(p, points[i - 1]));
}

/**
 * 구간(탄 노선)별 경로선 (#74). 구간마다 { line, color, points } — points는 승차역 → 서는 역(via) → 하차역.
 * 앞 구간의 끝과 다음 구간의 시작이 같은 역(환승역)이라 선이 이어진다. 좌표 없는 역은 빼고, 같은 좌표가 이어지면 하나로.
 * 구간이 없으면(직선거리 대체 등) 출발 → 도착 한 구간(노선 없음).
 * @param {{from: Station, to: Station, steps?: Array<{line, from?: Station, to?: Station, via?: Station[]}>}} route
 * @returns {Array<{line: string|null, color: string, points: Station[]}>|null} 출발·도착 좌표가 없으면 null
 */
export function routeSegments({ from, to, steps = [] }) {
  if (!hasCoords(from) || !hasCoords(to)) return null;
  const segments = [];
  let cursor = from;
  for (const s of steps) {
    const raw = (s?.via?.length ? s.via : [s?.from, s?.to]).filter(hasCoords);
    const points = [cursor, ...raw].filter((p, i, arr) => i === 0 || !samePlace(p, arr[i - 1]));
    if (points.length < 2) continue;
    segments.push({ line: s.line ?? null, color: lineColor(s.line), points });
    cursor = points[points.length - 1];
  }
  if (!segments.length) return samePlace(from, to) ? [] : [{ line: null, color: ACCENT, points: [from, to] }];
  const last = segments[segments.length - 1];
  if (!samePlace(last.points[last.points.length - 1], to)) last.points.push(to); // 마지막 구간은 만남 역에서 끝난다
  return segments;
}

/**
 * 출발·환승·도착 역 목록 (#74). 환승역 = 두 번째 구간부터의 첫 점. color는 그 역에서 타는 노선 색(도착은 내린 노선 색).
 * @returns {Array<{kind: 'from'|'transfer'|'to', station: Station, color: string}>}
 */
export function routeStops(segments) {
  if (!segments?.length) return [];
  const first = segments[0], last = segments[segments.length - 1];
  return [
    { kind: 'from', station: first.points[0], color: first.color },
    ...segments.slice(1).map((seg) => ({ kind: 'transfer', station: seg.points[0], color: seg.color })),
    { kind: 'to', station: last.points[last.points.length - 1], color: last.color },
  ];
}

/**
 * 이름표를 점 위에 둘지 아래에 둘지 (#74). 점에서 radius(px) 안에 있는 경로 점을 세어 선이 적은 쪽에 둔다(같으면 위).
 * 바로 옆 역만 보면 선이 꺾여 돌아오는 경우(수인분당 서현 → 정자 → 신분당 북쪽)에 이름표가 선 위에 놓여서, 주변 점을 모두 센다.
 * @param {{x: number, y: number}} stop 점의 화면 좌표(아래로 갈수록 y가 큼)
 * @param {Array<{x: number, y: number}|undefined>} points 경로의 모든 점(화면 좌표)
 * @returns {'above'|'below'}
 */
export function labelSide(stop, points = [], radius = LABEL_SIDE_RADIUS_PX) {
  let above = 0, below = 0;
  for (const p of points) {
    if (!p) continue;
    const d = Math.hypot(p.x - stop.x, p.y - stop.y);
    if (d === 0 || d > radius) continue;
    if (p.y < stop.y) above += 1; else below += 1;
  }
  return above > below ? 'below' : 'above';
}

/**
 * 이름표를 보일지 (#74). 출발·도착은 항상, 환승은 앞서 보이기로 한 이름표와 gap(px)보다 가까우면 숨긴다(점만 남는다).
 * @param {Array<{kind: string, x: number, y: number}>} stops 화면 픽셀 좌표
 * @returns {boolean[]}
 */
export function visibleLabels(stops, gap = LABEL_GAP_PX) {
  const shown = stops.filter((s) => s.kind !== 'transfer'); // 출발·도착 이름표는 항상 보인다
  return stops.map((stop) => {
    if (stop.kind !== 'transfer') return true;
    const near = shown.some((o) => o !== stop && Math.hypot(o.x - stop.x, o.y - stop.y) < gap);
    if (!near) shown.push(stop);
    return !near;
  });
}

/** 위경도를 약도 좌표로. 한 축의 폭이 0이면 가운데에 둔다. */
function projector(points) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const innerW = W - PAD.left - PAD.right, innerH = H - PAD.top - PAD.bottom;
  const x = (lng) => (maxLng === minLng ? W / 2 : PAD.left + ((lng - minLng) / (maxLng - minLng)) * innerW);
  const y = (lat) => (maxLat === minLat ? H / 2 : PAD.top + ((maxLat - lat) / (maxLat - minLat)) * innerH);
  return (p) => [Math.round(x(p.lng) * 10) / 10, Math.round(y(p.lat) * 10) / 10];
}

const svgText = (x, y, text, { size = 13, fill = '#C2441F', anchor = 'middle' } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="700" fill="${fill}" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round" font-family="Noto Sans KR, sans-serif">${escapeXml(text)}</text>`;

/**
 * 출발역·만남 장소 표시 + 경로선(steps의 역 좌표를 직선으로 연결). FUNC-015
 * 구간마다 노선 색 실선(흰 테두리), 출발·환승·도착 점과 이름표 (#74).
 * @param {HTMLElement} container 지도를 넣을 자리
 * @param {{from: Station, to: Station, steps: Array<{line, from: Station, to: Station, minutes, via?: Station[]}>}} route
 * @returns {boolean} 그리지 못하면 false (화면은 '카카오맵에서 보기' 링크로 대신한다)
 */
export function drawRoute(container, { from, to, steps }) {
  const segments = routeSegments({ from, to, steps });
  if (!container || !segments?.length) return false;
  const all = segments.flatMap((s) => s.points);
  const project = projector(all);
  const stops = routeStops(segments);
  const shown = visibleLabels(stops.map((s) => { const [x, y] = project(s.station); return { kind: s.kind, x, y }; }));

  const lines = segments.map((seg) => {
    const pts = seg.points.map((p) => project(p).join(',')).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<polyline points="${pts}" fill="none" stroke="${seg.color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  // 중간에 서는 역(출발·환승·도착 제외)은 작은 점
  const stopKeys = new Set(stops.map((s) => `${s.station.lat},${s.station.lng}`));
  const via = all.filter((p, i) => i === 0 || !samePlace(p, all[i - 1]))
    .filter((p) => !stopKeys.has(`${p.lat},${p.lng}`))
    .map((p) => { const [x, y] = project(p); return `<circle cx="${x}" cy="${y}" r="3" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`; }).join('');
  const allPx = all.map((p) => { const [x, y] = project(p); return { x, y }; });
  const marks = stops.map((s, i) => {
    const [x, y] = project(s.station);
    const side = labelSide({ x, y }, allPx);
    const textY = (up, down) => (side === 'below' ? Math.min(y + down, H - 4) : Math.max(y - up, 14));
    if (s.kind === 'from') {
      return `<circle cx="${x}" cy="${y}" r="7" fill="${s.color}" stroke="#fff" stroke-width="3"/>` + svgText(x, textY(14, 24), t('route.mapFrom'));
    }
    if (s.kind === 'to') {
      return `<circle cx="${x}" cy="${y}" r="8" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3.5" fill="${s.color}"/>`
        + svgText(x, textY(15, 25), t('route.mapTo'));
    }
    return `<circle cx="${x}" cy="${y}" r="6" fill="#fff" stroke="${s.color}" stroke-width="3"/>`
      + (shown[i] ? svgText(x, textY(12, 20), t('route.mapTransfer', { name: s.station.name }), { size: 11, fill: '#555' }) : '');
  }).join('');
  const label = escapeXml(t('route.mapLabel', { from: from.name, to: to.name }));
  container.innerHTML = `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
    <rect width="${W}" height="${H}" fill="#F9F6F1"/>
    <path d="M-10 70 C 60 50, 90 105, 160 98 S 260 60, 330 72" fill="none" stroke="#CFC4B8" stroke-width="1.5"/>
    <path d="M-10 112 C 70 100, 110 140, 180 132 S 280 100, 330 108" fill="none" stroke="#CFC4B8" stroke-width="1.5"/>
    ${lines}${via}${marks}
  </svg>`;
  loadMapSdk().then((ok) => {
    if (ok && container.isConnected) drawKakaoRoute(container, { segments, from, to });
  }).catch(() => {});
  return true;
}

/** 카카오 지도 위의 점(출발·환승·도착)과 이름표. 점은 흰 원에 노선색 테두리(출발은 노선색 채움, 도착은 검정 채움). */
function overlay(maps, station, content, { xAnchor = 0.5, yAnchor = 0.5, zIndex = 3 } = {}) {
  return new maps.CustomOverlay({ position: new maps.LatLng(station.lat, station.lng), content, xAnchor, yAnchor, zIndex });
}

/**
 * SVG 약도 자리를 카카오 지도로 바꾼다. 구간마다 노선 색 선(흰 테두리) + 출발·환승·도착 점과 이름표.
 * 지도는 움직이지 않게 고정해 화면 세로 스크롤을 방해하지 않는다. 실패하면 SVG 약도를 그대로 둔다.
 */
function drawKakaoRoute(container, { segments, from, to }) {
  const { maps } = globalThis.window.kakao;
  const svg = [...container.childNodes];
  const box = document.createElement('div');
  box.className = 'kmap';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', t('route.mapLabel', { from: from.name, to: to.name }));
  try {
    container.replaceChildren(box);
    const map = new maps.Map(box, {
      center: new maps.LatLng(to.lat, to.lng), level: 7,
      draggable: false, scrollwheel: false, disableDoubleClick: true, disableDoubleClickZoom: true, keyboardShortcuts: false,
    });
    const bounds = new maps.LatLngBounds();
    for (const seg of segments) {
      const path = seg.points.map((p) => new maps.LatLng(p.lat, p.lng));
      path.forEach((p) => bounds.extend(p));
      new maps.Polyline({ map, path, strokeWeight: 10, strokeColor: '#ffffff', strokeOpacity: 0.95, strokeStyle: 'solid', zIndex: 1 });
      new maps.Polyline({ map, path, strokeWeight: 6, strokeColor: seg.color, strokeOpacity: 1, strokeStyle: 'solid', zIndex: 2 });
    }
    const stops = routeStops(segments);
    const texts = { from: t('route.mapFrom'), to: t('route.mapTo') };
    for (const s of stops) {
      const fill = s.kind === 'from' ? s.color : s.kind === 'to' ? INK : '#fff';
      overlay(maps, s.station, `<div class="kmap-dot ${s.kind}" style="border-color:${s.kind === 'transfer' ? s.color : '#fff'};background:${fill}"></div>`, { zIndex: 3 }).setMap(map);
    }
    map.relayout(); // 자리가 막 생겼을 수 있어 크기를 다시 재게 한다
    map.setBounds(bounds, 48, 32, 48, 32); // 위·아래 여백은 이름표 자리(선 반대쪽에 붙으므로 양쪽 다)
    const proj = map.getProjection();
    const toPx = (st) => { const p = proj.containerPointFromCoords(new maps.LatLng(st.lat, st.lng)); return { x: p.x, y: p.y }; };
    const allPx = segments.flatMap((seg) => seg.points).map(toPx);
    const px = stops.map((s) => ({ kind: s.kind, ...toPx(s.station) }));
    const shown = visibleLabels(px);
    stops.forEach((s, i) => {
      if (!shown[i]) return;
      const text = s.kind === 'transfer' ? t('route.mapTransfer', { name: s.station.name }) : texts[s.kind];
      const content = `<div class="kmap-label ${s.kind}" style="border-color:${s.color}">${escapeXml(text)}</div>`;
      // 선이 점에서 위로 뻗으면 이름표를 아래에, 아니면 위에 (선과 겹치지 않게)
      const side = labelSide(px[i], allPx);
      overlay(maps, s.station, content, { yAnchor: side === 'below' ? -0.5 : 1.5, zIndex: s.kind === 'transfer' ? 4 : 5 }).setMap(map);
    });
  } catch (e) {
    console.warn('카카오 지도를 그리지 못해 약도를 보여줍니다', e);
    container.replaceChildren(...svg);
  }
}

/** 참여자 출발역들과 추천 역 표시. FUNC-018 */
export function drawStations(container, { origins, station }) {
  throw new Error('아직 구현되지 않았습니다');
}
