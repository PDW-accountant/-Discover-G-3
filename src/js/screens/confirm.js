// ④ 약속 확정 (개발 A) — FUNC-012, FUNC-013, FUNC-020(목록에 추가)
// 모이자 UI 프로토타입2의 '약속 확정'(vDone) 화면: 웃는 캐릭터 → '일정이 확정되었어요' → 확정 티켓(역·가게명·시간·목적·인원)
// → 아래 고정 버튼 '나의 경로 확인하기'. 참여자별 소요시간·권장 출발 시각은 개인 경로 화면(route.js, FUNC-015)에서 보여준다.
// 공유 링크(share_url)는 화면에 그리지 않고 아래 '카카오톡으로 보내기'·'링크 복사' 버튼(FUNC-013)에서 쓴다.
// 카카오 JS 키가 없으면 카카오 버튼을 숨기고 링크 복사만 보여준다. 복사가 막히면 링크를 선택 가능한 칸으로 보여준다.
// 티켓 아래 '내 캘린더에 추가'(#75, 총무용): 가장 오래 걸리는 참여자의 권장 출발 시각 기준으로 알림(당일 자정·출발 1시간 전).
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
import { addMeeting, clearDraft, getHostToken } from '../lib/storage.js';
import { createConfirmation, hashUrl, roomUrl } from '../lib/share-link.js';
import { placeLink } from '../lib/places.js';
import { buildShareMessage, canShareKakao, copyLink, formatMeetingTime, shareKakao } from '../lib/share.js';
import { departureAdvice } from '../lib/departure.js';
import { calendarControls } from '../lib/calendar.js';
import { createShell, el, go } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';
import { render as renderRoute } from './route.js';

const KAKAO_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.7L5.5 21l4-2.6c.8.1 1.6.2 2.5.2 5.5 0 10-3.6 10-8S17.5 3 12 3z" fill="#FFE812" stroke="#000" stroke-width="1.8"/></svg>';
const ARROW_SVG = '<svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><path d="M1 7h16M12 2l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

/** 총무용 캘린더 등록 칸(#75): 가장 오래 걸리는 사람의 권장 출발 시각(도착 − 소요 − 여유 10분) 기준 */
function hostCalendar(confirmation, stationName, placeName) {
  const slowest = Math.max(...confirmation.people.map((p) => p.m));
  let departAt;
  try {
    departAt = departureAdvice(new Date(confirmation.a), slowest).depart_at;
  } catch {
    return null;
  }
  return calendarControls({ arrival: confirmation.a, station: stationName, place: placeName, url: confirmation.share_url, departAt, minutes: slowest });
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
    // 경로에서 뒤로 돌아오면(#44) 이미 만든 확정 정보({ confirmation, room_id })로 다시 그린다 — 방 저장을 되풀이하지 않는다
    // 방 없이 확정했으면 주소를 공유 링크(#d=)로 바꿔 둔다 → 새로고침해도 경로 화면이 다시 열린다(방 링크 ?room= 은 이미 주소가 그렇다)
    const url = params.confirmation?.share_url?.includes('#d=') ? params.confirmation.share_url : undefined;
    Promise.resolve(go(renderRoute, container, params, { back: params, url })).catch(fallback);
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

  const kakaoReady = canShareKakao();
  const sub = el('p', { className: 'done-sub' }, [t(kakaoReady ? 'confirm.shareHint' : 'share.copyHint')]);
  if (kakaoReady) sub.insertAdjacentHTML('afterbegin', KAKAO_SVG);
  const copyBox = el('div'); // 복사가 막혔을 때 링크 칸을 넣는 자리

  const { screen, foot, toast } = createShell(container);
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
        el('dt', { textContent: t('confirm.time') }), el('dd', { textContent: formatMeetingTime(confirmation.a) }),
        el('dt', { textContent: t('confirm.purpose') }), el('dd', { textContent: t(`meeting.purpose.${confirmation.p}`) }),
        el('dt', { textContent: t('confirm.people') }), el('dd', { textContent: confirmation.people.map((p) => p.n).join(', ') }),
      ]),
    ]),
    ...(notice ? [el('p', { className: 'error', role: 'alert', textContent: notice })] : []),
    ...[hostCalendar(confirmation, stationName, place?.name)].filter(Boolean),
    copyBox,
  ]));

  // FUNC-013 카카오톡 공유·링크 복사
  const message = buildShareMessage(confirmation, { stationName, placeName: place?.name });
  async function onCopy() {
    if (await copyLink(confirmation.share_url)) return toast(t('share.copied'));
    const input = el('input', { type: 'text', readOnly: true, value: confirmation.share_url, ariaLabel: t('share.copyLink') });
    input.addEventListener('focus', () => input.select());
    copyBox.replaceChildren(el('div', { className: 'link-box' }, [
      el('p', { className: 'lead', role: 'alert', textContent: t('share.copyFailed') }),
      input,
    ]));
    input.focus();
  }
  const copyButton = el('button', { type: 'button', className: 'btn ghost sm', textContent: t('share.copyLink'), onclick: onCopy });
  const shareRow = [copyButton];
  if (kakaoReady) {
    const kakaoButton = el('button', { type: 'button', className: 'btn ghost sm', textContent: t('share.kakao') });
    kakaoButton.insertAdjacentHTML('afterbegin', KAKAO_SVG);
    kakaoButton.onclick = async () => {
      kakaoButton.disabled = true;
      const opened = await shareKakao(message);
      kakaoButton.disabled = false;
      if (!opened) toast(t('share.kakaoFailed'));
    };
    shareRow.unshift(kakaoButton);
  }

  const routeButton = el('button', {
    type: 'button', className: 'btn',
    onclick: () => openRoute(container, { confirmation, room_id: roomId }),
  }, [t('confirm.myRoute')]);
  routeButton.insertAdjacentHTML('beforeend', ARROW_SVG);
  foot.replaceChildren(shareRow.length > 1 ? el('div', { className: 'row2' }, shareRow) : copyButton, routeButton);
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
  const saving = createShell(container);
  saving.screen.replaceChildren(el('p', { className: 'lead', textContent: t('confirm.saving') }));

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

  clearDraft(); // 확정했으면 입력 임시저장(FUNC-019, #17)은 지운다
  try {
    addMeeting(confirmation); // FUNC-020 내 모임 목록
  } catch { /* FUNC-020(#18) 구현 전 */ }

  // 저장하는 동안 [뒤로]로 돌아갔으면(#44) 이전 화면을 덮어 그리지 않는다. 확정은 내 약속 목록에서 다시 열 수 있다
  if (!saving.screen.isConnected) return confirmation;
  drawSummary(container, confirmation, {
    stations, places: [place, ...places], roomId: confirmation.share_url.includes('?room=') ? roomId : undefined, notice,
  });
  return confirmation;
}
