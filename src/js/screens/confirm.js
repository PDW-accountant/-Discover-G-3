// ④ 약속 확정 (개발 A) — FUNC-012, FUNC-013, FUNC-020(목록에 추가)
// 모이자 UI 프로토타입2의 '약속 확정'(vDone) 화면: 웃는 캐릭터 → '일정이 확정되었어요' → 확정 티켓(역·가게명·시간·목적·인원)
// → 아래 고정 버튼 '나의 경로 확인하기'. 참여자별 소요시간·권장 출발 시각은 개인 경로 화면(route.js, FUNC-015)에서 보여준다.
// 공유 링크(share_url)는 화면에 그리지 않고 카카오톡 공유·링크 복사(FUNC-013, #11)에서 쓴다.
// 문구는 lib/data.js의 t()로 읽는다.
//
// params 두 가지 (둘 중 하나):
//   ① 결과 화면(FUNC-009)에서 장소 '선택'을 눌렀을 때
//      { request: MeetingRequest, selected_result: FairStationResult, place: Place,
//        participants: Participant[], room_id?: 모임 방 id (각자 입력으로 진행했을 때) }
//      → 확정 정보를 만들고, 방이 있으면 방에 저장 후 방 링크, 없거나 실패하면 #d= 링크를 붙인다.
//   ② 이미 만든 확정 정보로 다시 그릴 때 (공유 링크 열기 FUNC-014 등)
//      { confirmation: MeetingConfirmation, room_id? }
// 반환값: share_url이 붙은 MeetingConfirmation (실패하면 undefined)
// '나의 경로 확인하기' → route.js render(container, { confirmation, room_id })

import { loadData, t } from '../lib/data.js';
import { confirmRoom } from '../lib/api-client.js';
import { addMeeting, getHostToken } from '../lib/storage.js';
import { createConfirmation, hashUrl, roomUrl } from '../lib/share-link.js';
import { placeLink } from '../lib/places.js';
import { createShell, el } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';
import { render as renderRoute } from './route.js';

const KAKAO_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.7L5.5 21l4-2.6c.8.1 1.6.2 2.5.2 5.5 0 10-3.6 10-8S17.5 3 12 3z" fill="#FFE812" stroke="#000" stroke-width="1.8"/></svg>';
const ARROW_SVG = '<svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><path d="M1 7h16M12 2l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const pad = (n) => String(n).padStart(2, '0');

function formatArrival(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return t('confirm.arrival', {
    month: d.getMonth() + 1, day: d.getDate(), weekday: t('confirm.weekdays').charAt(d.getDay()),
    hour: pad(d.getHours()), minute: pad(d.getMinutes()),
  });
}

/** 줄바꿈(\n)이 든 문구를 <br>로 나눈 자식 목록으로 만든다. */
function lines(text) {
  return text.split('\n').flatMap((line, i) => (i ? [el('br'), line] : [line]));
}

/** 가게명 링크 (FUNC-011). places.js 구현 전에는 kakao_url → 카카오맵 '역 이름 + 장소명' 검색. */
function linkFor(place, stationName) {
  try {
    return placeLink(place);
  } catch {
    return place.kakao_url || `https://map.kakao.com/link/search/${encodeURIComponent(`${stationName} ${place.name}`)}`;
  }
}

/** 안내 문구 한 줄만 있는 화면 */
function showMessage(container, text, className = 'lead') {
  const props = className === 'error' ? { className, role: 'alert', textContent: text } : { className, textContent: text };
  createShell(container).screen.replaceChildren(el('p', props));
}

/** 경로 화면을 연다. 아직 없거나 실패하면 안내 문구만 보여준다. */
function openRoute(container, params) {
  const fallback = () => showMessage(container, t('confirm.routeNotReady'));
  try {
    Promise.resolve(renderRoute(container, params)).catch(fallback);
  } catch {
    fallback();
  }
}

function drawSummary(container, confirmation, { stations, places, roomId, notice = '' }) {
  const stationName = stations.find((s) => s.id === confirmation.s)?.name ?? confirmation.s;
  const place = places.find((p) => p.place_id === confirmation.pl);
  const placeName = place
    ? el('a', { href: linkFor(place, stationName), target: '_blank', rel: 'noopener', textContent: place.name })
    : confirmation.pl;

  const sub = el('p', { className: 'done-sub' }, [t('confirm.shareHint')]);
  sub.insertAdjacentHTML('afterbegin', KAKAO_SVG);

  const { screen, foot } = createShell(container);
  screen.replaceChildren(el('div', { className: 'done-wrap' }, [
    el('div', { className: 'crew' }, confirmation.people.slice(0, 5).map((_, i) => characterNode(i, 'happy', 64))),
    el('p', { className: 'done-msg' }, lines(t('confirm.title'))),
    sub,
    el('div', { className: 'ticket' }, [
      el('div', { className: 'ticket-top' }, [
        el('div', { className: 'eyebrow', textContent: t('confirm.ticket') }),
        el('div', { className: 'st', textContent: t('confirm.station', { name: stationName }) }),
        el('div', { className: 'pl' }, [placeName]),
      ]),
      el('dl', { className: 'ticket-bot' }, [
        el('dt', { textContent: t('confirm.time') }), el('dd', { textContent: formatArrival(confirmation.a) }),
        el('dt', { textContent: t('confirm.purpose') }), el('dd', { textContent: t(`meeting.purpose.${confirmation.p}`) }),
        el('dt', { textContent: t('confirm.people') }), el('dd', { textContent: confirmation.people.map((p) => p.n).join(', ') }),
      ]),
    ]),
    ...(notice ? [el('p', { className: 'error', role: 'alert', textContent: notice })] : []),
    // TODO(FUNC-013, #11): 카카오톡 공유·링크 복사 버튼 (confirmation.share_url 사용)
  ]));

  const routeButton = el('button', {
    type: 'button', className: 'btn',
    onclick: () => openRoute(container, { confirmation, room_id: roomId }),
  }, [t('confirm.myRoute')]);
  routeButton.insertAdjacentHTML('beforeend', ARROW_SVG);
  foot.replaceChildren(routeButton);
}

/** 화면을 그린다. @param {HTMLElement} container */
export async function render(container, params = {}) {
  const data = await loadData().catch(() => ({}));
  const stations = data.stations ?? [];
  const places = data.places ?? [];

  if (params.confirmation) {
    drawSummary(container, params.confirmation, { stations, places, roomId: params.room_id });
    return params.confirmation;
  }

  const { request, selected_result: selectedResult, place, participants, room_id: roomId } = params;
  if (!place) return showMessage(container, t('confirm.noPlace'), 'error');
  showMessage(container, t('confirm.saving'));

  let confirmation;
  try {
    confirmation = createConfirmation(request, selectedResult, place, participants);
  } catch (e) {
    console.warn('확정 정보를 만들지 못했습니다', e);
    return showMessage(container, t('confirm.failed'), 'error');
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

  drawSummary(container, confirmation, {
    stations, places: [place, ...places], roomId: confirmation.share_url.includes('?room=') ? roomId : undefined, notice,
  });
  return confirmation;
}
