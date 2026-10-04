// 앱 시작점·화면 전환 (개발 A) — FUNC-014
// 주소를 보고 어느 화면을 열지 정한다 (판단은 lib/share-link.js의 readShareUrl).
//   ?room={id}  → 참여자 화면(join)이 방 정보를 읽어 확정 전이면 입력, 확정 후면 개인 경로(route), 없으면 안내 화면
//   #d={...}    → 저장소 없이 만든 공유 링크. 확정 정보를 복원해 개인 경로(route)
//   그 외       → 첫 화면(meeting-form)
// 링크가 손상되었으면 오류 대신 안내 화면(link-error)과 '처음으로' 버튼을 보여준다.
// 같은 탭에서 주소의 # 뒤만 바뀌면(링크를 붙여넣은 경우) 새로고침 없이 다시 연다.

import { loadData } from './lib/data.js';
import { readShareUrl } from './lib/share-link.js';
import { render as renderJoin } from './screens/join.js';
import { render as renderMeetingForm } from './screens/meeting-form.js';
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

async function start() {
  const app = document.getElementById('app');
  try {
    await loadData();
  } catch (e) {
    console.warn('데이터를 불러오지 못했습니다', e);
  }
  const target = readShareUrl(location);
  if (target.type === 'room') return renderJoin(app, { room_id: target.room_id });
  if (target.type === 'confirmation') return openRoute(app, { confirmation: target.confirmation });
  if (target.type === 'invalid') return renderLinkError(app, { reason: target.reason });
  return renderMeetingForm(app);
}

window.addEventListener('hashchange', start);
start();
