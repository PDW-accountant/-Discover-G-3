// 앱 시작점·화면 전환 (개발 A) — FUNC-014
// 주소를 보고 어느 화면을 열지 정한다.
//   ?room={id}  → 방 정보를 읽어 확정 전이면 참여자 입력(join), 확정 후면 개인 경로(route)
//   #d={...}    → 저장소 없이 만든 공유 링크. 확정 정보를 복원해 개인 경로(route)
//   그 외       → 첫 화면(meeting-form)
// 링크가 손상·만료되었으면 오류 대신 안내 화면(link-error)과 '처음으로' 버튼을 보여준다.

import { loadData } from './lib/data.js';

async function start() {
  const app = document.getElementById('app');
  try {
    await loadData();
  } catch (e) {
    console.warn('데이터를 불러오지 못했습니다', e);
  }
  // TODO(FUNC-014): 주소에 따라 screens/의 render(app, ...)를 호출한다.
}

start();
