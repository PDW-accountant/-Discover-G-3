// 캐릭터 그림 (감이·택이·딜이) — 모이자 UI 프로토타입2의 SVG를 그대로 옮겼다.
// 그림 문자열은 이 파일의 고정 값만으로 만들어지고 사용자 입력은 들어가지 않는다.

const CHARS = {
  gam: { color: '#F2541B', face: [100, 124] },
  taek: { color: '#FFA53A', face: [100, 66] },
  dil: { color: '#FF7A1A', face: [114, 100] },
};
const SLOT = ['gam', 'taek', 'dil'];

const CHEEK = '<ellipse cx="-32" cy="16" rx="10" ry="6" fill="#FFC9B5"/><ellipse cx="32" cy="16" rx="10" ry="6" fill="#FFC9B5"/>';
const EYES = '<circle cx="-18" r="7"/><circle cx="-20" cy="-2.5" r="2.4" fill="#fff"/><circle cx="18" r="7"/><circle cx="16" cy="-2.5" r="2.4" fill="#fff"/>';
const FACES = {
  basic: `${CHEEK}${EYES}<path d="M-12 22 L2 22 Q13 21 18 10" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round"/>`,
  happy: `${CHEEK}<path d="M-25 3 Q-18 -8 -11 3M11 3 Q18 -8 25 3" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/><path d="M-11 15 Q0 34 11 15 Z" stroke="#000" stroke-width="3" stroke-linejoin="round"/><path d="M-5 25 Q0 30 5 25" fill="#FF8FA3"/>`,
};

function charBody(key) {
  const color = CHARS[key].color;
  if (key === 'dil') {
    return `<ellipse cx="88" cy="196" rx="14" ry="7"/><ellipse cx="140" cy="194" rx="14" ry="7"/><path d="M58 36 Q56 24 70 24 L96 24 C150 24 180 62 180 106 C180 152 146 190 94 190 L70 190 Q56 190 58 178 Z" fill="${color}" stroke="#000" stroke-width="6" stroke-linejoin="round"/><path d="M118 25 Q112 8 128 9" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>`;
  }
  if (key === 'taek') {
    const shape = '<rect x="16" y="40" width="168" height="58" rx="29" transform="rotate(-6 100 69)"/><rect x="64" y="70" width="72" height="122" rx="30"/>';
    return `<ellipse cx="84" cy="198" rx="14" ry="7"/><ellipse cx="118" cy="198" rx="14" ry="7"/><g fill="${color}" stroke="#000" stroke-width="10" stroke-linejoin="round">${shape}</g><g fill="${color}">${shape}</g><path d="M176 12 L179 21 L188 24 L179 27 L176 36 L173 27 L164 24 L173 21 Z" fill="#FFE14D" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`;
  }
  return `<ellipse cx="54" cy="196" rx="14" ry="7"/><ellipse cx="146" cy="196" rx="14" ry="7"/><path d="M100 22 C108 22 112 27 115 34 L179 174 Q184 190 168 190 L128 190 Q100 158 72 190 L32 190 Q16 190 21 174 L85 34 C88 27 92 22 100 22 Z" fill="${color}" stroke="#000" stroke-width="6" stroke-linejoin="round"/><path d="M100 58 L112 88 L88 88 Z" fill="#fff" stroke="#000" stroke-width="5" stroke-linejoin="round"/><path d="M100 25 Q99 16 103 13" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/><path d="M103 16 Q118 2 132 10 Q118 24 103 16 Z" fill="#45A34B" stroke="#000" stroke-width="4" stroke-linejoin="round"/>`;
}

/**
 * i번째 참여자의 캐릭터 SVG 문자열. 0~2번째는 감이·택이·딜이, 4번째부터는 동그란 기본 친구.
 * @param {number} index
 * @param {'basic'|'happy'} mood
 * @param {number} size 가로 픽셀
 */
export function characterSvg(index, mood = 'basic', size = 40) {
  const key = SLOT[index];
  const height = size * 1.075;
  if (!key) {
    return `<svg class="ch" viewBox="0 0 200 215" width="${size}" height="${height}" aria-hidden="true"><ellipse cx="80" cy="196" rx="14" ry="7"/><ellipse cx="120" cy="196" rx="14" ry="7"/><circle cx="100" cy="112" r="80" fill="#FFD2B0" stroke="#000" stroke-width="6"/><g transform="translate(100 108)">${FACES[mood]}</g></svg>`;
  }
  const [faceX, faceY] = CHARS[key].face;
  return `<svg class="ch" viewBox="0 0 200 215" width="${size}" height="${height}" aria-hidden="true">${charBody(key)}<g transform="translate(${faceX} ${faceY})">${FACES[mood]}</g></svg>`;
}

/** 화면에 붙일 수 있는 요소로 만든다. */
export function characterNode(index, mood = 'basic', size = 40) {
  const node = document.createElement('span');
  node.className = 'avatar';
  node.innerHTML = characterSvg(index, mood, size);
  return node;
}
