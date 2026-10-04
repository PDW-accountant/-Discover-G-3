// 앱 시작점·화면 전환 (개발 A) — FUNC-014
// 주소를 보고 어느 화면을 열지 정한다.
//   ?room={id}  → 방 정보를 읽어 확정 전이면 참여자 입력(join), 확정 후면 개인 경로(route)
//                 이 기기에 그 방의 총무 토큰이 있으면 총무 입력 현황(participants, FUNC-023)
//   #d={...}    → 저장소 없이 만든 공유 링크. 확정 정보를 복원해 개인 경로(route)
//   그 외       → 첫 화면(meeting-form)
// 링크가 손상·만료되었으면 오류 대신 안내 화면(link-error)과 '처음으로' 버튼을 보여준다.

import { loadData } from './lib/data.js';
import { render as renderJoin } from './screens/join.js';
import { render as renderMeetingForm } from './screens/meeting-form.js';
import { render as renderParticipants } from './screens/participants.js';
import { getHostToken } from './lib/storage.js';

async function start() {
  const app = document.getElementById('app');
  try {
    await loadData();
  } catch (e) {
    console.warn('데이터를 불러오지 못했습니다', e);
  }
  // FUNC-022(#20): ?room= 은 참여자 화면이 방 상태를 보고 입력·경로·안내 화면 중 하나를 연다.
  const roomId = new URLSearchParams(location.search).get('room');
  // FUNC-023(#21): 방을 만든 총무 기기(총무 토큰 있음)는 같은 링크로 총무 입력 현황 화면을 연다(새로고침·다시 열기).
  if (roomId && getHostToken(roomId)) return renderParticipants(app, { room_id: roomId });
  if (roomId) return renderJoin(app, { room_id: roomId });
  // TODO(FUNC-014): #d= 공유 링크 등 나머지 주소를 처리한다. 지금은 그 외 모두 첫 화면(FUNC-021: 링크로 입력받기 확인용).
  return renderMeetingForm(app);
}

start();
