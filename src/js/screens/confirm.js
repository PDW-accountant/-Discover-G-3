// ④ 확정·카카오톡 공유·링크 복사 (개발 A) — FUNC-012, FUNC-013, FUNC-020(목록에 추가)
// 손그림 와이어프레임 기준: '일정이 확정되었어요' + 장소 상자(역·가게명·도착 시각) + '나의 경로 확인하기'.
// 참여자별 소요시간·권장 출발 시각은 개인 경로 화면(route.js, FUNC-015)에서 보여준다.
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
import { render as renderRoute } from './route.js';

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const pad = (n) => String(n).padStart(2, '0');

function formatArrival(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return t('confirm.arrival', { month: d.getMonth() + 1, day: d.getDate(), hour: pad(d.getHours()), minute: pad(d.getMinutes()) });
}

/** 가게명 링크 (FUNC-011). places.js 구현 전에는 kakao_url → 카카오맵 '역 이름 + 장소명' 검색. */
function linkFor(place, stationName) {
  try {
    return placeLink(place);
  } catch {
    return place.kakao_url || `https://map.kakao.com/link/search/${encodeURIComponent(`${stationName} ${place.name}`)}`;
  }
}

/** 뒤로·앱 이름·홈 버튼 (join.js와 같은 모양) */
function topBar() {
  const home = () => { location.href = location.pathname; };
  return el('header', { className: 'topbar' }, [
    el('button', { type: 'button', className: 'btn-box', textContent: t('join.back'), onclick: () => (history.length > 1 ? history.back() : home()) }),
    el('span', { className: 'topbar-title', textContent: t('app.name') }),
    el('button', { type: 'button', className: 'btn-home', title: t('join.home'), ariaLabel: t('join.home'), textContent: '⌂', onclick: home }),
  ]);
}

/** 경로 화면을 연다. 아직 없거나 실패하면 안내 문구만 보여준다. */
function openRoute(container, params) {
  const fallback = () => container.replaceChildren(topBar(), el('p', { className: 'meta', textContent: t('confirm.routeNotReady') }));
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
    : el('span', { textContent: confirmation.pl });

  container.replaceChildren(
    topBar(),
    el('div', { className: 'confirm-message' }, [
      el('p', { textContent: t('confirm.title') }),
      el('p', { textContent: t('confirm.shareHint') }),
    ]),
    el('div', { className: 'confirm-box' }, [
      el('p', { className: 'confirm-place' }, [el('span', { textContent: stationName }), placeName]),
      el('p', { className: 'confirm-time', textContent: formatArrival(confirmation.a) }),
    ]),
    ...(notice ? [el('p', { className: 'error', role: 'alert', textContent: notice })] : []),
    // TODO(FUNC-013, #11): 카카오톡 공유·링크 복사 버튼 (confirmation.share_url 사용)
    el('button', {
      type: 'button', className: 'btn-route',
      onclick: () => openRoute(container, { confirmation, room_id: roomId }),
    }, [el('span', { textContent: t('confirm.myRoute') }), el('span', { className: 'arrow', ariaHidden: 'true', textContent: '➜' })]),
  );
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
  if (!place) return container.replaceChildren(topBar(), el('p', { className: 'error', textContent: t('confirm.noPlace') }));
  container.replaceChildren(topBar(), el('p', { className: 'meta', textContent: t('confirm.saving') }));

  let confirmation;
  try {
    confirmation = createConfirmation(request, selectedResult, place, participants);
  } catch (e) {
    console.warn('확정 정보를 만들지 못했습니다', e);
    return container.replaceChildren(topBar(), el('p', { className: 'error', role: 'alert', textContent: t('confirm.failed') }));
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
