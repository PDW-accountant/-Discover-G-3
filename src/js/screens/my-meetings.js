// 내 모임 목록 (개발 A) — FUNC-020 (#18)
// 첫 화면 [내 약속 확인하기]로 연다. 이 휴대폰에서 만든 모임을 최근 순으로: '입력 받는 중'(방을 만든 뒤)과 '확정'.
//   [열기]: 입력 받는 중 → 총무 입력 현황(?room=, 총무 토큰이 없으면 참여자 입력) / 확정 → 개인 경로(#d= 공유 링크를 풀어서)
//     화면 이동 기록(go)을 거쳐 열고 주소만 그 약속의 링크로 바꾼다(#44). 그래서 [뒤로]·휴대폰 뒤로가기는 이 목록으로 돌아오고,
//     새로고침하면 그 약속이 다시 열린다. (예전에는 링크로 열어 앱이 처음부터 다시 시작돼 뒤로가기가 종료 안내로 바뀌었다)
//   [삭제]: 한 번 더 눌러야 지운다. 입력 받는 중인 방은 서버의 방과 이 기기의 총무 토큰도 지운다(deleteRoom).
//     서버가 없거나(Redis 없이 실행) 실패해도 목록에서는 지운다 — 서버의 방은 30일 뒤 만료. 확정된 방은 목록에서만 지운다.
// '이 휴대폰에만 저장돼요' 안내. 문구는 lib/data.js의 t()로 읽는다. 화면 모양은 프로토타입2의 목록(.list·.place·.mini)을 따른다.

import { loadData, t } from '../lib/data.js';
import { deleteRoom } from '../lib/api-client.js';
import { getHostToken, listMeetings, removeMeeting } from '../lib/storage.js';
import { formatMeetingTime } from '../lib/share.js';
import { readShareUrl } from '../lib/share-link.js';
import { createShell, el, go } from '../lib/shell.js';
import { render as renderRoute } from './route.js';
import { render as renderParticipants } from './participants.js';
import { render as renderJoin } from './join.js';

/**
 * [열기]가 열 화면. 링크를 풀어 확정 약속(#d=)이면 개인 경로, 방(?room=)이면 총무 입력 현황(총무 토큰 있음) 또는 참여자 입력.
 * @returns {{renderFn, params, url}|null} 풀 수 없는 링크면 null(링크로 그냥 연다)
 */
export function screenForMeeting(meeting, { hasHostToken = getHostToken } = {}) {
  const base = globalThis.location?.href;
  const target = readShareUrl(base ? new URL(meeting.url, base) : meeting.url);
  if (target.type === 'confirmation') return { renderFn: renderRoute, params: { confirmation: target.confirmation }, url: meeting.url };
  if (target.type === 'room') {
    return { renderFn: hasHostToken(target.room_id) ? renderParticipants : renderJoin, params: { room_id: target.room_id }, url: meeting.url };
  }
  return null;
}

/** 목록 한 줄에 보일 이름: 확정이면 '종로3가역 · 시민식당', 입력 받는 중이면 '회식 / 식사 약속'. */
export function meetingTitle(meeting, { stationsById = {}, placesById = {} } = {}) {
  if (meeting.status !== '확정') return t('meetings.collectingTitle', { purpose: t(`meeting.purpose.${meeting.purpose}`) });
  const station = stationsById[meeting.station_id]?.name;
  const place = placesById[meeting.place_id]?.name;
  if (station && place) return t('meetings.confirmedTitle', { station, place });
  return station ? t('join.stationName', { name: station }) : t(`meeting.purpose.${meeting.purpose}`);
}

/** 화면을 그린다. @param {HTMLElement} container */
export async function render(container) {
  const data = await loadData().catch(() => ({}));
  const stationsById = Object.fromEntries((data.stations ?? []).map((s) => [s.id, s]));
  const placesById = Object.fromEntries((data.places ?? []).map((p) => [p.place_id, p]));
  const { screen, foot, toast } = createShell(container);
  let armed = null; // [삭제]를 한 번 누른 항목의 key (한 번 더 누르면 지운다)
  let busy = false;

  async function remove(meeting) {
    if (armed !== meeting.key) {
      armed = meeting.key;
      return draw();
    }
    busy = true;
    draw();
    const token = meeting.room_id ? getHostToken(meeting.room_id) : null;
    if (meeting.status === '입력중' && token) await deleteRoom(meeting.room_id, token); // 실패해도 목록에서는 지운다
    removeMeeting(meeting.key);
    armed = null;
    busy = false;
    draw();
    toast(t('meetings.deleted'));
  }

  function row(meeting) {
    const confirmed = meeting.status === '확정';
    const sure = armed === meeting.key;
    return el('div', { className: 'place' }, [
      el('div', {}, [
        el('span', { className: confirmed ? 'train express' : 'train', textContent: t(confirmed ? 'meetings.confirmed' : 'meetings.collecting') }),
        el('b', { textContent: meetingTitle(meeting, { stationsById, placesById }) }),
        el('em', { textContent: [formatMeetingTime(meeting.arrival_time), confirmed ? t(`meeting.purpose.${meeting.purpose}`) : null].filter(Boolean).join(' · ') }),
      ]),
      el('div', { className: 'pl-btns' }, [
        el('a', {
          className: 'mini', href: meeting.url, textContent: t('meetings.open'),
          onclick: (event) => {
            const next = screenForMeeting(meeting);
            if (!next) return; // 풀 수 없는 링크는 브라우저가 그대로 연다
            event.preventDefault();
            go(next.renderFn, container, next.params, { url: next.url });
          },
        }),
        el('button', {
          type: 'button', className: sure ? 'mini on' : 'mini', disabled: busy,
          textContent: t(sure ? 'meetings.deleteConfirm' : 'meetings.delete'),
          onclick: () => remove(meeting),
        }),
      ]),
    ]);
  }

  function draw() {
    const meetings = listMeetings();
    screen.replaceChildren(
      el('div', { className: 'eyebrow', textContent: t('meetings.eyebrow') }),
      el('h2', { className: 'q big', textContent: t('meetings.title') }),
      el('p', { className: 'lead', textContent: t('meetings.deviceOnly') }),
      meetings.length
        ? el('div', { className: 'list my-meetings' }, meetings.map(row))
        : el('p', { className: 'lead', textContent: t('meetings.empty') }),
      ...(meetings.length ? [el('p', { className: 'hint', textContent: t('meetings.deleteHint') })] : []),
    );
    foot.replaceChildren();
  }

  draw();
}
