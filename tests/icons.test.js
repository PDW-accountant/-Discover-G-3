import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// 실행: npm test
// 탭·홈 화면 아이콘(#76): index.html이 가리키는 아이콘 파일이 모두 있고(없으면 콘솔에 404), 크기가 맞고,
// favicon.svg가 상단 로고(shell.js의 LOGO_SVG)와 같은 그림인지 확인한다.

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const html = read('index.html').toString('utf8');
const iconLinks = [...html.matchAll(/<link\s+rel="(icon|apple-touch-icon)"[^>]*>/g)].map((m) => ({ rel: m[1], href: /href="([^"]+)"/.exec(m[0])[1] }));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** PNG 머리(IHDR)에 적힌 가로·세로 */
const pngSize = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

test('index.html: 임시 빈 아이콘(data:,) 대신 favicon.svg·favicon.ico·apple-touch-icon.png를 가리킨다', () => {
  assert.ok(!html.includes('href="data:,"'), '임시 줄이 남아 있음');
  assert.deepEqual(iconLinks.map((l) => `${l.rel} ${l.href}`).sort(), ['apple-touch-icon apple-touch-icon.png', 'icon favicon.ico', 'icon favicon.svg']);
});

test('index.html이 가리키는 아이콘 파일이 모두 있다 (없으면 콘솔에 404)', () => {
  for (const { href } of iconLinks) assert.ok(existsSync(new URL(href, root)), href);
});

test('favicon.svg: 상단 로고(shell.js LOGO_SVG)와 같은 선·점에 앱 바탕색 둥근 사각형을 깐다', () => {
  const svg = read('favicon.svg').toString('utf8');
  const logo = /const LOGO_SVG = '([^']+)'/.exec(read('src/js/lib/shell.js').toString('utf8'))[1];
  const shapes = (s) => [...s.matchAll(/<(path|circle)\b[^>]*\/>/g)].map((m) => m[0]);
  assert.ok(shapes(logo).length >= 4);
  assert.deepEqual(shapes(svg), shapes(logo));
  assert.match(svg, /<rect\b[^>]*fill="#F9F6F1"/);
});

test('apple-touch-icon.png: 180×180 PNG', () => {
  const png = read('apple-touch-icon.png');
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);
  assert.deepEqual(pngSize(png), { width: 180, height: 180 });
});

test('favicon.ico: 32×32 그림 하나를 PNG로 담은 ICO', () => {
  const ico = read('favicon.ico');
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 1]); // 예약 0, 종류 1(아이콘), 그림 1개
  assert.deepEqual([ico[6], ico[7]], [32, 32]);
  const [size, offset] = [ico.readUInt32LE(14), ico.readUInt32LE(18)];
  assert.equal(offset + size, ico.length);
  const png = ico.subarray(offset);
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);
  assert.deepEqual(pngSize(png), { width: 32, height: 32 });
});
