// 生成示例图：用 SVG 画的平铺服装插画（2:3），只用于站点占位演示
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const W = 400, H = 600;

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
};

function pattern(id, kind, c) {
  const d = shade(c, 0.8);
  if (kind === 'stripe') return `<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="${c}"/><rect width="18" height="6" fill="${d}"/></pattern>`;
  if (kind === 'dot') return `<pattern id="${id}" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="${c}"/><circle cx="11" cy="11" r="3.4" fill="#ffffff" opacity=".85"/></pattern>`;
  if (kind === 'check') return `<pattern id="${id}" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="${c}"/><rect width="12" height="24" fill="${d}" opacity=".55"/><rect width="24" height="12" fill="${d}" opacity=".55"/></pattern>`;
  if (kind === 'floral') return `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="${c}"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="20" cy="14" rx="3" ry="6" fill="#fff" opacity=".8" transform="rotate(${a} 20 20)"/>`).join('')}<circle cx="20" cy="20" r="2.6" fill="#f3c94b"/></pattern>`;
  if (kind === 'knit') return `<pattern id="${id}" width="14" height="12" patternUnits="userSpaceOnUse"><rect width="14" height="12" fill="${c}"/><path d="M0 0 L7 8 L14 0" fill="none" stroke="${d}" stroke-width="2"/></pattern>`;
  return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${c}"/></pattern>`;
}

// 每个部件返回 SVG 片段，fill 使用图案 id
const P = {
  dress: (f, s) => `<path d="M160 70 Q200 92 240 70 L262 92 L248 150 Q246 175 252 200 L310 470 Q200 500 90 470 L148 200 Q154 175 152 150 L138 92 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M160 70 Q200 112 240 70" fill="none" stroke="${s}" stroke-width="2"/><path d="M152 198 Q200 214 248 198" fill="none" stroke="${s}" stroke-width="3"/>`,
  gown: (f, s) => `<path d="M165 80 L185 72 L200 100 L215 72 L235 80 L240 190 Q238 210 246 230 L340 520 Q200 556 60 520 L154 230 Q162 210 160 190 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M160 190 Q200 204 240 190" fill="none" stroke="${s}" stroke-width="3"/><path d="M200 240 L180 520 M200 240 L230 525" stroke="${s}" stroke-width="1.5" opacity=".5"/>`,
  coat: (f, s) => `<path d="M150 70 L200 96 L250 70 L320 110 L336 330 L300 336 L290 180 L284 470 L116 470 L110 180 L100 336 L64 330 L80 110 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M200 96 L200 470" stroke="${s}" stroke-width="2"/><path d="M150 70 L176 150 L200 96 M250 70 L224 150 L200 96" fill="${shade('#888888', 1)}" fill-opacity=".15" stroke="${s}" stroke-width="2"/>${[200, 260, 320, 380].map(y => `<circle cx="212" cy="${y}" r="5" fill="${s}"/>`).join('')}`,
  sweater: (f, s) => `<path d="M156 70 Q200 86 244 70 L320 104 L340 300 L304 306 L290 170 L292 300 L108 300 L110 170 L96 306 L60 300 L80 104 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M156 70 Q200 104 244 70" fill="none" stroke="${s}" stroke-width="4"/><rect x="108" y="286" width="184" height="16" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  tee: (f, s) => `<path d="M160 76 Q200 92 240 76 L306 104 L288 154 L268 146 L270 280 L130 280 L132 146 L112 154 L94 104 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M160 76 Q200 104 240 76" fill="none" stroke="${s}" stroke-width="2"/>`,
  cami: (f, s) => `<path d="M156 110 L166 70 M244 110 L234 70" stroke="${s}" stroke-width="3"/><path d="M150 110 Q200 130 250 110 L262 250 L138 250 Z" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  skirt: (f, s) => `<path d="M140 300 L260 300 L300 470 Q200 488 100 470 Z" fill="${f}" stroke="${s}" stroke-width="2"/><rect x="140" y="296" width="120" height="14" fill="${f}" stroke="${s}" stroke-width="2"/>${[160, 190, 220, 248].map(x => `<path d="M${x} 312 L${x + (x - 200) * 0.45} 472" stroke="${s}" stroke-width="1.2" opacity=".55"/>`).join('')}`,
  pants: (f, s) => `<path d="M136 310 L264 310 L282 520 L222 520 L200 380 L178 520 L118 520 Z" fill="${f}" stroke="${s}" stroke-width="2"/><rect x="136" y="304" width="128" height="14" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  shorts: (f, s) => `<path d="M140 300 L260 300 L274 410 L214 414 L200 360 L186 414 L126 410 Z" fill="${f}" stroke="${s}" stroke-width="2"/><rect x="140" y="294" width="120" height="14" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  bikini: (f, s) => `<path d="M150 150 Q170 120 196 150 Q184 190 150 186 Z M204 150 Q230 120 250 150 Q250 186 216 190 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M150 150 L176 90 L196 150 M204 150 L224 90 L250 150 M150 180 L120 190 M250 180 L280 190" fill="none" stroke="${s}" stroke-width="2"/><path d="M146 300 L254 300 Q240 350 200 372 Q160 350 146 300 Z" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  onepiece: (f, s) => `<path d="M160 90 L176 80 Q200 150 224 80 L240 90 L250 260 Q256 330 236 380 Q200 400 164 380 Q144 330 150 260 Z" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  lingerie: (f, s) => `<path d="M144 160 Q168 128 198 160 Q190 196 150 196 Z M202 160 Q232 128 256 160 Q250 196 210 196 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M150 196 Q200 210 250 196" stroke="${s}" stroke-width="3" fill="none"/><path d="M152 160 L170 96 M248 160 L230 96" stroke="${s}" stroke-width="2"/><path d="M148 310 L252 310 Q236 352 200 368 Q164 352 148 310 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M148 310 Q200 322 252 310" stroke="${s}" stroke-width="5" stroke-dasharray="3 3" fill="none"/>`,
  robe: (f, s) => `<path d="M150 72 L200 110 L250 72 L320 116 L336 300 L296 300 L284 200 L292 500 L108 500 L116 200 L104 300 L64 300 L80 116 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M150 72 L210 300 M250 72 L190 300" stroke="${s}" stroke-width="2"/><path d="M110 300 L290 300" stroke="${s}" stroke-width="6"/>`,
  shoes: (f, s, y = 540) => `<path d="M120 ${y} q0 -22 26 -22 l30 0 q8 18 0 30 l-48 0 q-8 0 -8 -8 Z M224 ${y} q0 -22 26 -22 l30 0 q8 18 0 30 l-48 0 q-8 0 -8 -8 Z" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  boots: (f, s) => `<path d="M128 470 l40 0 l0 70 l26 0 q6 14 -4 22 l-62 0 Z M232 470 l40 0 l0 70 l26 0 q6 14 -4 22 l-62 0 Z" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  hat: (f, s) => `<ellipse cx="320" cy="60" rx="56" ry="14" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M290 58 q30 -50 60 0" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  scarf: (f, s) => `<path d="M140 76 Q200 120 260 76 L268 96 Q200 140 132 96 Z M232 100 L248 230 L222 232 L214 110 Z" fill="${f}" stroke="${s}" stroke-width="2"/>`,
  bag: (f, s) => `<path d="M300 400 h64 l6 70 h-76 Z" fill="${f}" stroke="${s}" stroke-width="2"/><path d="M312 400 q20 -36 40 0" fill="none" stroke="${s}" stroke-width="3"/>`,
};

const SAMPLES = [
  ['春', 'SPR', [['tee', '#f6efe2', 'plain'], ['skirt', '#a9c7a0', 'floral'], ['shoes', '#e7c9a9', 'plain']], 'white t-shirt green floral skirt beige flats'],
  ['春', 'SPR', [['dress', '#f3c6cf', 'dot'], ['hat', '#e8d8b8', 'plain'], ['shoes', '#ffffff', 'plain']], 'pink polka-dot dress straw hat white shoes'],
  ['春', 'SPR', [['coat', '#d7c4a3', 'plain'], ['pants', '#3b4a63', 'plain'], ['shoes', '#6b4a33', 'plain']], 'beige trench coat navy pants brown loafers'],
  ['夏', 'SUM', [['cami', '#9cc8e8', 'stripe'], ['shorts', '#4b6fa5', 'plain'], ['shoes', '#f2e6cf', 'plain']], 'blue striped camisole denim shorts sandals'],
  ['夏', 'SUM', [['dress', '#fbe7a1', 'floral'], ['bag', '#d9b98a', 'plain']], 'yellow floral sundress woven bag'],
  ['夏', 'SUM', [['tee', '#ffffff', 'plain'], ['pants', '#c9d6c0', 'plain'], ['shoes', '#ffffff', 'plain']], 'white tee mint wide pants white sneakers'],
  ['秋', 'AUT', [['sweater', '#b8763f', 'knit'], ['skirt', '#5b4638', 'check'], ['boots', '#3a2a20', 'plain']], 'orange knit sweater brown check skirt boots'],
  ['秋', 'AUT', [['coat', '#7a3b3b', 'plain'], ['pants', '#2e2e2e', 'plain'], ['shoes', '#2b2b2b', 'plain']], 'burgundy wool coat black pants black loafers'],
  ['秋', 'AUT', [['dress', '#5f6b3a', 'plain'], ['scarf', '#c99a5b', 'check'], ['boots', '#6b4a33', 'plain']], 'olive midi dress khaki check scarf brown boots'],
  ['冬', 'WIN', [['coat', '#2f3a52', 'plain'], ['scarf', '#d8d2c8', 'knit'], ['boots', '#1f1f1f', 'plain']], 'navy long coat ivory knit muffler black boots'],
  ['冬', 'WIN', [['sweater', '#e9e2d6', 'knit'], ['pants', '#6d6d72', 'check'], ['boots', '#4a3a2e', 'plain']], 'cream turtleneck sweater grey check pants boots'],
  ['冬', 'WIN', [['coat', '#c9b49a', 'check'], ['skirt', '#262626', 'plain'], ['boots', '#262626', 'plain']], 'camel check coat black skirt long boots'],
  ['内衣', 'LIN', [['lingerie', '#f4d6dc', 'plain']], 'pink lace bra briefs set'],
  ['内衣', 'LIN', [['lingerie', '#1e1e24', 'plain']], 'black lace bra briefs set'],
  ['内衣', 'LIN', [['robe', '#e9dcf2', 'plain']], 'lavender satin robe'],
  ['派对', 'PTY', [['gown', '#7d1f2e', 'plain'], ['shoes', '#c9a24a', 'plain', 570]], 'burgundy velvet gown gold heels'],
  ['派对', 'PTY', [['gown', '#1b2140', 'dot'], ['shoes', '#c0c4cc', 'plain', 570]], 'navy sequin gown silver heels'],
  ['派对', 'PTY', [['dress', '#111111', 'plain'], ['bag', '#c9a24a', 'plain'], ['shoes', '#111111', 'plain']], 'black cocktail dress gold clutch black pumps'],
  ['泳装', 'SWM', [['bikini', '#ff8a65', 'plain']], 'orange bikini swimsuit'],
  ['泳装', 'SWM', [['onepiece', '#2a6fdb', 'stripe'], ['hat', '#efe1c0', 'plain']], 'blue striped one-piece swimsuit straw hat'],
  ['泳装', 'SWM', [['bikini', '#ffffff', 'dot']], 'white polka-dot bikini swimsuit'],
  ['性感', 'SXY', [['cami', '#8b1a2b', 'plain'], ['skirt', '#111111', 'plain'], ['shoes', '#111111', 'plain']], 'red satin camisole black leather mini skirt heels'],
  ['性感', 'SXY', [['gown', '#000000', 'plain'], ['shoes', '#8b1a2b', 'plain', 570]], 'black slit gown red heels'],
  ['性感', 'SXY', [['onepiece', '#3a1d2e', 'plain'], ['boots', '#111111', 'plain']], 'plum bodysuit black boots'],
];

const seq = {};
for (const [cat, code, parts, kw] of SAMPLES) {
  seq[code] = (seq[code] || 0) + 1;
  const id = `${code}-${String(seq[code]).padStart(4, '0')}`;
  const defs = parts.map(([, c, p], i) => pattern(`p${i}`, p, c)).join('');
  const body = parts.map(([k, c, , y], i) => P[k](`url(#p${i})`, shade(c, 0.55), y)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="1024" height="1536"><defs>${defs}<filter id="sh" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-opacity=".18"/></filter></defs><rect width="${W}" height="${H}" fill="#efeeec"/><g filter="url(#sh)">${body}</g></svg>`;
  const dir = join(ROOT, 'images', cat);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.svg`), svg);
  writeFileSync(join(dir, `${id}.txt`), kw);
}
console.log(`已生成 ${SAMPLES.length} 张示例图`);
