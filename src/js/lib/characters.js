// 캐릭터 그림 '모이자 친구들' 9명 — 1번부터 9번 참여자까지 순서대로 배정된다.
// 감이(A)·택이(T)·딜이(D)는 모이자 UI 프로토타입2의 SVG를 그대로 옮겼고, 길이(S)·톡이(C)·냠이(M)·뭉이(U)·콕이(Q)·땡이(L)는
// 콘텐츠팀 캐릭터 시안(10/6)을 같은 틀로 다시 그렸다(#73).
// 모두 viewBox 200×215, 검정 테두리 6, 주황·노랑 계열. 그림 문자열은 이 파일의 고정 값만으로 만들어지고 사용자 입력은 들어가지 않는다.

const FEET = (x1, x2, y = 196) => `<ellipse cx="${x1}" cy="${y}" rx="14" ry="7"/><ellipse cx="${x2}" cy="${y}" rx="14" ry="7"/>`;
const OUTLINE = 'stroke="#000" stroke-width="6" stroke-linejoin="round"';

// name: 캐릭터 이름(예시로 해보기 닉네임으로도 쓴다, 6자 이내). face: 얼굴 가운데 좌표. body(color): 몸통 SVG
const CHARS = {
  gam: {
    name: '감이', color: '#F2541B', face: [100, 124],
    body: (color) => `${FEET(54, 146)}<path d="M100 22 C108 22 112 27 115 34 L179 174 Q184 190 168 190 L128 190 Q100 158 72 190 L32 190 Q16 190 21 174 L85 34 C88 27 92 22 100 22 Z" fill="${color}" ${OUTLINE}/><path d="M100 58 L112 88 L88 88 Z" fill="#fff" stroke="#000" stroke-width="5" stroke-linejoin="round"/><path d="M100 25 Q99 16 103 13" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/><path d="M103 16 Q118 2 132 10 Q118 24 103 16 Z" fill="#45A34B" stroke="#000" stroke-width="4" stroke-linejoin="round"/>`,
  },
  taek: {
    name: '택이', color: '#FFA53A', face: [100, 66],
    body: (color) => {
      const shape = '<rect x="16" y="40" width="168" height="58" rx="29" transform="rotate(-6 100 69)"/><rect x="64" y="70" width="72" height="122" rx="30"/>';
      return `${FEET(84, 118, 198)}<g fill="${color}" stroke="#000" stroke-width="10" stroke-linejoin="round">${shape}</g><g fill="${color}">${shape}</g><path d="M176 12 L179 21 L188 24 L179 27 L176 36 L173 27 L164 24 L173 21 Z" fill="#FFE14D" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`;
    },
  },
  dil: {
    name: '딜이', color: '#FF7A1A', face: [114, 100],
    body: (color) => `<ellipse cx="88" cy="196" rx="14" ry="7"/><ellipse cx="140" cy="194" rx="14" ry="7"/><path d="M58 36 Q56 24 70 24 L96 24 C150 24 180 62 180 106 C180 152 146 190 94 190 L70 190 Q56 190 58 178 Z" fill="${color}" ${OUTLINE}/><path d="M118 25 Q112 8 128 9" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>`,
  },
  // ---- 4~9번: 콘텐츠팀 '모이자 친구들' (#73, 10/6) ----
  gil: {
    name: '길이', color: '#2EC4A6', face: [100, 112],
    body: (color) => {
      const s = 'M148 58 C132 28 52 30 52 74 C52 116 148 100 148 146 C148 188 66 190 50 158';
      return `${FEET(74, 128, 198)}<path d="${s}" fill="none" stroke="#000" stroke-width="66" stroke-linecap="round" stroke-linejoin="round"/><path d="${s}" fill="none" stroke="${color}" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/><path d="M152 34 L152 8" stroke="#000" stroke-width="5" stroke-linecap="round"/><path d="M152 8 L176 16 L152 24 Z" fill="#E8603C" stroke="#000" stroke-width="4" stroke-linejoin="round"/>`;
    },
  },
  tok: {
    name: '톡이', color: '#FFC93C', face: [78, 118],
    body: (color) => `${FEET(76, 122, 198)}<path d="M164 72 A76 76 0 1 0 164 152 L116 112 Z" fill="${color}" ${OUTLINE}/><path d="M136 8 L184 8 Q190 8 190 14 L190 32 Q190 38 184 38 L152 38 L142 48 L142 38 L136 38 Q130 38 130 32 L130 14 Q130 8 136 8 Z" fill="#fff" stroke="#000" stroke-width="4" stroke-linejoin="round"/><circle cx="147" cy="23" r="3.5"/><circle cx="160" cy="23" r="3.5"/><circle cx="173" cy="23" r="3.5"/>`,
  },
  nyam: {
    name: '냠이', color: '#FF7F8E', face: [100, 104],
    body: (color) => `${FEET(48, 152)}<path d="M28 190 L28 46 Q28 28 46 30 L72 32 L100 76 L128 32 L154 30 Q172 28 172 46 L172 190 L130 190 L130 132 L100 168 L70 132 L70 190 Z" fill="${color}" ${OUTLINE}/><path d="M138 120 Q131 132 138 138 Q145 132 138 120 Z" fill="#5AB4F5" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>`,
  },
  mung: {
    name: '뭉이', color: '#A98BEB', face: [100, 162],
    body: (color) => `${FEET(70, 130, 200)}<path d="M26 34 L82 34 L82 116 Q82 136 100 136 Q118 136 118 116 L118 34 L174 34 L174 132 Q174 194 100 194 Q26 194 26 132 Z" fill="${color}" ${OUTLINE}/><path d="M100 104 C86 92 84 76 94 72 C98 70 100 74 100 78 C100 74 102 70 106 72 C116 76 114 92 100 104 Z" fill="#FF7F8E" stroke="#000" stroke-width="4" stroke-linejoin="round"/>`,
  },
  kok: {
    name: '콕이', color: '#4DA8F5', face: [100, 120],
    body: (color) => `${FEET(84, 116, 200)}<path d="M100 194 L48 134 C20 104 24 52 58 32 C86 16 126 18 150 42 C182 76 178 112 152 134 Z" fill="${color}" ${OUTLINE}/><circle cx="100" cy="70" r="16" fill="#fff" stroke="#000" stroke-width="6"/>`,
  },
  ttaeng: {
    name: '땡이', color: '#7AC943', face: [128, 158],
    body: (color) => `${FEET(64, 150, 200)}<path d="M36 26 L86 26 L86 132 L174 132 L174 192 L36 192 Z" fill="${color}" ${OUTLINE}/><path d="M100 30 L114 22 M104 44 L120 42 M100 58 L114 64" stroke="#000" stroke-width="4" stroke-linecap="round"/>`,
  },
};
const SLOT = ['gam', 'taek', 'dil', 'gil', 'tok', 'nyam', 'mung', 'kok', 'ttaeng'];

/** 참여자 순서대로의 캐릭터 이름(1번 감이 … 9번 땡이). 예시로 해보기 닉네임과 짝을 맞춘다(#73). */
export const CHARACTER_NAMES = SLOT.map((key) => CHARS[key].name);

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
