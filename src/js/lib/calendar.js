// 캘린더 등록(.ics) — 약속 리마인드 (#75, FUNC-026 제안). 10/6 결정: 앱 푸시·카톡 자동 발송 대신 기기 캘린더에 약속을 넣고
// 알림은 캘린더 앱이 울린다. 서버·키·로그인 없이 브라우저에서 파일을 만든다.
// 알림 두 개: ① 당일 자정(시작 시각의 시·분만큼 전, 예: 18:00 약속 → 18시간 전) ② 약속 1시간 전(10/6 대원: 출발 시각 기준 알림은 뺌).
// 파일 형식은 RFC 5545: 줄 끝은 CRLF, 75바이트를 넘는 줄은 다음 줄 앞에 공백 하나를 두고 이어 쓴다(folding),
// 글자 값의 , ; \ 줄바꿈은 \ 로 피한다. 구글 캘린더 웹 링크는 보조(알림은 구글 기본 설정을 따른다).
// 카카오톡 안 브라우저는 .ics 파일을 열지 못해('지원하지 않는 파일 형식', 10/6 대원 확인) 버튼이 약속 링크를
// 기기의 기본 브라우저(크롬·사파리)로 여는 카카오톡 주소(kakaotalk://web/openExternal)로 바뀐다.
// 그때 주소에 ?cal=닉네임 을 붙여, 크롬에서 열린 경로 화면이 그 사람 칸을 펼치고 [내 캘린더에 추가]를 바로 보여준다(route.js).

import { t } from './data.js';
import { el, isKakaoTalk } from './shell.js';

export const BEFORE_MINUTES = 60;      // 약속 몇 분 전에 알릴지
export const EVENT_HOURS = 2;          // 일정 길이(끝 시각 = 도착 희망 시각 + 2시간)
export const ICS_FILENAME = 'eodiga3-meeting.ics';
const MINUTE_MS = 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

/** UTC 'YYYYMMDDTHHMMSSZ' */
export function icsDate(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** 글자 값 피하기: \ ; , 줄바꿈 */
export function escapeText(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** 75바이트를 넘는 줄을 나눈다(이어진 줄은 앞의 공백 1바이트 포함 75바이트). 한글은 3바이트라 글자 단위로 센다. */
export function foldLine(line, max = 75) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = '', bytes = 0;
  for (const ch of String(line)) {
    const size = encoder.encode(ch).length;
    const limit = parts.length ? max - 1 : max;
    if (bytes + size > limit) { parts.push(current); current = ''; bytes = 0; }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** 시작 전 분 수 → '-PT1H30M' (0이면 '-PT0M') */
function durationBefore(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (!total) return '-PT0M';
  const h = Math.floor(total / 60), m = total % 60;
  return `-PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}`;
}

/** 당일 자정 알림: 시작 시각(기기 시간대)의 시·분만큼 전. 18:30 약속 → '-PT18H30M' */
export function midnightTrigger(arrival) {
  const d = new Date(arrival);
  return durationBefore(d.getHours() * 60 + d.getMinutes());
}

/** 약속 minutes분 전 알림: '-PT1H' */
export function beforeTrigger(minutes = BEFORE_MINUTES) {
  return durationBefore(minutes);
}

/**
 * .ics 문자열. alarms: [{ trigger: '-PT18H', text }].
 * @param {{uid: string, title: string, start: Date|string, end?: Date|string, location?: string, description?: string, url?: string,
 *   alarms?: Array<{trigger: string, text: string}>, stamp?: Date}} event
 */
export function buildIcs({ uid, title, start, end, location = '', description = '', url = '', alarms = [], stamp = new Date() }) {
  const endAt = end ?? new Date(new Date(start).getTime() + EVENT_HOURS * 60 * MINUTE_MS);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//eodiga3//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${icsDate(stamp)}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(endAt)}`,
    `SUMMARY:${escapeText(title)}`,
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(url ? [`URL:${url}`] : []),
    ...alarms.flatMap((a) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${a.trigger}`, `DESCRIPTION:${escapeText(a.text)}`, 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lines.map((line) => foldLine(line)).join('\r\n')}\r\n`;
}

/** 구글 캘린더 '일정 만들기' 웹 링크(보조). 알림은 사용자 기본 설정을 따른다. */
export function googleCalendarUrl({ title, start, end, details = '', location = '' }) {
  const endAt = end ?? new Date(new Date(start).getTime() + EVENT_HOURS * 60 * MINUTE_MS);
  const query = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${icsDate(start)}/${icsDate(endAt)}`, details, location });
  return `https://calendar.google.com/calendar/render?${query}`;
}

/**
 * .ics 파일을 내려받게(열게) 한다. 안드로이드 크롬은 캘린더 앱으로, 아이폰 사파리는 '캘린더에 추가', PC는 파일 저장.
 * Blob을 못 쓰면 data: 주소로 연다. @returns {boolean} 시도조차 못 했으면 false
 */
export function downloadIcs(text, filename = ICS_FILENAME, { doc = globalThis.document, win = globalThis.window } = {}) {
  if (!doc?.createElement || !win) return false;
  try {
    const url = win.URL.createObjectURL(new win.Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    doc.body.append(a);
    a.click();
    a.remove();
    win.setTimeout?.(() => win.URL.revokeObjectURL(url), 10000);
    return true;
  } catch {
    try {
      win.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(text)}`;
      return true;
    } catch {
      return false;
    }
  }
}

export const CAL_PARAM = 'cal'; // 경로 화면이 열리자마자 캘린더 버튼을 보여줄 사람(닉네임). 값이 비면 첫 사람

/** 약속 링크에 ?cal=닉네임 을 붙인다(#d= 링크는 # 앞의 주소에 붙으므로 확정 정보가 깨지지 않는다). */
export function withCalendarFlag(url, nickname = '') {
  try {
    const u = new URL(url);
    u.searchParams.set(CAL_PARAM, nickname);
    return u.href;
  } catch {
    return url;
  }
}

/** 지금 주소의 ?cal= 값. 없으면 null */
export function calendarFlagOf(href) {
  try {
    return new URL(href).searchParams.get(CAL_PARAM);
  } catch {
    return null;
  }
}

/** 카카오톡 안 브라우저에서 주소를 기기의 기본 브라우저로 여는 카카오톡 주소 */
export function externalBrowserUrl(url) {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}

/**
 * 약속 하나의 캘린더 일정(.ics 입력값과 구글 링크). 화면 문구는 copy.json(calendar.*).
 * @param {{arrival: Date|string, station: string, place?: string, url: string, departAt: Date, minutes: number, from?: string, app?: string}} meeting
 *   from이 있으면 참여자용 설명('○○역에서 17:26 출발'), 없으면 총무용('가장 오래 걸리는 사람 기준')
 */
export function meetingEvent({ arrival, station, place, url, departAt, minutes, from, app = t('app.name') }) {
  const start = new Date(arrival);
  const time = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const depart = `${pad(new Date(departAt).getHours())}:${pad(new Date(departAt).getMinutes())}`;
  const title = place ? t('calendar.title', { app, station, place }) : t('calendar.titleNoPlace', { app, station });
  const description = from
    ? t('calendar.description', { from, depart, minutes, url })
    : t('calendar.descriptionHost', { depart, minutes, url });
  const location = place ? t('calendar.location', { station, place }) : t('join.stationName', { name: station });
  return {
    uid: `${start.getTime()}-${encodeURIComponent(from ?? 'host')}@eodiga3.vercel.app`,
    title, start, location, description, url,
    alarms: [
      { trigger: midnightTrigger(start), text: t('calendar.alarmDay', { time, station }) },
      { trigger: beforeTrigger(), text: t('calendar.alarmBefore', { time, station }) },
    ],
  };
}

/**
 * 화면에 붙일 캘린더 등록 칸: [내 캘린더에 추가] 버튼 + 구글 캘린더 링크 + 안내.
 * 카카오톡 안 브라우저면 버튼이 [브라우저에서 열어 캘린더에 추가](약속 링크를 크롬·사파리로 열기)가 된다.
 * @param {Parameters<typeof meetingEvent>[0]} meeting
 * @param {{kakaoTalk?: boolean, win?: Window}} options 검사용
 * @returns {HTMLElement|null} 도착 시각이 이상하면 null(칸을 숨긴다)
 */
export function calendarControls(meeting, { win = globalThis.window, kakaoTalk = isKakaoTalk(win) } = {}) {
  if (Number.isNaN(new Date(meeting.arrival).getTime())) return null;
  const event = meetingEvent(meeting);
  const hint = el('p', { className: 'cal-hint', textContent: t(kakaoTalk ? 'calendar.kakaoHint' : 'calendar.hint') });
  const button = kakaoTalk
    ? el('button', {
      type: 'button', className: 'btn ghost sm', textContent: t('calendar.openExternal'),
      onclick: () => {
        try { win.location.href = externalBrowserUrl(withCalendarFlag(meeting.url, meeting.nickname ?? '')); } catch { hint.textContent = t('calendar.failed'); }
      },
    })
    : el('button', {
      type: 'button', className: 'btn ghost sm', textContent: t('calendar.add'),
      onclick: () => { if (!downloadIcs(buildIcs(event))) hint.textContent = t('calendar.failed'); },
    });
  const google = el('a', {
    className: 'cal-google', target: '_blank', rel: 'noopener', textContent: t('calendar.google'),
    href: googleCalendarUrl({ title: event.title, start: event.start, details: event.description, location: event.location }),
  });
  return el('div', { className: 'cal-row' }, [button, google, hint]);
}
