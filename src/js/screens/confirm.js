// ④ 확정·카카오톡 공유·링크 복사 (개발 A) — FUNC-012, FUNC-013, FUNC-020(목록에 추가)
// 확정 요약(장소, 참여자별 시간, 권장 출발 시각)과 공유 링크. 카카오톡 공유 + 링크 복사(FUNC-013, #11).
// 문구는 lib/data.js의 t()로 읽는다.
//
// params 두 가지 (둘 중 하나):
//   ① 결과 화면(FUNC-009)에서 장소 '선택'을 눌렀을 때
//      { request: MeetingRequest, selected_result: FairStationResult, place: Place,
//        participants: Participant[], room_id?: 모임 방 id (각자 입력으로 진행했을 때) }
//      → 확정 정보를 만들고, 방이 있으면 방에 저장 후 방 링크, 없거나 실패하면 #d= 링크를 붙인다.
//   ② 이미 만든 확정 정보로 요약만 다시 그릴 때 (공유 링크 열기 FUNC-014 등)
//      { confirmation: MeetingConfirmation }
// 반환값: share_url이 붙은 MeetingConfirmation (실패하면 undefined)

import { loadData, t } from '../lib/data.js';
import { confirmRoom } from '../lib/api-client.js';
import { addMeeting, getHostToken } from '../lib/storage.js';
import { createConfirmation, hashUrl, roomUrl } from '../lib/share-link.js';
import { departureAdvice, BUFFER_MINUTES } from '../lib/departure.js';
import { placeLink } from '../lib/places.js';

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const pad = (n) => String(n).padStart(2, '0');

function formatArrival(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 권장 출발 시각 (FUNC-025). departure.js 구현 전에는 같은 규칙(도착 − 소요 − 여유, 분 단위 내림)으로 계산한다. */
function adviceFor(arrivalTime, minutes, now = new Date()) {
  const arrival = new Date(arrivalTime);
  try {
    return departureAdvice(arrival, minutes, [], now);
  } catch {
    const departAt = new Date(arrival.getTime() - (minutes + BUFFER_MINUTES) * 60000);
    departAt.setSeconds(0, 0);
    return { depart_at: departAt, summary: '', is_past: departAt.getTime() < now.getTime() };
  }
}

/** 장소 '보기' 링크 (FUNC-011). places.js 구현 전에는 kakao_url → 카카오맵 장소명 검색. */
function linkFor(place) {
  try {
    return placeLink(place);
  } catch {
    return place.kakao_url || `https://map.kakao.com/?q=${encodeURIComponent(place.name)}`;
  }
}

function drawSummary(container, confirmation, { stations, places, notice = '' }) {
  const station = stations.find((s) => s.id === confirmation.s);
  const stationName = (id) => stations.find((s) => s.id === id)?.name ?? id;
  const place = places.find((p) => p.place_id === confirmation.pl);

  const placeRow = el('p', {}, [el('strong', { textContent: `${station?.name ?? confirmation.s} · ${place?.name ?? confirmation.pl}` })]);
  if (place) {
    placeRow.append(' ', el('a', { href: linkFor(place), target: '_blank', rel: 'noopener', textContent: t('confirm.view') }));
  }

  const people = confirmation.people.map((person) => {
    const advice = adviceFor(confirmation.a, person.m);
    const departText = advice.is_past
      ? t('route.leaveNow')
      : t('confirm.depart', { time: `${pad(advice.depart_at.getHours())}:${pad(advice.depart_at.getMinutes())}` });
    return el('div', { className: 'prow other' }, [
      el('div', { className: 'prow-name', textContent: person.n }),
      el('div', { className: 'prow-station confirm-person' }, [
        el('span', { textContent: t('confirm.person', { station: stationName(person.s), minutes: person.m }) }),
        el('span', { className: 'hint', textContent: departText }),
      ]),
    ]);
  });

  const linkInput = el('input', {
    type: 'text', readOnly: true, value: confirmation.share_url ?? '', className: 'share-link',
    ariaLabel: t('confirm.link'), onfocus: () => linkInput.select(),
  });

  container.replaceChildren(
    el('h2', { textContent: t('confirm.title') }),
    el('p', { className: 'meta', textContent: t('confirm.place') }),
    placeRow,
    el('p', { className: 'meta', textContent: t('confirm.arrival', { time: formatArrival(confirmation.a) }) }),
    el('h3', { textContent: t('confirm.people') }),
    el('div', { className: 'prows' }, people),
    el('p', { className: 'hint', textContent: t('result.timeBasis') }),
    el('h3', { textContent: t('confirm.link') }),
    linkInput,
    el('p', { className: 'hint', textContent: t('confirm.linkHint') }),
    ...(notice ? [el('p', { className: 'error', role: 'alert', textContent: notice })] : []),
    // TODO(FUNC-013, #11): 카카오톡 공유·링크 복사 버튼
  );
}

/** 화면을 그린다. @param {HTMLElement} container */
export async function render(container, params = {}) {
  const data = await loadData().catch(() => ({}));
  const stations = data.stations ?? [];
  const places = data.places ?? [];

  if (params.confirmation) {
    drawSummary(container, params.confirmation, { stations, places });
    return params.confirmation;
  }

  const { request, selected_result: selectedResult, place, participants, room_id: roomId } = params;
  if (!place) return container.replaceChildren(el('p', { className: 'error', textContent: t('confirm.noPlace') }));
  container.replaceChildren(el('p', { className: 'meta', textContent: t('confirm.saving') }));

  let confirmation;
  try {
    confirmation = createConfirmation(request, selectedResult, place, participants);
  } catch (e) {
    console.warn('확정 정보를 만들지 못했습니다', e);
    return container.replaceChildren(el('p', { className: 'error', role: 'alert', textContent: t('confirm.failed') }));
  }

  // 저장소가 있으면 방에 저장하고 방 링크를 그대로 공유 링크로 쓴다. 없거나 실패하면 #d= 링크 (SFR-015, NFR-011).
  let notice = '';
  const hostToken = roomId ? getHostToken(roomId) : null;
  if (roomId && hostToken) {
    const saved = await confirmRoom(roomId, confirmation, hostToken);
    if (saved.error) notice = t('confirm.roomSaveFailed');
    else confirmation = { ...confirmation, share_url: roomUrl(roomId) };
  }
  if (!confirmation.share_url) confirmation = { ...confirmation, share_url: hashUrl(confirmation) };

  try {
    addMeeting(confirmation); // FUNC-020 내 모임 목록
  } catch { /* FUNC-020(#18) 구현 전 */ }

  drawSummary(container, confirmation, { stations, places: [place, ...places], notice });
  return confirmation;
}
