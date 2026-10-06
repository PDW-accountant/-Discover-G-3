import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BEFORE_MINUTES, EVENT_HOURS, beforeTrigger, buildIcs, calendarFlagOf, downloadIcs, escapeText, externalBrowserUrl, foldLine, googleCalendarUrl, icsDate, meetingEvent, midnightTrigger, withCalendarFlag,
} from '../src/js/lib/calendar.js';
import { isKakaoTalk } from '../src/js/lib/shell.js';

// 실행: npm test   (#75 약속 리마인드 — 캘린더 등록)

const arrival = new Date(2026, 9, 6, 18, 0); // 10/6 18:00 (기기 시간대)
const departAt = new Date(2026, 9, 6, 17, 26); // 24분 + 여유 10분

test('#75: 당일 자정 알림은 시작 시각의 시·분만큼 전 (18:00 → 18시간 전, 18:30 → 18시간 30분 전, 00:00 → 0분 전)', () => {
  assert.equal(midnightTrigger(arrival), '-PT18H');
  assert.equal(midnightTrigger(new Date(2026, 9, 6, 18, 30)), '-PT18H30M');
  assert.equal(midnightTrigger(new Date(2026, 9, 6, 0, 0)), '-PT0M');
  assert.equal(midnightTrigger(new Date(2026, 9, 6, 0, 45)), '-PT45M');
});

test('#75: 두 번째 알림은 약속 1시간 전 (10/6: 출발 시각 기준 알림은 뺌)', () => {
  assert.equal(beforeTrigger(), '-PT1H');
  assert.equal(beforeTrigger(90), '-PT1H30M');
  assert.equal(BEFORE_MINUTES, 60);
});

test('#75: 시각은 UTC로 쓴다', () => {
  assert.equal(icsDate(new Date('2026-10-06T09:00:00.000Z')), '20261006T090000Z');
  assert.equal(icsDate(arrival), arrival.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''));
});

test('#75: 글자 값의 , ; \\ 줄바꿈은 \\ 로 피한다', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  assert.equal(escapeText(undefined), '');
});

test('#75: 75바이트를 넘는 줄은 다음 줄 앞에 공백을 두고 이어 쓴다 (한글은 3바이트)', () => {
  const short = 'SUMMARY:짧은 제목';
  assert.equal(foldLine(short), short);
  const long = `DESCRIPTION:${'가'.repeat(40)}`; // 12 + 120바이트
  const folded = foldLine(long);
  assert.equal(folded.replace(/\r\n /g, ''), long); // 이어 붙이면 원래 줄
  for (const part of folded.split('\r\n')) assert.ok(new TextEncoder().encode(part).length <= 75, `${part.length}자`);
  assert.match(folded, /\r\n /);
});

test('#75: .ics 파일은 VCALENDAR/VEVENT 틀, CRLF, 알림 2개, 끝 시각은 시작 + 2시간', () => {
  const text = buildIcs({
    uid: 'u1@eodiga3.vercel.app', title: '어디Gㅏ3 · 종로3가역 시민식당 본점', start: arrival,
    location: '종로3가역 시민식당 본점', description: '연신내역에서 17:26 출발 · 24분 · 경로 보기 https://eodiga3.vercel.app/?room=abc',
    url: 'https://eodiga3.vercel.app/?room=abc', stamp: new Date('2026-10-06T00:00:00Z'),
    alarms: [{ trigger: '-PT18H', text: '오늘 18:00 종로3가역 약속이 있어요' }, { trigger: '-PT1H34M', text: '1시간 뒤 출발' }],
  });
  const lines = text.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines[lines.length - 2], 'END:VCALENDAR');
  assert.equal(lines[lines.length - 1], ''); // 마지막 줄도 CRLF로 끝난다
  assert.ok(!text.includes('\n') || !/[^\r]\n/.test(text), 'LF만 있는 줄바꿈이 없다');
  assert.ok(lines.includes('UID:u1@eodiga3.vercel.app'));
  assert.ok(lines.includes(`DTSTART:${icsDate(arrival)}`));
  assert.ok(lines.includes(`DTEND:${icsDate(new Date(arrival.getTime() + EVENT_HOURS * 3600000))}`));
  assert.ok(lines.includes('DTSTAMP:20261006T000000Z'));
  assert.ok(lines.includes('SUMMARY:어디Gㅏ3 · 종로3가역 시민식당 본점'));
  assert.ok(lines.includes('URL:https://eodiga3.vercel.app/?room=abc'));
  assert.equal(lines.filter((l) => l === 'BEGIN:VALARM').length, 2);
  assert.ok(lines.includes('TRIGGER:-PT18H') && lines.includes('TRIGGER:-PT1H34M'));
  assert.ok(lines.every((l) => new TextEncoder().encode(l).length <= 75), '모든 줄이 75바이트 이내');
  assert.equal(text.replace(/\r\n /g, '').split('\r\n').find((l) => l.startsWith('DESCRIPTION:연신내')),
    'DESCRIPTION:연신내역에서 17:26 출발 · 24분 · 경로 보기 https://eodiga3.vercel.app/?room=abc'); // 이어 붙이면 원래 설명
});

test('#75: 구글 캘린더 링크는 제목·시각(UTC)·설명·장소를 담는다', () => {
  const url = new URL(googleCalendarUrl({ title: '제목', start: arrival, details: '설명', location: '장소' }));
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), '제목');
  assert.equal(url.searchParams.get('dates'), `${icsDate(arrival)}/${icsDate(new Date(arrival.getTime() + 2 * 3600000))}`);
  assert.equal(url.searchParams.get('details'), '설명');
  assert.equal(url.searchParams.get('location'), '장소');
});

test('#75: 약속 일정 — 참여자용은 출발역·출발 시각, 총무용은 가장 오래 걸리는 사람 기준, 알림은 당일 자정·약속 1시간 전', () => {
  const mine = meetingEvent({ arrival, station: '종로3가', place: '시민식당 본점', url: 'https://x/?room=a', departAt, minutes: 24, from: '연신내', app: '어디Gㅏ3' });
  assert.equal(mine.title, 'calendar.title'); // 검사 환경에는 copy.json이 없어 키 이름이 보인다
  assert.equal(mine.start.getTime(), arrival.getTime());
  assert.equal(mine.url, 'https://x/?room=a');
  assert.deepEqual(mine.alarms.map((a) => a.trigger), ['-PT18H', '-PT1H']);
  assert.match(mine.uid, /^\d+-%EC%97%B0%EC%8B%A0%EB%82%B4@eodiga3\.vercel\.app$/); // 한글은 피해 쓴다
  const host = meetingEvent({ arrival, station: '종로3가', url: 'https://x/?room=a', departAt, minutes: 24, app: '어디Gㅏ3' });
  assert.equal(host.title, 'calendar.titleNoPlace');
  assert.match(host.uid, /-host@/);
});

test('#75: 카카오톡 안 브라우저는 .ics를 못 열어 약속 링크를 기기 기본 브라우저로 여는 카카오톡 주소를 쓴다', () => {
  assert.equal(externalBrowserUrl('https://eodiga3.vercel.app/?room=abc'), 'kakaotalk://web/openExternal?url=https%3A%2F%2Feodiga3.vercel.app%2F%3Froom%3Dabc');
  // 크롬에서 열린 경로 화면이 그 사람 칸을 펼치도록 ?cal=닉네임 을 붙인다. #d= 링크는 # 앞에 붙어 확정 정보가 그대로다
  assert.equal(withCalendarFlag('https://x.test/?room=abc', '감이'), 'https://x.test/?room=abc&cal=%EA%B0%90%EC%9D%B4');
  assert.equal(withCalendarFlag('https://x.test/#d=eyJ2IjoxfQ', '감이'), 'https://x.test/?cal=%EA%B0%90%EC%9D%B4#d=eyJ2IjoxfQ');
  assert.equal(withCalendarFlag('https://x.test/#d=eyJ2IjoxfQ'), 'https://x.test/?cal=#d=eyJ2IjoxfQ'); // 총무: 사람 없음 → 첫 사람
  assert.equal(withCalendarFlag('이상한 주소', '감이'), '이상한 주소');
  assert.equal(calendarFlagOf('https://x.test/?cal=%EA%B0%90%EC%9D%B4#d=eyJ2IjoxfQ'), '감이');
  assert.equal(calendarFlagOf('https://x.test/?room=abc&cal='), '');
  assert.equal(calendarFlagOf('https://x.test/?room=abc'), null);
  assert.equal(calendarFlagOf('이상한 주소'), null);
  assert.equal(isKakaoTalk({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) KAKAOTALK/10.0' } }), true);
  assert.equal(isKakaoTalk({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/129' } }), false);
  assert.equal(isKakaoTalk(undefined), false);
});

test('#75: 내려받기는 Blob 주소를 가진 <a download>를 눌러 연다. 브라우저가 아니면 false', () => {
  const clicked = [];
  const doc = { createElement: () => ({ click() { clicked.push(this); }, remove() {} }), body: { append() {} } };
  const win = {
    Blob: function Blob(parts, opts) { this.parts = parts; this.type = opts.type; },
    URL: { createObjectURL: (blob) => `blob:${blob.type}`, revokeObjectURL() {} },
    setTimeout: () => {},
  };
  assert.equal(downloadIcs('BEGIN:VCALENDAR', 'x.ics', { doc, win }), true);
  assert.equal(clicked.length, 1);
  assert.equal(clicked[0].href, 'blob:text/calendar;charset=utf-8');
  assert.equal(clicked[0].download, 'x.ics');
  assert.equal(downloadIcs('x', 'x.ics', { doc: undefined, win: undefined }), false);
  // Blob을 못 쓰면 data: 주소로 연다
  const nav = { location: { href: '' } };
  assert.equal(downloadIcs('BEGIN:VCALENDAR', 'x.ics', { doc, win: nav }), true);
  assert.match(nav.location.href, /^data:text\/calendar;charset=utf-8,BEGIN/);
});
