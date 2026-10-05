import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// 실행: npm test
// 화면 문구는 코드에 직접 쓰지 않고 data/copy.json에서 t('키')로 읽는다(CLAUDE.md 5장).
// 코드가 부르는 문구 키가 copy.json에 모두 있는지 검사한다. 없으면 화면에 키 이름이 그대로 보인다(data.js의 t()).

const root = new URL('../', import.meta.url);
const copy = JSON.parse(readFileSync(new URL('data/copy.json', root), 'utf8'));

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? jsFiles(path) : entry.name.endsWith('.js') ? [path] : [];
  });
}

// 주석을 뺀 코드만 본다(주석의 t('키', { 값 }) 같은 설명 예시는 검사하지 않는다). 'https://' 같은 주소 속 //는 남긴다.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const sources = jsFiles(new URL('src/js/', root).pathname.replace(/^\/([A-Za-z]:)/, '$1')).map((path) => [path, stripComments(readFileSync(path, 'utf8'))]);

// 글자 그대로 쓴 키: t('result.loading'), t("…")
const literalKeys = new Set();
// 값에 따라 달라지는 키: t(`meeting.purpose.${purpose}`) → 앞부분 'meeting.purpose.'
const dynamicPrefixes = new Set();
for (const [, code] of sources) {
  for (const m of code.matchAll(/\bt\(\s*'([^']+)'/g)) literalKeys.add(m[1]);
  for (const m of code.matchAll(/\bt\(\s*"([^"]+)"/g)) literalKeys.add(m[1]);
  for (const m of code.matchAll(/\bt\(\s*`([^`$]+)\$\{/g)) dynamicPrefixes.add(m[1]);
}

test('copy.json: 코드가 글자 그대로 부르는 문구 키가 모두 있다', () => {
  assert.ok(literalKeys.size > 100, `문구 키를 너무 적게 찾았어요(${literalKeys.size}개) — 검사 정규식을 확인`);
  const missing = [...literalKeys].filter((key) => !(key in copy));
  assert.deepEqual(missing, [], `copy.json에 없는 키: ${missing.join(', ')}`);
});

test('copy.json: 값에 따라 달라지는 문구 키(목적·오류·열차 종류)는 모든 경우가 있다', () => {
  // 어떤 접두어를 코드가 쓰는지 먼저 확인한다(새 접두어가 생기면 아래 목록에 경우를 추가한다)
  const expected = {
    'meeting.purpose.': ['회식', '회의', '오락'],
    'meeting.purposeHint.': ['회식', '회의', '오락'],
    'meeting.error.': ['purpose', 'date', 'past'],
    'route.': ['express', 'local'],
  };
  for (const prefix of dynamicPrefixes) {
    assert.ok(prefix in expected, `검사 목록에 없는 동적 문구 접두어: ${prefix}`);
    for (const value of expected[prefix]) assert.ok(`${prefix}${value}` in copy, `copy.json에 없는 키: ${prefix}${value}`);
  }
  assert.ok(dynamicPrefixes.has('meeting.purpose.'));
});

test('copy.json: 값이 모두 비어 있지 않은 문자열이고, {자리}는 글자(\\w)로만 이루어진다', () => {
  for (const [key, value] of Object.entries(copy)) {
    assert.equal(typeof value, 'string', key);
    assert.ok(value.trim().length > 0, `빈 문구: ${key}`);
    for (const m of value.matchAll(/\{([^}]*)\}/g)) assert.match(m[1], /^\w+$/, `${key}의 자리 이름이 이상해요: {${m[1]}}`);
  }
});

test("copy.json: '지금 출발 기준'이라는 표현이 없다 (FUNC-009, CLAUDE.md 7장)", () => {
  for (const [key, value] of Object.entries(copy)) assert.ok(!value.includes('지금 출발 기준'), key);
});
