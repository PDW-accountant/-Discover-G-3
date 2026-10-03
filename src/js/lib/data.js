// data/ 폴더의 JSON 읽기 + 화면 문구 (개발 C, 개발 A)
// 화면 문구는 코드에 직접 쓰지 않고 t('키', { 값 })로 data/copy.json에서 읽는다.

let cache = null;

/** data/의 JSON 5개를 한 번만 읽어 둔다. @returns {Promise<{stations, candidates, places, copy, demo}>} */
export async function loadData() {
  if (cache) return cache;
  const names = ['stations', 'candidates', 'places', 'copy', 'demo'];
  const files = await Promise.all(names.map((n) => fetch(`data/${n}.json`).then((r) => r.json())));
  cache = Object.fromEntries(names.map((n, i) => [n, files[i]]));
  return cache;
}

/** 문구 키를 찾아 {이름} 자리를 값으로 바꾼다. 키가 없으면 키 이름을 그대로 돌려준다. */
export function t(key, vars = {}) {
  const text = cache?.copy?.[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
