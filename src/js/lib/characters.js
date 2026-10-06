// 캐릭터 그림 (감이·택이·딜이 + 4~9번) — 감이·택이·딜이는 모이자 UI 프로토타입2의 SVG를 그대로 옮겼다.
// 4~9번은 #73의 임시 그림이다(10/6, 이름 없음). 콘텐츠팀 그림이 오면 CHARS의 값만 바꾼다.
// 모두 viewBox 200×215, 검정 테두리 6, 주황·노랑 계열. 그림 문자열은 이 파일의 고정 값만으로 만들어지고 사용자 입력은 들어가지 않는다.

const FEET = (x1, x2, y = 196) => `<ellipse cx="${x1}" cy="${y}" rx="14" ry="7"/><ellipse cx="${x2}" cy="${y}" rx="14" ry="7"/>`;
const OUTLINE = 'stroke="#000" stroke-width="6" stroke-linejoin="round"';

// face: 얼굴 가운데 좌표. body(color): 몸통 SVG
const CHARS = {
  gam: {
    color: '#F2541B', face: [100, 124],
    body: (color) => `${FEET(54, 146)}<path d="M100 22 C108 22 112 27 115 34 L179 174 Q184 190 168 190 L128 190 Q100 158 72 190 L32 190 Q16 190 21 174 L85 34 C88 27 92 22 100 22 Z" fill="${color}" ${OUTLINE}/><path d="M100 58 L112 88 L88 88 Z" fill="#fff" stroke="#000" stroke-width="5" stroke-linejoin="round"/><path d="M100 25 Q99 16 103 13" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/><path d="M103 16 Q118 2 132 10 Q118 24 103 16 Z" fill="#45A34B" stroke="#000" stroke-width="4" stroke-linejoin="round"/>`,
  },
  taek: {
    color: '#FFA53A', face: [100, 66],
    body: (color) => {
      const shape = '<rect x="16" y="40" width="168" height="58" rx="29" transform="rotate(-6 100 69)"/><rect x="64" y="70" width="72" height="122" rx="30"/>';
      return `${FEET(84, 118, 198)}<g fill="${color}" stroke="#000" stroke-width="10" stroke-linejoin="round">${shape}</g><g fill="${color}">${shape}</g><path d="M176 12 L179 21 L188 24 L179 27 L176 36 L173 27 L164 24 L173 21 Z" fill="#FFE14D" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`;
    },
  },
  dil: {
    color: '#FF7A1A', face: [114, 100],
    body: (color) => `<ellipse cx="88" cy="196" rx="14" ry="7"/><ellipse cx="140" cy="194" rx="14" ry="7"/><path d="M58 36 Q56 24 70 24 L96 24 C150 24 180 62 180 106 C180 152 146 190 94 190 L70 190 Q56 190 58 178 Z" fill="${color}" ${OUTLINE}/><path d="M118 25 Q112 8 128 9" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>`,
  },
  // ---- 4~9번: 임시 그림 (#73) ----
  square: {
    color: '#FFC24B', face: [100, 112],
    body: (color) => `${FEET(66, 134)}<rect x="30" y="34" width="140" height="156" rx="34" fill="${color}" ${OUTLINE}/><path d="M100 34 Q96 18 110 12" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>`,
  },
  house: {
    color: '#E8603C', face: [100, 138],
    body: (color) => `${FEET(66, 134)}<rect x="132" y="34" width="22" height="44" fill="#FFC9B5" ${OUTLINE}/><path d="M100 18 L184 94 L164 94 L164 190 L36 190 L36 94 L16 94 Z" fill="${color}" ${OUTLINE}/>`,
  },
  cloud: {
    color: '#F7A58A', face: [104, 136],
    body: (color) => `${FEET(70, 134, 192)}<path d="M44 180 C14 180 10 132 42 124 C36 84 82 66 102 94 C114 56 170 62 166 108 C196 110 196 176 164 180 Z" fill="${color}" ${OUTLINE}/>`,
  },
  drop: {
    color: '#FF9A5A', face: [100, 140],
    body: (color) => `${FEET(72, 128, 198)}<path d="M100 14 C120 54 170 98 170 140 C170 178 138 192 100 192 C62 192 30 178 30 140 C30 98 80 54 100 14 Z" fill="${color}" ${OUTLINE}/><path d="M62 132 Q60 110 74 94" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  },
  hexagon: {
    color: '#F2785C', face: [100, 108],
    body: (color) => `${FEET(72, 128, 186)}<path d="M100 20 L174 62 L174 150 L100 192 L26 150 L26 62 Z" fill="${color}" ${OUTLINE}/>`,
  },
  dome: {
    color: '#FFB347', face: [100, 128],
    body: (color) => `${FEET(64, 136)}<path d="M22 188 Q22 38 100 30 Q178 38 178 188 Z" fill="${color}" ${OUTLINE}/><path d="M150 24 L153 33 L162 36 L153 39 L150 48 L147 39 L138 36 L147 33 Z" fill="#FFE14D" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`,
  },
};
const SLOT = ['gam', 'taek', 'dil', 'square', 'house', 'cloud', 'drop', 'hexagon', 'dome'];

/** 1~3번째 참여자의 캐릭터 이름. 예시로 해보기 닉네임과 짝을 맞춘다(#73). 4~9번 그림은 이름이 없다. */
export const CHARACTER_NAMES = ['감이', '택이', '딜이'];

const CHEEK = '<ellipse cx="-32" cy="16" rx="10" ry="6" fill="#FFC9B5"/><ellipse cx="32" cy="16" rx="10" ry="6" fill="#FFC9B5"/>';
const EYES = '<circle cx="-18" r="7"/><circle cx="-20" cy="-2.5" r="2.4" fill="#fff"/><circle cx="18" r="7"/><circle cx="16" cy="-2.5" r="2.4" fill="#fff"/>';
const FACES = {
  basic: `${CHEEK}${EYES}<path d="M-12 22 L2 22 Q13 21 18 10" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round"/>`,
  happy: `${CHEEK}<path d="M-25 3 Q-18 -8 -11 3M11 3 Q18 -8 25 3" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/><path d="M-11 15 Q0 34 11 15 Z" stroke="#000" stroke-width="3" stroke-linejoin="round"/><path d="M-5 25 Q0 30 5 25" fill="#FF8FA3"/>`,
};

/**
 * i번째 참여자의 캐릭터 SVG 문자열. 0~8번째(9명)는 서로 다른 캐릭터, 10번째부터는 동그란 기본 친구(인원 상한이 9라 실제로는 안 나옴).
 * @param {number} index
 * @param {'basic'|'happy'} mood
 * @param {number} size 가로 픽셀
 */
export function characterSvg(index, mood = 'basic', size = 40) {
  const key = SLOT[index];
  const height = size * 1.075;
  const face = FACES[mood] ?? FACES.basic;
  if (!key) {
    return `<svg class="ch" viewBox="0 0 200 215" width="${size}" height="${height}" aria-hidden="true"><ellipse cx="80" cy="196" rx="14" ry="7"/><ellipse cx="120" cy="196" rx="14" ry="7"/><circle cx="100" cy="112" r="80" fill="#FFD2B0" stroke="#000" stroke-width="6"/><g transform="translate(100 108)">${face}</g></svg>`;
  }
  const { color, face: [faceX, faceY], body } = CHARS[key];
  return `<svg class="ch" viewBox="0 0 200 215" width="${size}" height="${height}" aria-hidden="true">${body(color)}<g transform="translate(${faceX} ${faceY})">${face}</g></svg>`;
}

/** 화면에 붙일 수 있는 요소로 만든다. */
export function characterNode(index, mood = 'basic', size = 40) {
  const node = document.createElement('span');
  node.className = 'avatar';
  node.innerHTML = characterSvg(index, mood, size);
  return node;
}
