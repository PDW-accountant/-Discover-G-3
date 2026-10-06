import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createConfirmation, normalizeConfirmation, encodeConfirmation, decodeConfirmation,
  isExpired, hashUrl, roomUrl, readShareUrl, LINK_EXPIRE_DAYS, ENFORCE_LINK_EXPIRY,
} from '../src/js/lib/share-link.js';

const NAMES = ['감자', '택이', '여섯글자닉네', '민아', '재호', '현우', '해진', '지훈', '연경'];
const participants = NAMES.map((nickname, i) => ({ participant_id: `p_${i + 1}xxxxxxx`, nickname, origin_station_id: `S${i + 1}` }));
const request = { purpose: '회식', arrival_time: '2026-10-05T18:00:00+09:00' };
const travel_times = Object.fromEntries(participants.map((p, i) => [p.participant_id, { minutes: 10 + i, transfers: 1, is_estimated: false }]));
const selected = { rank: 1, station: { id: 'S-SAMPLE-1', name: '종로3가' }, travel_times, avg_time: 14, std_time: 2.6, score: 16.6, max_time: 18, is_estimated: false };
const place = { place_id: 'P-001', station_id: 'S-SAMPLE-1', purpose: '회식', order: 1, name: '가게', kakao_url: 'https://place.map.kakao.com/1' };

test('FUNC-012: 입력(request·selected_result·place·participants)으로 정해진 형태의 확정 정보를 만든다', () => {
  const c = createConfirmation(request, selected, place, participants);
  assert.deepEqual(Object.keys(c), ['v', 'p', 'a', 's', 'pl', 'e', 'people']);
  assert.equal(c.v, 1);
  assert.equal(c.p, '회식');
  assert.equal(c.a, request.arrival_time);
  assert.equal(c.s, 'S-SAMPLE-1');
  assert.equal(c.pl, 'P-001');
  assert.equal(Date.parse(c.e) - Date.parse(c.a), LINK_EXPIRE_DAYS * 24 * 60 * 60 * 1000);
  assert.deepEqual(c.people[0], { n: '감자', s: 'S1', m: 10 });
  assert.equal(c.people.length, 9);
});

test('FUNC-012: travel_times가 목록 형태여도, 닉네임이 비어 있어도 만든다', () => {
  const list = participants.slice(0, 3).map((p, i) => ({ participant_id: p.participant_id, minutes: 20.4 + i }));
  const people = participants.slice(0, 3).map((p, i) => ({ ...p, nickname: i === 1 ? '' : p.nickname }));
  const c = createConfirmation(request, { ...selected, travel_times: list }, place, people);
  assert.deepEqual(c.people.map((p) => [p.n, p.m]), [['감자', 20], ['2번', 21], ['여섯글자닉네', 22]]);
});

test('FUNC-012: 이동시간이 없는 참여자가 있으면 예외', () => {
  assert.throws(() => createConfirmation(request, { ...selected, travel_times: {} }, place, participants));
});

test('FUNC-012: 9명 확정 정보를 넣었다 빼면 같은 값이 나온다', () => {
  const c = createConfirmation(request, selected, place, participants);
  const text = encodeConfirmation({ ...c, share_url: 'https://example.com/#d=x' });
  assert.match(text, /^[A-Za-z0-9_-]+$/); // 주소에 그대로 넣을 수 있는 문자만
  assert.deepEqual(decodeConfirmation(text), c);
  assert.deepEqual(decodeConfirmation(`#d=${text}`), c);
});

test('FUNC-012: 링크에는 닉네임·출발역·분 외의 참여자 정보(participant_id 등)가 들어가지 않는다', () => {
  const c = createConfirmation(request, selected, place, participants);
  const decoded = decodeConfirmation(encodeConfirmation({ ...c, people: c.people.map((p) => ({ ...p, phone: '010' })) }));
  for (const person of decoded.people) assert.deepEqual(Object.keys(person), ['n', 's', 'm']);
  const raw = Buffer.from(encodeConfirmation(c), 'base64url').toString('utf8');
  assert.ok(!raw.includes('p_1'), 'participant_id가 링크에 들어가면 안 된다');
});

test('FUNC-012 예외: 링크가 너무 길면 닉네임을 줄인다 (겹치면 번호로)', () => {
  const c = createConfirmation(request, selected, place, participants);
  const full = encodeConfirmation(c);
  const short = encodeConfirmation(c, { maxLength: full.length - 10 });
  assert.ok(short.length < full.length);
  const names = decodeConfirmation(short).people.map((p) => p.n);
  assert.equal(new Set(names).size, names.length, '줄인 닉네임도 서로 달라야 한다');
  const tiny = decodeConfirmation(encodeConfirmation(c, { maxLength: 10 }));
  assert.deepEqual(tiny.people.map((p) => p.n), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.deepEqual(tiny.people.map((p) => p.m), c.people.map((p) => p.m)); // 시간은 그대로
});

test('FUNC-014: 손상된 문자열이면 null', () => {
  const c = createConfirmation(request, selected, place, participants);
  const text = encodeConfirmation(c);
  const bad = [
    undefined, '', '#d=', '한글', 'abc$%', text.slice(0, -5), `x${text}`,
    Buffer.from('not json').toString('base64url'),
    Buffer.from(JSON.stringify({ ...c, v: 2 })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...c, p: '술자리' })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...c, people: [] })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...c, people: [{ n: '가', s: 'S1', m: -1 }] })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...c, people: [{ n: '가', s: 'S1', m: 1 }, { n: '가', s: 'S2', m: 1 }] })).toString('base64url'),
  ];
  for (const value of bad) assert.equal(decodeConfirmation(value), null, String(value).slice(0, 30));
});

test('FUNC-014: 만료 시각이 지났는지 확인한다', () => {
  const c = createConfirmation(request, selected, place, participants);
  assert.equal(isExpired(c, new Date('2026-10-06T00:00:00+09:00')), false);
  assert.equal(isExpired(c, new Date('2026-11-05T00:00:00+09:00')), true);
});

test('공유 링크 주소: 방이 있으면 ?room=, 없으면 #d=', () => {
  const c = createConfirmation(request, selected, place, participants);
  assert.equal(roomUrl('abc123DEF45', 'https://x.vercel.app'), 'https://x.vercel.app/?room=abc123DEF45');
  const url = hashUrl(c, 'https://x.vercel.app');
  assert.ok(url.startsWith('https://x.vercel.app/#d='));
  assert.deepEqual(decodeConfirmation(new URL(url).hash), c);
});

test('normalizeConfirmation: 정해진 키만 남긴다 (share_url 등은 버림)', () => {
  const c = createConfirmation(request, selected, place, participants);
  assert.deepEqual(normalizeConfirmation({ ...c, share_url: 'u', extra: 1 }), c);
  assert.equal(normalizeConfirmation(null), null);
});

// ---------- FUNC-014 공유 링크 열기: readShareUrl ----------
const SITE = 'https://eodiga3.vercel.app';

test('FUNC-014: 방 링크(?room=)면 방 id를 돌려준다 (방 상태는 참여자 화면이 판단)', () => {
  assert.deepEqual(readShareUrl(`${SITE}/?room=abc123DEF45`), { type: 'room', room_id: 'abc123DEF45' });
  assert.deepEqual(readShareUrl(roomUrl('room_1234-5', SITE)), { type: 'room', room_id: 'room_1234-5' });
});

test('FUNC-014: #d= 링크면 다른 기기에서 열어도 같은 확정 정보를 복원한다', () => {
  const c = createConfirmation(request, selected, place, participants);
  const url = hashUrl(c, SITE); // 확정한 기기에서 만든 링크
  const opened = readShareUrl(new URL(url)); // 다른 기기·시크릿 창: 주소만 있으면 된다(저장소·로그인 불필요)
  assert.equal(opened.type, 'confirmation');
  const { share_url, ...rest } = opened.confirmation;
  assert.deepEqual(rest, c);
  assert.equal(share_url, url, '경로 화면에서 다시 복사할 수 있게 지금 주소를 share_url로 붙인다');
});

test('FUNC-014: 링크를 줄였어도(닉네임 축약) 형식이 맞으면 열린다', () => {
  const c = createConfirmation(request, selected, place, participants);
  const url = `${SITE}/#d=${encodeConfirmation(c, { maxLength: 10 })}`;
  const opened = readShareUrl(url);
  assert.equal(opened.type, 'confirmation');
  assert.deepEqual(opened.confirmation.people.map((p) => p.m), c.people.map((p) => p.m));
});

test('FUNC-014 예외: 손상·형식 오류 링크는 안내 화면(invalid)', () => {
  const c = createConfirmation(request, selected, place, participants);
  const good = encodeConfirmation(c);
  const bad = [
    `${SITE}/#d=`,                       // 비어 있음
    `${SITE}/#d=${good.slice(0, -8)}`,   // 잘림 (메신저에서 끝이 잘린 경우)
    `${SITE}/#d=${good}%25`,             // 이상한 글자
    `${SITE}/#d=${Buffer.from(JSON.stringify({ ...c, v: 9 })).toString('base64url')}`, // 다른 버전
    `${SITE}/?room=`,                    // 방 id 없음
    `${SITE}/?room=short`,               // 형식이 틀린 방 id
    `${SITE}/?room=../../etc`,
  ];
  for (const url of bad) assert.deepEqual(readShareUrl(url), { type: 'invalid', reason: 'damaged' }, url);
});

test('FUNC-014: 그 외 주소는 첫 화면', () => {
  for (const url of [`${SITE}/`, `${SITE}/index.html`, `${SITE}/#top`, `${SITE}/?utm=kakao`, 'not a url', undefined]) {
    assert.deepEqual(readShareUrl(url), { type: 'home' }, String(url));
  }
});

test('FUNC-014: 만료 검사는 지금 꺼져 있고(규칙 미결), 켜면 만료된 링크를 안내 화면으로 보낸다', () => {
  assert.equal(ENFORCE_LINK_EXPIRY, false);
  const url = hashUrl(createConfirmation(request, selected, place, participants), SITE);
  const later = new Date('2027-01-01T00:00:00+09:00'); // 도착 + 30일 이후
  assert.equal(readShareUrl(url, { now: later }).type, 'confirmation');
  assert.deepEqual(readShareUrl(url, { now: later, enforceExpiry: true }), { type: 'invalid', reason: 'expired' });
  assert.equal(readShareUrl(url, { now: new Date('2026-10-06T00:00:00+09:00'), enforceExpiry: true }).type, 'confirmation');
});

// ---------- #88 '기타': 장소 없이 역만 확정 ----------

test("#88: 목적이 '기타'고 장소가 없으면 확정 정보에 pl 키가 아예 없다 (나머지 키·순서는 그대로)", () => {
  const c = createConfirmation({ ...request, purpose: '기타' }, selected, null, participants);
  assert.deepEqual(Object.keys(c), ['v', 'p', 'a', 's', 'e', 'people']);
  assert.equal(c.p, '기타');
  assert.equal('pl' in c, false);
  assert.equal(c.people.length, 9);
});

test("#88: 장소 없는 확정 정보도 링크에 넣었다 빼면 같고, #d= 링크로 열린다", () => {
  const c = createConfirmation({ ...request, purpose: '기타' }, selected, null, participants);
  const text = encodeConfirmation(c);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeConfirmation(text), c);
  assert.equal('pl' in decodeConfirmation(text), false);
  const opened = readShareUrl(hashUrl(c, SITE));
  assert.equal(opened.type, 'confirmation');
  const { share_url, ...rest } = opened.confirmation;
  assert.deepEqual(rest, c);
});

test("#88: normalizeConfirmation — pl은 선택 항목: 없음·null은 통과, 있으면 문자열만, 빈 문자열·숫자·객체는 거부", () => {
  const base = createConfirmation({ ...request, purpose: '기타' }, selected, null, participants);
  assert.deepEqual(normalizeConfirmation({ ...base, pl: undefined }), base);
  assert.deepEqual(normalizeConfirmation({ ...base, pl: null }), base);
  assert.deepEqual(normalizeConfirmation({ ...base, pl: 'P-001' }), { ...base, pl: 'P-001' });
  for (const bad of ['', 123, {}, [], 'x'.repeat(65)]) assert.equal(normalizeConfirmation({ ...base, pl: bad }), null, JSON.stringify(bad));
  // 기타가 아니어도 pl이 없으면 형식상 통과한다(장소 데이터가 없어 확정한 경우와 같음) — 화면이 목적으로 판단한다
  assert.equal(normalizeConfirmation({ ...base, p: '회식' }).p, '회식');
});

test("#88: 예전 링크(회식·회의·오락 + pl 있음)는 그대로 열린다 — 링크 버전 1 유지", () => {
  const old = createConfirmation(request, selected, place, participants); // pl 있음
  assert.equal(old.v, 1);
  const opened = readShareUrl(hashUrl(old, SITE));
  assert.equal(opened.type, 'confirmation');
  assert.equal(opened.confirmation.pl, 'P-001');
  assert.deepEqual(Object.keys(opened.confirmation), ['v', 'p', 'a', 's', 'pl', 'e', 'people', 'share_url']);
});

test("#88: '기타'는 허용되는 목적이고, 그 밖의 값은 여전히 손상 링크", () => {
  const c = createConfirmation({ ...request, purpose: '기타' }, selected, null, participants);
  assert.equal(decodeConfirmation(encodeConfirmation(c)).p, '기타');
  for (const p of ['etc', '기 타', '역만 찾기']) {
    assert.equal(decodeConfirmation(Buffer.from(JSON.stringify({ ...c, p })).toString('base64url')), null, p);
  }
  assert.throws(() => createConfirmation({ ...request, purpose: 'etc' }, selected, null, participants));
});
