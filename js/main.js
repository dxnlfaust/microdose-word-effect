'use strict';
/* Microdose: the morphing title. Settings live in js/config.js, the lettering in js/styles.js. */
(() => {

/* ===================================================================== settings (see js/config.js) */
const CFG = window.MICRODOSE_CONFIG, STYLES = window.MICRODOSE_STYLES;
const MORPH_SECONDS = CFG.morphSeconds, STAGGER = CFG.stagger, EASE_POWER = CFG.easePower;
const PEN_COLOURS = CFG.penColours, REDUCED_HOLD = CFG.reducedHold;
const INK = CFG.ink, AUTHORS = CFG.authors, PALETTE = CFG.palette;

/* ===================================================================== basics */
const $ = s => document.querySelector(s);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const ease = t => t < .5 ? .5 * Math.pow(2 * t, EASE_POWER) : 1 - .5 * Math.pow(2 - 2 * t, EASE_POWER);
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const FW = 940, FH = 360;                      // each version is fitted into this box of the 1000 x 420 stage
const D = MORPH_SECONDS;

/* ===================================================================== geometry */
const meas = $('#meas');
const sampleCache = new WeakMap();
function sampleStroke(s) {
  let c = sampleCache.get(s); if (c) return c;
  meas.setAttribute('d', s.d);
  const L = meas.getTotalLength();
  const n = Math.max(2, Math.min(450, Math.ceil(L / 3)));
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { const p = meas.getPointAtLength(L * i / (n - 1)); a[2*i] = p.x; a[2*i+1] = p.y; }
  c = { pts: a, L }; sampleCache.set(s, c); return c;
}
const geomCache = new WeakMap();
function styleGeom(st) {
  let g = geomCache.get(st); if (g) return g;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  st.strokes.forEach(s => { const { pts } = sampleStroke(s);
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i+1]); y1 = Math.max(y1, pts[i+1]); } });
  const sc = Math.min(FW / Math.max(1, x1 - x0), FH / Math.max(1, y1 - y0)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const letters = Array.from({ length: 9 }, () => []);
  st.strokes.forEach((s, si) => {
    const { pts, L } = sampleStroke(s); const o = new Float32Array(pts.length); let sx = 0, sy = 0;
    for (let i = 0; i < pts.length; i += 2) { o[i] = (pts[i] - cx) * sc + 500; o[i+1] = (pts[i+1] - cy) * sc + 210; sx += o[i]; sy += o[i+1]; }
    const n = pts.length / 2; letters[s.a].push({ pts: o, rel: strokeWidths(o, st.id * 97 + si * 13 + 5), len: L * sc, cx: sx / n, cy: sy / n });
  });
  letters.forEach(l => l.sort((a, b) => a.cx - b.cx));
  g = { letters }; geomCache.set(st, g); return g;
}
/* resample a stroke (and its widths) to N evenly spaced points along its length */
function resample(pts, vals, N) {
  const n = pts.length / 2, out = new Float32Array(N * 2), ov = new Float32Array(N), cum = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i-1] + Math.hypot(pts[2*i] - pts[2*i-2], pts[2*i+1] - pts[2*i-1]);
  const L = cum[n-1];
  if (L < 1e-6) { for (let i = 0; i < N; i++) { out[2*i] = pts[0]; out[2*i+1] = pts[1]; ov[i] = vals[0]; } return { p: out, v: ov }; }
  let j = 0;
  for (let i = 0; i < N; i++) {
    const d = L * i / (N - 1);
    while (j < n - 2 && cum[j+1] < d) j++;
    const seg = cum[j+1] - cum[j] || 1, u = (d - cum[j]) / seg;
    out[2*i] = pts[2*j] + (pts[2*j+2] - pts[2*j]) * u; out[2*i+1] = pts[2*j+1] + (pts[2*j+3] - pts[2*j+1]) * u;
    ov[i] = vals[j] + (vals[j+1] - vals[j]) * u;
  }
  return { p: out, v: ov };
}
const ghostOf = (r, N) => { const m = N >> 1, o = new Float32Array(N * 2); for (let i = 0; i < N; i++) { o[2*i] = r.p[2*m]; o[2*i+1] = r.p[2*m+1]; } return { p: o, v: r.v }; };
function makePair(li, k, a, b) {
  const len = Math.max(a ? a.len : 0, b ? b.len : 0);
  const N = Math.max(10, Math.min(170, Math.round(len / 2.6)));
  let ra = a ? resample(a.pts, a.rel, N) : null, rb = b ? resample(b.pts, b.rel, N) : null;
  if (!ra) ra = ghostOf(rb, N);          // a stroke with no partner grows from, or shrinks into, a dot of its own width
  if (!rb) rb = ghostOf(ra, N);
  let pa = ra.p, pb = rb.p, wb = rb.v;
  if (a && b) {
    const f = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) + Math.hypot(pa[2*N-2] - pb[2*N-2], pa[2*N-1] - pb[2*N-1]);
    const r = Math.hypot(pa[0] - pb[2*N-2], pa[1] - pb[2*N-1]) + Math.hypot(pa[2*N-2] - pb[0], pa[2*N-1] - pb[1]);
    if (r < f) { const q = new Float32Array(N * 2), w2 = new Float32Array(N); for (let i = 0; i < N; i++) { q[2*i] = pb[2*(N-1-i)]; q[2*i+1] = pb[2*(N-1-i)+1]; w2[i] = wb[N-1-i]; } pb = q; wb = w2; }
  }
  const ax = new Float32Array(N), ay = new Float32Array(N), bx = new Float32Array(N), by = new Float32Array(N);
  for (let i = 0; i < N; i++) { ax[i] = pa[2*i]; ay[i] = pa[2*i+1]; bx[i] = pb[2*i]; by[i] = pb[2*i+1]; }
  return { N, ax, ay, bx, by, wa: ra.v, wb, g: a && b ? 0 : a ? 1 : 2,
           xs: new Float32Array(N), ys: new Float32Array(N), ws: new Float32Array(N) };
}
/* strokes of letter li in version A matched with strokes of the same letter in version B */
function buildTransition(A, B) {
  const ga = styleGeom(A), gb = styleGeom(B), by = [];
  for (let li = 0; li < 9; li++) {
    const sa = ga.letters[li], sb = gb.letters[li], cand = [], pairs = [];
    sa.forEach((a, i) => sb.forEach((b, j) => cand.push([Math.hypot(a.cx - b.cx, a.cy - b.cy) + .5 * Math.abs(a.len - b.len), i, j])));
    cand.sort((p, q) => p[0] - q[0]);
    const ua = new Set(), ub = new Set(), m = [];
    for (const [, i, j] of cand) { if (ua.has(i) || ub.has(j)) continue; ua.add(i); ub.add(j); m.push([i, j]); }
    sa.forEach((_, i) => { if (!ua.has(i)) m.push([i, -1]); });
    sb.forEach((_, j) => { if (!ub.has(j)) m.push([-1, j]); });
    m.forEach(([i, j], k) => pairs.push(makePair(li, k, i >= 0 ? sa[i] : null, j >= 0 ? sb[j] : null)));
    by.push(pairs);
  }
  return { by };
}

/* ===================================================================== ink shapes */
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const vnoise = (seed, x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const a = hash(seed * 57 + i), b = hash(seed * 57 + i + 1); return a + (b - a) * u; };
let penW = INK.width;

/* Pen width along ONE stroke: tapered ends, pressure wobble, ink pooling in tight turns.
   It depends only on the stroke itself and is worked out once, so a stroke looks exactly the same when a
   morph ends on it and when the next morph starts from it. Stored relative to the pen width. */
function strokeWidths(pts, seed) {
  const n = pts.length / 2, xs = new Float32Array(n), ys = new Float32Array(n), cum = new Float32Array(n), tmp = new Float32Array(n), rel = new Float32Array(n);
  for (let i = 0; i < n; i++) { xs[i] = pts[2*i]; ys[i] = pts[2*i+1]; }
  const W = INK.width;
  let L = 0;
  for (let i = 1; i < n; i++) { L += Math.hypot(xs[i] - xs[i-1], ys[i] - ys[i-1]); cum[i] = L; }
  if (L < .01) { rel.fill(1.6); return rel; }
  const tap = INK.taper * clamp01(L / 12), boost = 1 + .6 * clamp01((18 - L) / 18);
  const st = Math.min(2.4 * W, L * .3), en = Math.min(7 * W, L * .45);
  for (let i = 0; i < n; i++) {
    const s = cum[i];
    let k = Math.min(s / st, (L - s) / en, 1); k = k * k * (3 - 2 * k);
    let w = (1 - tap * .78 * (1 - k)) * boost;
    w *= 1 + (vnoise(seed, s / 46) - .5) * .55 * clamp01(L / 30);
    const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3);
    const ux = xs[i] - xs[a], uy = ys[i] - ys[a], vx = xs[b] - xs[i], vy = ys[b] - ys[i];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu > 1e-6 && lv > 1e-6) w *= 1 + .4 * Math.min(1, Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))) / 1.2);
    tmp[i] = w;
  }
  for (let i = 0; i < n; i++) {
    let a = 0, c = 0; for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < n) { a += tmp[j]; c++; }
    rel[i] = Math.max(.3, a / c);
  }
  return rel;
}

const txr = new Float32Array(1024), tyr = new Float32Array(1024), bx_ = new Float32Array(1024), by_ = new Float32Array(1024);
const lx = new Float32Array(1024), ly = new Float32Array(1024), rx = new Float32Array(1024), ry = new Float32Array(1024);
const f1 = v => (Math.round(v * 10) / 10);
/* outline of one stroke of varying width, as SVG path data */
function poly(xs, ys, ws, k) {
  if (k < 2) return '';
  let px = 1, py = 0;
  for (let i = 0; i < k; i++) {
    const a = Math.max(0, i - 1), b = Math.min(k - 1, i + 1);
    let tx = xs[b] - xs[a], ty = ys[b] - ys[a]; const l = Math.hypot(tx, ty);
    if (l > 1e-6) { tx /= l; ty /= l; px = tx; py = ty; } else { tx = px; ty = py; }
    txr[i] = tx; tyr[i] = ty;
  }
  for (let i = 0; i < k; i++) {
    const a = Math.max(0, i - 1), b = Math.min(k - 1, i + 1);
    let tx = txr[a] + txr[i] + txr[b], ty = tyr[a] + tyr[i] + tyr[b]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const h = ws[i] / 2, nx = -ty, ny = tx;
    lx[i] = xs[i] + nx * h; ly[i] = ys[i] + ny * h; rx[i] = xs[i] - nx * h; ry[i] = ys[i] - ny * h;
    bx_[i] = tx; by_[i] = ty;
  }
  let d = 'M' + f1(lx[0]) + ' ' + f1(ly[0]);
  for (let i = 1; i < k; i++) d += 'L' + f1(lx[i]) + ' ' + f1(ly[i]);
  { const i = k - 1, r = ws[i] / 2, th = Math.atan2(bx_[i], -by_[i]);
    for (let j = 1; j <= 4; j++) { const a = th - Math.PI * j / 5; d += 'L' + f1(xs[i] + r * Math.cos(a)) + ' ' + f1(ys[i] + r * Math.sin(a)); } }
  for (let i = k - 1; i >= 0; i--) d += 'L' + f1(rx[i]) + ' ' + f1(ry[i]);
  { const i = 0, r = ws[i] / 2, th = Math.atan2(bx_[i], -by_[i]);
    for (let j = 1; j <= 4; j++) { const a = th + Math.PI * (1 - j / 5); d += 'L' + f1(xs[i] + r * Math.cos(a)) + ' ' + f1(ys[i] + r * Math.sin(a)); } }
  return d + 'Z';
}

/* ===================================================================== playlist */
const N = STYLES.length;
const STY = STYLES.map((s, i) => ({ id: i, pen: s.pen, author: CFG.credits[s.id], strokes: s.s.map(([d, a]) => ({ d, a })) }));
const seq = [];
let bag = [];
let rng = Math.random;
function shuffled(n) { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function nextStyle() {
  if (!bag.length) { bag = shuffled(N); if (seq.length && bag[bag.length - 1] === seq[seq.length - 1] && N > 1) { const t = bag[0]; bag[0] = bag[bag.length - 1]; bag[bag.length - 1] = t; } }
  return bag.pop();
}
const ensure = k => { while (seq.length <= k) seq.push(nextStyle()); };
const transitions = new Map();
function getTransition(k) {
  let t = transitions.get(k);
  if (!t) { ensure(k + 1); t = buildTransition(STY[seq[k]], STY[seq[k + 1]]); transitions.set(k, t); transitions.delete(k - 3); }
  return t;
}
const colourOf = i => hexRGB(PALETTE[PEN_COLOURS ? STY[i].pen : 'pink']);

/* ===================================================================== the stage */
const stage = $('#stage'), svg = $('#title'), inkG = $('#inkG');
const letterEls = Array.from({ length: 9 }, () => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); inkG.append(p); return p; });

// apply the ink settings to the filter, and let #plain switch the texture off (handy for comparing speed)
$('#fDisp').setAttribute('scale', INK.wobble);
$('#fBleed').setAttribute('stdDeviation', Math.max(.01, INK.bleed));
$('#fFeather').setAttribute('stdDeviation', Math.max(.01, INK.feather));
$('#fGrain').setAttribute('k1', -INK.grain);
if (/plain/.test(location.hash)) inkG.removeAttribute('filter');

function resize() {
  const r = stage.getBoundingClientRect();
  const scale = Math.min(r.width / 1000, r.height / 420) || 1;
  penW = Math.max(INK.width, 2.3 / scale);           // keep the pen visible on small screens
}

/* ===================================================================== drawing one moment */
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let lastCredit = -1;

function letterState(T, li) {
  if (reduced.matches) return { k: Math.floor(T / REDUCED_HOLD), t: 0 };
  const u = Math.max(0, (T - STAGGER * D * li / 8) / D), k = Math.floor(u);
  return { k, t: u - k };
}
function draw(T) {
  for (let li = 0; li < 9; li++) {
    const { k, t } = letterState(T, li), e = ease(t);
    ensure(k + 1);
    const pairs = getTransition(k).by[li];
    let d = '';
    for (const p of pairs) {
      const { N: n, ax, ay, bx, by, wa, wb, xs, ys, ws } = p;
      const pres = p.g === 0 ? 1 : p.g === 1 ? 1 - e : e;
      if (pres < .03) continue;
      const wk = penW * pres;
      for (let i = 0; i < n; i++) { xs[i] = ax[i] + (bx[i] - ax[i]) * e; ys[i] = ay[i] + (by[i] - ay[i]) * e; ws[i] = (wa[i] + (wb[i] - wa[i]) * e) * wk; }
      d += poly(xs, ys, ws, n);
    }
    const ca = colourOf(seq[k]), cb = colourOf(seq[k + 1]);
    letterEls[li].setAttribute('d', d);
    letterEls[li].setAttribute('fill', `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * e)},${Math.round(ca[1] + (cb[1] - ca[1]) * e)},${Math.round(ca[2] + (cb[2] - ca[2]) * e)})`);
  }
  // the credit follows whichever version the middle of the word is closest to
  const m = letterState(T, 4), cur = seq[m.k + (m.t >= .5 ? 1 : 0)];
  if (cur !== lastCredit) setCredit(cur);
}

/* ===================================================================== credit */
const creditLink = $('#creditLink'), creditNow = $('.credit .now');
function hrefOf(u) { if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u; return u.includes('@') ? 'mailto:' + u : 'https://' + u; }
function setCredit(i) {
  lastCredit = i;
  const a = AUTHORS[STY[i].author];
  creditNow.style.visibility = a ? '' : 'hidden';          // a version with no credit just shows nothing
  if (!a) return;
  creditLink.textContent = a.name.toLowerCase(); creditLink.href = hrefOf(a.url);
}
// invisible copies of every credit give the box the width of the longest one
const sizer = $('#sizer');
Object.values(AUTHORS).forEach(a => { const s = document.createElement('span'); s.textContent = '— ' + a.name.toLowerCase(); sizer.append(s); });

/* ===================================================================== loop */
const idle = f => window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1000 }) : setTimeout(f, 80);
let T = 0, last = 0, lastK = -1, frozen = false;

function prefetch(k) {
  ensure(k + 3);
  idle(() => { styleGeom(STY[seq[k + 2]]); idle(() => { getTransition(k + 1); idle(() => getTransition(k + 2)); }); });
}
function tick(now) {
  const dt = Math.min(100, now - last); last = now;
  if (!frozen) T += dt / 1000;
  draw(T);
  const k0 = reduced.matches ? Math.floor(T / REDUCED_HOLD) : Math.floor(T / D);
  if (k0 !== lastK) { lastK = k0; prefetch(k0); }
  requestAnimationFrame(tick);
}

/* ===================================================================== start */
new ResizeObserver(() => { resize(); if (frozen) draw(T); }).observe(stage);
const hp = new URLSearchParams(location.hash.slice(1));      // #t=2.5 freezes the clock at 2.5 s, #s=3 starts on the 4th version (handy for checking a frame)
if (hp.get('seed') !== null) { let a = (+hp.get('seed') || 1) >>> 0; rng = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
if (hp.get('s') !== null && STY[+hp.get('s')]) seq.push(+hp.get('s'));
ensure(3);
if (hp.get('t') !== null) { frozen = true; T = parseFloat(hp.get('t')) || 0; }
resize();
getTransition(0);
requestAnimationFrame(now => { last = now; tick(now); });
})();
