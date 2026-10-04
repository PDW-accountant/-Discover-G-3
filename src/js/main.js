// 앱 시작점·화면 전환 (개발 A) — FUNC-014
// 주소를 보고 어느 화면을 열지 정한다 (판단은 lib/share-link.js의 readShareUrl).
//   ?room={id}  → 참여자 화면(join)이 방 정보를 읽어 확정 전이면 입력, 확정 후면 개인 경로(route), 없으면 안내 화면
//                 이 기기에 그 방의 총무 토큰이 있으면 총무 입력 현황(participants, FUNC-023)
//   #d={...}    → 저장소 없이 만든 공유 링크. 확정 정보를 복원해 개인 경로(route)
//   그 외       → 첫 화면(meeting-form)
// 링크가 손상되었으면 오류 대신 안내 화면(link-error)과 '처음으로' 버튼을 보여준다.
// 화면 이동은 모두 lib/shell.js 의 기록(startAt·go·replace·restart)을 거친다(#44, 화면_이동_설계.md). 링크·주소 바꾸기로 화면을 바꾸지 않는다.

import { loadData } from './lib/data.js';
import { readShareUrl } from './lib/share-link.js';
import { getHostToken } from './lib/storage.js';
import { go, setHome, startAt } from './lib/shell.js';
import { render as renderJoin } from './screens/join.js';
import { render as renderMeetingForm } from './screens/meeting-form.js';
import { render as renderParticipants } from './screens/participants.js';
import { render as renderRoute } from './screens/route.js';
import { render as renderConfirm } from './screens/confirm.js';
import { render as renderLinkError } from './screens/link-error.js';

/** 개인 경로 화면(FUNC-015)을 연다. 아직 없거나 실패하면 같은 확정 정보로 확정 요약(FUNC-012)을 보여준다. */
async function openRoute(app, params) {
  try {
    await renderRoute(app, params);
  } catch (e) {
    console.warn('개인 경로 화면을 열지 못해 확정 요약을 보여줍니다', e);
    await renderConfirm(app, params);
  }
}

/** 주소를 읽은 결과 → [화면, 입력값] */
function screenFor(target) {
  // FUNC-023(#21): 방을 만든 총무 기기(총무 토큰 있음)는 같은 링크로 총무 입력 현황 화면을 연다(새로고침·다시 열기).
  if (target.type === 'room' && getHostToken(target.room_id)) return [renderParticipants, { room_id: target.room_id }];
  if (target.type === 'room') return [renderJoin, { room_id: target.room_id }];
  if (target.type === 'confirmation') return [openRoute, { confirmation: target.confirmation }];
  if (target.type === 'invalid') return [renderLinkError, { reason: target.reason }];
  return [renderMeetingForm, {}];
}

async function start() {
  const app = document.getElementById('app');
  try {
    await loadData();
  } catch (e) {
    console.warn('데이터를 불러오지 못했습니다', e);
  }
  setHome(renderMeetingForm, app); // [홈]·'처음으로'는 기록을 비우고 이 화면을 연다
  // 출발점: 화면 이동 기록을 비우고 '뒤로가기 두 번이면 종료' 자리를 준비한다(#44).
  const [screen, params] = screenFor(readShareUrl(location));
  return startAt(screen, app, params);
}

// 같은 탭 주소창에 공유 링크(#d=)를 붙여넣으면 페이지는 그대로 두고 브라우저가 기록 칸을 만들며 주소만 바꾼다.
// 그 칸을 받아들여(adopt) 새 화면으로 쌓는다 → 뒤로가기는 직전 화면. 앱이 스스로 바꾼 주소나 뒤로가기로 돌아간 칸(우리 state 가 있음)은
// popstate 가 처리하므로 여기서는 무시한다(예전에는 모든 주소 변경에 앱을 처음부터 다시 시작해 내 약속 → 열기 뒤 뒤로가기가 어긋났다).
window.addEventListener('hashchange', () => {
  if (history.state && typeof history.state === 'object' && 'eodiga3' in history.state) return;
  const target = readShareUrl(location);
  if (target.type !== 'confirmation' && target.type !== 'invalid') return;
  const [screen, params] = screenFor(target);
  go(screen, document.getElementById('app'), params, { adopt: true });
});
start();
