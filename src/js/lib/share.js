// 카카오톡 공유·링크 복사 (개발 A) — FUNC-013
// 공유의 단위는 링크다. 메시지에는 만남 장소(역·장소명), 도착 희망 시각, '내 경로 보기' 링크만 넣는다.
// 참여자별 소요시간·닉네임은 넣지 않는다(10/3 밤 결정: 템플릿 문구·문구 복사 파기).
// 총무의 방 만들기 화면(FUNC-021)도 shareKakao·copyLink를 같이 쓸 수 있다.
// 문구는 lib/data.js의 t()로 읽는다.

import { KAKAO_JS_KEY } from '../config.js';
import { t } from './data.js';

// 카카오 JavaScript SDK (2026.9.3 배포 2.8.3). integrity는 공식 주소의 파일로 계산한 SRI 값.
// 버전을 올리면 카카오 개발자 문서 '다운로드' 페이지의 SRI 해시로 함께 바꾼다.
export const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js';
export const KAKAO_SDK_INTEGRITY = 'sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy';

const pad = (n) => String(n).padStart(2, '0');

/** 도착 희망 시각 표시: '10월 8일 (목) 19시 00분'. 확정 화면과 공유 메시지가 같이 쓴다. */
export function formatMeetingTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  return t('confirm.arrival', {
    month: d.getMonth() + 1, day: d.getDate(), weekday: t('confirm.weekdays').charAt(d.getDay()),
    hour: pad(d.getHours()), minute: pad(d.getMinutes()),
  });
}

/**
 * FUNC-013 공유 메시지를 만든다.
 * @param {MeetingConfirmation} confirmation share_url 포함
 * @param {{stationName?: string, placeName?: string}} names 화면에 보이는 역·장소 이름 (없으면 id)
 * @returns {{title: string, description: string, link: string}} ShareMessage (이슈 #11 출력 형태 그대로)
 */
export function buildShareMessage(confirmation, { stationName, placeName } = {}) {
  const station = stationName ?? confirmation.s;
  const placeLabel = placeName ?? confirmation.pl;
  // 장소 없이 역만 확정한 약속(기타, #88)은 역 이름만
  const place = placeLabel ? t('share.place', { station, place: placeLabel }) : t('share.placeStationOnly', { station });
  return {
    title: t('share.title'),
    description: t('share.description', { place, time: formatMeetingTime(confirmation.a) }),
    link: confirmation.share_url,
  };
}

/** 카카오톡 공유를 쓸 수 있는지 (JS 키가 있어야 한다). 없으면 카카오 버튼을 숨기고 링크 복사만 보여준다. */
export function canShareKakao(key = KAKAO_JS_KEY) {
  return Boolean(key);
}

let sdkPromise = null;

/** 카카오 SDK를 한 번만 불러온다. 버튼을 누를 때만 부른다.
 * SDK 2.x는 Kakao.init(key)을 한 뒤에야 Kakao.Share가 생기므로, 불러오기 성공은 Kakao.init으로 판단한다. */
function loadKakaoSdk() {
  if (globalThis.Kakao?.init) return Promise.resolve(globalThis.Kakao);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = KAKAO_SDK_URL;
      script.integrity = KAKAO_SDK_INTEGRITY;
      script.crossOrigin = 'anonymous';
      script.onload = () => (globalThis.Kakao?.init ? resolve(globalThis.Kakao) : reject(new Error('Kakao SDK 없음')));
      script.onerror = () => reject(new Error('Kakao SDK를 불러오지 못했습니다'));
      document.head.append(script);
    }).catch((e) => {
      sdkPromise = null; // 다음에 누르면 다시 시도
      throw e;
    });
  }
  return sdkPromise;
}

/**
 * 카카오 SDK로 공유 창을 연다(피드 템플릿, 이미지 없음, '내 경로 보기' 버튼 하나). 채팅방은 사용자가 고른다.
 * @param {{title, description, link}} message ShareMessage. 방 만들기 화면(FUNC-021)은 입력 링크로 같은 형태를 만들어 넘기면 된다.
 * 카카오가 보냄·취소 결과를 알려주지 않으므로(SDK 2.7.0에서 callback 제거) 공유 창을 열었으면 true.
 * @returns {Promise<boolean>} JS 키 없음·링크 없음·SDK 불러오기 실패·오류면 false (→ '링크 복사로 공유해 주세요')
 */
export async function shareKakao(message, { key = KAKAO_JS_KEY, loadSdk = loadKakaoSdk } = {}) {
  if (!key || !message?.link) return false;
  try {
    const Kakao = await loadSdk();
    if (!Kakao.isInitialized()) Kakao.init(key);
    const link = { mobileWebUrl: message.link, webUrl: message.link };
    Kakao.Share.sendDefault({
      objectType: 'feed',
      content: { title: message.title, description: message.description, link },
      buttons: [{ title: t('share.button'), link }],
    });
    return true;
  } catch (e) {
    console.warn('카카오톡 공유를 열지 못했습니다', e);
    return false;
  }
}

/** 링크를 클립보드에 복사한다. 권한이 없거나 지원하지 않으면 false (→ 선택 가능한 글자로 표시). */
export async function copyLink(link) {
  if (!link) return false;
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    return false;
  }
}
