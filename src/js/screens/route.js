// ⑤ 개인 경로 (개발 A) — FUNC-015, FUNC-025
// 닉네임 목록에서 본인 선택 → 총 소요시간·환승·구간 정보·권장 출발 시각·만남 장소·지도.
// 문구는 lib/data.js의 t()로 읽는다. 화면 모양은 '모이자 UI 프로토타입2'의 '나의 경로'(vRoutes): 참여자별로 펼치는 칸.
//
// params 두 가지 (둘 중 하나):
//   ① 확정 화면(confirm.js) '나의 경로 확인하기' → { confirmation: MeetingConfirmation, room_id? }
//   ② 확정된 방 링크(join.js) → { room_id, room: { status:'확정', confirmation, participants: RoomParticipant[] } }
// MeetingConfirmation에는 participant_id가 없다(FUNC-012). 방이 있으면 이 기기의 participant_id → 방 명단의 닉네임으로
// 본인을 찾아 자동으로 펼치고, 없으면 사용자가 목록에서 고른다.
// 경로는 FUNC-006과 같은 그래프 계산(transit.travelTime)으로 다시 구한다. 서버 조회·캐시는 없다.
// 그래프가 없거나 결과가 예상값이면 확정 때 저장된 분(people[].m)만 보여주고 '예상'을 강조한다.

import { loadData, t } from '../lib/data.js';
import { travelTime } from '../lib/transit.js';
import { departureAdvice } from '../lib/departure.js';
import { placeLink } from '../lib/places.js';
import { drawRoute } from '../lib/map.js';
import { lineBadge, rareServiceNotices } from '../lib/stations.js';
import { getParticipantId } from '../lib/storage.js';
import { createShell, el } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';

const ARROW_SVG = '<svg viewBox="0 0 46 10" aria-hidden="true"><path d="M1 5h42M38 1l5 4-5 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

const pad = (n) => String(n).padStart(2, '0');

/** 역 찾기: id → 이름 순. 못 찾으면 이름만 있는 역(좌표 없음 → 지도 대신 링크). */
function resolveStation(value, stationsById) {
  if (value && typeof value === 'object') return value;
  const byId = stationsById[value];
  if (byId) return byId;
  const byName = Object.values(stationsById).find((s) => s.name === value);
  return byName ?? { id: String(value ?? ''), name: String(value ?? ''), lines: [] };
}

/** 장소 '보기' 링크. places.js 구현 전에는 kakao_url → 카카오맵 '역 이름 + 장소명' 검색 (confirm.js와 같은 규칙). */
function linkFor(place, stationName) {
  try {
    return placeLink(place);
  } catch {
    return place.kakao_url || `https://map.kakao.com/link/search/${encodeURIComponent(`${stationName} ${place.name}`)}`;
  }
}

/** 급행이 다니는 노선(그래프 routes에 급행 계통이 있는 호선)이면 구간에 'express'/'local'. 급행이 없는 노선은 null(표시 안 함). */
function trainKind(step, expressLines) {
  if (step.express) return 'express';
  return expressLines.has(step.line) ? 'local' : null;
}

/** 카카오맵에서 만남 역까지 길찾기(지도를 그리지 못했을 때). 좌표가 없으면 역 이름 검색. */
export function kakaoMapLink(to) {
  if (Number.isFinite(to?.lat) && Number.isFinite(to?.lng)) {
    return `https://map.kakao.com/link/to/${encodeURIComponent(`${to.name}역`)},${to.lat},${to.lng}`;
  }
  return `https://map.kakao.com/link/search/${encodeURIComponent(`${to?.name ?? ''}역`)}`;
}

/**
 * 한 참여자의 경로 정보 RouteInfo를 만든다. 계산 함수는 바꿔 끼울 수 있다(테스트용).
 * @param {MeetingConfirmation} confirmation
 * @param {string} nickname people[].n
 * @param {{stationsById, graph, places, now, travel, advise, link}} options
 * @returns {null | {
 *   nickname, from: Station, to: Station, same_station: boolean,
 *   minutes: number, transfers: number|null, steps: Array<{line, train: 'express'|'local'|null, from: Station, to: Station, minutes}>,
 *   is_estimated: boolean, departure: {depart_at: Date, summary: string, is_past: boolean}|null,
 *   place: {name, url}|null
 * }} 명단에 없는 닉네임이면 null
 */
export function buildRouteInfo(confirmation, nickname, {
  stationsById = {}, graph = null, places = [], now = new Date(),
  travel = travelTime, advise = departureAdvice, link = linkFor,
} = {}) {
  const person = confirmation?.people?.find((p) => p.n === nickname);
  if (!person) return null;
  const from = resolveStation(person.s, stationsById);
  const to = resolveStation(confirmation.s, stationsById);
  const sameStation = from.id === to.id;

  let route = null;
  if (!sameStation) {
    try {
      route = travel(graph, from, to);
    } catch {
      route = null; // 그래프 계산(#25) 전이거나 실패 → 확정 때 저장된 분
    }
  }
  const computed = !sameStation && Number.isFinite(route?.minutes) && !route.is_estimated;
  const minutes = sameStation ? 0 : (computed ? route.minutes : person.m);
  const expressLines = new Set((graph?.routes ?? []).filter((r) => r.express).map((r) => r.line));
  const steps = computed
    ? (route.steps ?? []).map((s) => ({
      line: s.line, train: trainKind(s, expressLines),
      from: resolveStation(s.from, stationsById), to: resolveStation(s.to, stationsById), minutes: s.minutes,
    }))
    : [];

  let departure = null;
  try {
    const advice = advise(new Date(confirmation.a), minutes, steps, now);
    if (advice?.depart_at instanceof Date && !Number.isNaN(advice.depart_at.getTime())) departure = advice;
  } catch {
    departure = null; // 권장 출발 시각(#22) 구현 전 → 그 줄을 숨긴다
  }

  return {
    nickname: person.n,
    from,
    to,
    same_station: sameStation,
    minutes,
    transfers: sameStation ? 0 : (computed ? (route.transfers ?? 0) : null),
    steps,
    is_estimated: !sameStation && !computed,
    departure,
    place: meetingPlace(confirmation, places, to.name, link),
  };
}

/** 확정된 만남 장소 {name, url}. 장소 데이터에서 찾지 못하면 null (그 줄을 숨긴다). */
export function meetingPlace(confirmation, places = [], stationName = '', link = linkFor) {
  const place = places.find((p) => p.place_id === confirmation?.pl);
  return place ? { name: place.name, url: link(place, stationName) } : null;
}

/** 방 명단에서 이 기기의 참여자 닉네임을 찾는다(각자 입력 FUNC-022의 id 규칙: pid, pid_2…). */
export function myNickname(room, deviceId) {
  if (!deviceId || !Array.isArray(room?.participants)) return null;
  const mine = room.participants.find((p) => p.participant_id === deviceId || p.participant_id?.startsWith(`${deviceId}_`));
  return mine?.nickname ?? null;
}

function formatArrival(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return t('confirm.arrival', {
    month: d.getMonth() + 1, day: d.getDate(), weekday: t('confirm.weekdays').charAt(d.getDay()),
    hour: pad(d.getHours()), minute: pad(d.getMinutes()),
  });
}

function badgeNode(line) {
  const { label, background, color } = lineBadge(line);
  return el('span', {
    className: label.length > 1 ? 'badge two' : 'badge', textContent: label, title: `${line}`,
    style: `background:${background};color:${color}`,
  });
}

/** 호선 동그라미 옆 '급행'/'일반' 꼬리표. 급행이 없는 노선이면 없음. */
function trainNodes(train) {
  return train ? [el('span', { className: `train ${train}`, textContent: t(`route.${train}`) })] : [];
}

function stationLabel(station) {
  return t('confirm.station', { name: station.name });
}

/** '만남 장소 | 이름 | 보기' 줄. 화면 위쪽(도착 역 아래)과 펼친 칸 안에 쓴다. */
function placeNode(place, className = 'route-place') {
  return el('div', { className }, [
    el('span', { className: 'k', textContent: t('route.place') }),
    el('span', { className: 'v', textContent: place.name }),
    el('a', { className: 'view', href: place.url, target: '_blank', rel: 'noopener', textContent: t('route.view') }),
  ]);
}

/** 펼친 칸의 내용: 지도 → 요약 → 구간 → 권장 출발 시각 → 만남 장소 */
function routeBody(info) {
  const placeRow = info.place ? placeNode(info.place) : null;

  if (info.same_station) {
    return [el('div', { className: 'route' }, [t('route.same')]), ...(placeRow ? [placeRow] : [])];
  }

  const mapBox = el('div', { className: 'map-box' });
  let drawn = false;
  try {
    drawn = drawRoute(mapBox, { from: info.from, to: info.to, steps: info.steps });
  } catch {
    drawn = false;
  }
  if (!drawn) {
    mapBox.replaceChildren(el('a', {
      className: 'map-link', href: kakaoMapLink(info.to), target: '_blank', rel: 'noopener', textContent: t('route.openKakaoMap'),
    }));
  }

  const arrow = el('span', { className: 'arrow', textContent: t('route.minutes', { minutes: info.minutes }) });
  arrow.insertAdjacentHTML('beforeend', ARROW_SVG);
  const meta = [t('route.total', { minutes: info.minutes })];
  if (info.transfers !== null) meta.push(info.transfers ? t('route.transfers', { count: info.transfers }) : t('route.noTransfer'));
  const summary = el('div', { className: 'route' }, [
    stationLabel(info.from), ...(info.steps[0] ? [badgeNode(info.steps[0].line), ...trainNodes(info.steps[0].train)] : []), arrow, stationLabel(info.to),
    el('span', { className: 'meta', textContent: meta.join(' · ') }),
    ...(info.is_estimated ? [el('span', { className: 'est', textContent: t('route.estimated') })] : []),
  ]);

  const stepList = info.steps.length
    ? el('ol', { className: 'steps' }, info.steps.map((s) => el('li', {}, [
      badgeNode(s.line),
      ...trainNodes(s.train),
      el('span', { className: 'seg', textContent: t('route.step', { from: s.from.name, to: s.to.name }) }),
      el('span', { className: 'min', textContent: t('route.minutes', { minutes: s.minutes }) }),
    ])))
    : null;

  let departRow = null;
  if (info.departure) {
    const at = info.departure.depart_at;
    departRow = el('div', { className: info.departure.is_past ? 'depart now' : 'depart' }, [
      info.departure.is_past
        ? t('route.leaveNow')
        : t('route.departAt', { time: `${pad(at.getHours())}:${pad(at.getMinutes())}` }),
    ]);
  }

  const notices = rareServiceNotices([info.from, info.to]).map((text) => el('p', { className: 'notice', textContent: text }));
  return [mapBox, summary, ...notices, ...[stepList, departRow, placeRow].filter(Boolean)];
}

function showMessage(container, text) {
  createShell(container).screen.replaceChildren(el('p', { className: 'lead', textContent: text }));
}

/** 화면을 그린다. @param {HTMLElement} container */
export async function render(container, params = {}) {
  const confirmation = params.confirmation ?? params.room?.confirmation;
  if (!confirmation?.people?.length) return showMessage(container, t('route.noConfirmation'));

  const data = await loadData().catch(() => ({}));
  const stationsById = Object.fromEntries((data.stations ?? []).map((s) => [s.id, s]));
  const options = { stationsById, graph: data.transitGraph ?? null, places: data.places ?? [] };
  const toStation = resolveStation(confirmation.s, stationsById);
  const place = meetingPlace(confirmation, options.places, toStation.name);

  // 방 링크로 왔으면 이 기기의 참여자를 자동으로 펼친다. 명단에 없으면 안내 후 직접 고르게 한다.
  let deviceId = null;
  try { deviceId = params.room ? getParticipantId() : null; } catch { deviceId = null; }
  const mine = myNickname(params.room, deviceId);
  let openName = confirmation.people.some((p) => p.n === mine) ? mine : null;
  const notice = mine && !openName ? t('route.notInList') : '';

  const { screen, foot } = createShell(container);
  const list = el('div', { className: 'routes' });
  screen.replaceChildren(
    el('div', { className: 'eyebrow', textContent: t('route.eyebrow') }),
    el('h2', { className: 'q big', textContent: t('route.title') }),
    el('p', { className: 'lead', textContent: t('route.lead', { station: toStation.name, time: formatArrival(confirmation.a) }) }),
    // 참여자 칸을 펼치지 않아도 만남 장소가 보이게 도착 역 바로 아래에 둔다
    ...(place ? [placeNode(place, 'route-place top')] : []),
    el('p', { className: 'hint', textContent: t('route.timeBasis') }),
    ...(notice ? [el('p', { className: 'error', role: 'alert', textContent: notice })] : []),
    list,
  );
  foot.replaceChildren();

  function draw() {
    list.replaceChildren(...confirmation.people.map((person, i) => {
      const open = person.n === openName;
      const from = resolveStation(person.s, stationsById);
      const head = el('button', {
        type: 'button', className: 'acc-h', ariaExpanded: String(open),
        onclick: () => { openName = open ? null : person.n; draw(); },
      }, [
        el('span', { className: 'nm' }, [
          characterNode(i, open ? 'happy' : 'basic', 34),
          person.n,
          el('span', { className: 'from', textContent: t('route.from', { name: from.name }) }),
        ]),
        el('span', { className: 'tg', textContent: t(open ? 'route.close' : 'route.open') }),
      ]);
      const info = open ? buildRouteInfo(confirmation, person.n, options) : null;
      return el('div', { className: open ? 'acc open' : 'acc' }, [
        head,
        el('div', { className: 'acc-b' }, info ? routeBody(info) : []),
      ]);
    }));
  }

  draw();
}
