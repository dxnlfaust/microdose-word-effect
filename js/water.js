'use strict';
/* Microdose: ink in water.

   A small fluid simulation on the GPU (WebGL), the classic "stable fluids" recipe: the water's velocity is carried
   along by itself, kept swirling (vorticity confinement) and kept incompressible (a pressure solve); pigment is
   carried along by the water and slowly fades.

   The letters are the ink. Every frame js/main.js hands over the outline of each letter as it is at that moment;
   wherever a letter is, the water is full of pigment, so the word keeps bleeding into the water around it.
   While a morph is under way the strokes are moving, and they push the water as they go, so each morph stirs up
   the ink of the version before it.

   Pigment is stored per pen (pink, blue, red, black: one per colour channel), so each pen can separate into its own
   colours as it thins out, the way ink does on blotting paper.

   Used by js/main.js. Settings are in js/config.js under `water` and `pens`. */
window.MicrodoseWater = (() => {

const PENS = ['pink', 'blue', 'red', 'black'];
const TIERS = {                 // dye: pigment grid (long side). sim: water grid (short side). dpr: canvas pixel ratio cap
  high:   { dye: 1280, sim: 160, iters: 22, dpr: 2 },
  medium: { dye: 960,  sim: 128, iters: 18, dpr: 1.5 },
  low:    { dye: 640,  sim: 96,  iters: 14, dpr: 1 }
};
const ORDER = ['high', 'medium', 'low'];

/* ======================================================================== shaders */
const VS = `
precision highp float;
attribute vec2 aPosition;
varying vec2 vUv, vL, vR, vT, vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * .5 + .5;
  vL = vUv - vec2(texelSize.x, 0.); vR = vUv + vec2(texelSize.x, 0.);
  vT = vUv + vec2(0., texelSize.y); vB = vUv - vec2(0., texelSize.y);
  gl_Position = vec4(aPosition, 0., 1.);
}`;

const SPLAT_VS = `
precision highp float;
attribute vec4 aPoint;          // xy: position (0..1), zw: the stroke's velocity (sim cells per second)
uniform float uSize;
varying vec2 vPush;
void main () { gl_Position = vec4(aPoint.xy * 2. - 1., 0., 1.); gl_PointSize = uSize; vPush = aPoint.zw; }`;
const SPLAT_FS = `
precision mediump float;
varying vec2 vPush;
uniform float uGrip;
void main () { vec2 p = gl_PointCoord * 2. - 1.; float g = exp(-dot(p, p) * 3.5); gl_FragColor = vec4(vPush, 0., g * uGrip); }`;

const NOISE = `
float hash (vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise (vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}`;

/* the letters, drawn on the GPU as soft-edged strips (x, y in stage units, a = 1 inside the stroke, 0 at its soft edge) */
const MASK_VS = `
precision highp float;
attribute vec3 aV;
uniform vec3 uMap;              // stage units -> CSS px: scale, offset x, offset y
uniform vec2 uView;             // window size in CSS px
varying float vA;
void main () {
  vec2 c = (aV.xy * uMap.x + uMap.yz) / uView;
  gl_Position = vec4(c.x * 2. - 1., 1. - c.y * 2., 0., 1.);
  vA = aV.z;
}`;
const MASK_FS = `
precision mediump float;
uniform vec4 uW;                // how much of each pen this letter is right now
varying float vA;
void main () { gl_FragColor = uW * vA; }`;

/* slow currents (curl of a drifting noise field) and sinking pigment */
const FORCES_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity, uDye;
uniform vec2 uAspect;
uniform float dt, uTime, uDrift, uSink;
${NOISE}
float psi (vec2 p) { return vnoise(p) + .5 * vnoise(p * 2.03 + 7.1); }
void main () {
  vec2 p = vUv * uAspect * 1.3 + vec2(uTime * .017, -uTime * .011);
  float e = .02;
  vec2 c = vec2(psi(p + vec2(0., e)) - psi(p - vec2(0., e)), -(psi(p + vec2(e, 0.)) - psi(p - vec2(e, 0.)))) / (2. * e);
  vec4 d = texture2D(uDye, vUv);
  float dens = min(1.5, d.r + d.g + d.b + d.a);
  vec2 v = texture2D(uVelocity, vUv).xy;
  v += dt * (uDrift * c - vec2(0., uSink * dens));
  gl_FragColor = vec4(v, 0., 1.);
}`;

const CURL_FS = `
precision mediump float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y, R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x, B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(.5 * (R - L - T + B), 0., 0., 1.);
}`;

const VORTICITY_FS = `
precision highp float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity, uCurl;
uniform float curl, dt;
void main () {
  float L = texture2D(uCurl, vL).x, R = texture2D(uCurl, vR).x, T = texture2D(uCurl, vT).x, B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 f = .5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + .0001; f *= curl * C; f.y *= -1.;
  vec2 v = texture2D(uVelocity, vUv).xy + f * dt;
  gl_FragColor = vec4(clamp(v, -1000., 1000.), 0., 1.);
}`;

const DIVERGENCE_FS = `
precision mediump float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x, R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y, B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.) L = -C.x; if (vR.x > 1.) R = -C.x; if (vT.y > 1.) T = -C.y; if (vB.y < 0.) B = -C.y;
  gl_FragColor = vec4(.5 * (R - L + T - B), 0., 0., 1.);
}`;

const SCALE_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`;

const PRESSURE_FS = `
precision mediump float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uPressure, uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
  float div = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - div) * .25, 0., 0., 1.);
}`;

const GRADIENT_FS = `
precision mediump float;
varying vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uPressure, uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
  vec2 v = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
  gl_FragColor = vec4(v, 0., 1.);
}`;

const ADVECT_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity, uSource;
uniform vec2 texelSize, dyeTexelSize;
uniform float dt, dissipation;
vec4 bilerp (sampler2D sam, vec2 uv, vec2 ts) {
  vec2 st = uv / ts - .5, i = floor(st), f = fract(st);
  vec4 a = texture2D(sam, (i + vec2(.5, .5)) * ts), b = texture2D(sam, (i + vec2(1.5, .5)) * ts);
  vec4 c = texture2D(sam, (i + vec2(.5, 1.5)) * ts), d = texture2D(sam, (i + vec2(1.5, 1.5)) * ts);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main () {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 r = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  vec4 r = texture2D(uSource, coord);
#endif
  gl_FragColor = r / (1. + dissipation * dt);
}`;

/* second half of MacCormack advection: correct the plain result with its own round-trip error, then clamp it to the
   values it came from so it can't overshoot. Keeps fine filaments sharp instead of blurring them. */
const MACCORMACK_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity, uSource, uHat;
uniform vec2 texelSize, dyeTexelSize;
uniform float dt, dissipation;
void main () {
  vec2 v = texture2D(uVelocity, vUv).xy * texelSize;
  vec4 hat = texture2D(uHat, vUv);
  vec4 r = hat + .5 * (texture2D(uSource, vUv) - texture2D(uHat, vUv + dt * v));
  vec2 st = (vUv - dt * v) / dyeTexelSize - .5, i = floor(st);
  vec4 a = texture2D(uSource, (i + vec2(.5, .5)) * dyeTexelSize), b = texture2D(uSource, (i + vec2(1.5, .5)) * dyeTexelSize);
  vec4 c = texture2D(uSource, (i + vec2(.5, 1.5)) * dyeTexelSize), d = texture2D(uSource, (i + vec2(1.5, 1.5)) * dyeTexelSize);
  r = clamp(r, min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
  gl_FragColor = r / (1. + dissipation * dt);
}`;

/* the letters put pigment into the water: full strength under the ink, and a soft bleed around it */
const INJECT_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye, uMask;
uniform vec2 uMaskTexel;
uniform float uSeep, dt;
vec4 maskAt (vec2 uv) { return texture2D(uMask, uv); }   // one pen per channel: pink, blue, red, black
void main () {
  vec4 d = texture2D(uDye, vUv);
  vec4 m = maskAt(vUv);
  vec2 o = uMaskTexel * 3.;
  vec4 halo = (maskAt(vUv + vec2(o.x, 0.)) + maskAt(vUv - vec2(o.x, 0.)) + maskAt(vUv + vec2(0., o.y)) + maskAt(vUv - vec2(0., o.y))
             + maskAt(vUv + o) + maskAt(vUv - o) + maskAt(vUv + vec2(o.x, -o.y)) + maskAt(vUv + vec2(-o.x, o.y))) * .125;
  vec4 add = (m * 2.6 + halo * .25) * uSeep * dt;
  gl_FragColor = min(d + add, max(d, vec4(.85)));
}`;

/* a soft copy of the letters, for the white glow: one pass of a gaussian blur along uStep (run once across, once down).
   uChan picks what to blur: all four pens at once on the way in, then just the red channel on the way out. */
const GLOW_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uStep;             // one tap, in texture coordinates
uniform vec4 uChan;
void main () {
  float s = 0., ws = 0.;
  for (int i = -6; i <= 6; i++) {
    float f = float(i), w = exp(-f * f / 11.52);          // sigma = 2.4 taps
    s += w * min(1., dot(texture2D(uSrc, vUv + uStep * f), uChan));
    ws += w;
  }
  gl_FragColor = vec4(s / ws, 0., 0., 1.);
}`;

/* what you see: crisp letters over pigment clouds that separate into their pen's colours as they thin out,
   with the faint parts printed as halftone dots */
const DISPLAY_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye, uMask, uGlow;
uniform vec3 uCore[4], uMid[4], uFar[4];
uniform vec2 uRes;
uniform float uStrength, uHalftone, uCell, uGrain, uWobble, uHalo;
${NOISE}
vec4 maskAt (vec2 uv) { return texture2D(uMask, uv); }   // one pen per channel: pink, blue, red, black
vec3 ramp (int i, float t) {
  vec3 c = vec3(0.), m = vec3(0.), f = vec3(0.);
  if (i == 0) { c = uCore[0]; m = uMid[0]; f = uFar[0]; }
  else if (i == 1) { c = uCore[1]; m = uMid[1]; f = uFar[1]; }
  else if (i == 2) { c = uCore[2]; m = uMid[2]; f = uFar[2]; }
  else { c = uCore[3]; m = uMid[3]; f = uFar[3]; }
  return t < .5 ? mix(f, m, t * 2.) : mix(m, c, t * 2. - 1.);
}
float dots (vec2 px, float ang, float a) {
  float s = sin(ang), c = cos(ang);
  vec2 q = mat2(c, -s, s, c) * px / uCell;
  float r = sqrt(a) * .64, dist = length(fract(q) - .5), aa = .9 / uCell;
  return 1. - smoothstep(r - aa, r + aa, dist);
}
void main () {
  vec2 px = vUv * uRes;
  vec2 w = (vec2(vnoise(px * .045), vnoise(px * .045 + 17.3)) - .5) * uWobble / uRes;
  vec4 m = maskAt(vUv + w);
  float ms = m.r + m.g + m.b + m.a;
  float core = smoothstep(.3, .62, min(1., ms));
  vec3 coreCol = (m.r * uCore[0] + m.g * uCore[1] + m.b * uCore[2] + m.a * uCore[3]) / max(ms, 1e-4);

  vec4 d = texture2D(uDye, vUv);
  vec3 acc = vec3(0.); float sum = 0., keep = 1.;
  for (int i = 0; i < 4; i++) {
    float di = i == 0 ? d.r : i == 1 ? d.g : i == 2 ? d.b : d.a;
    if (di < .002) continue;
    float a = 1. - exp(-uStrength * pow(di, 1.5));
    float ang = i == 0 ? .2618 : i == 1 ? 1.309 : i == 2 ? 0. : .7854;     // 15, 75, 0, 45 degrees, like CMYK screens
    float ht = dots(px, ang, a);
    a = mix(a, ht, uHalftone * (1. - smoothstep(.22, .6, a)));
    vec3 col = ramp(i, clamp(di * 1.15, 0., 1.));
    acc += col * a; sum += a; keep *= 1. - a;
  }
  float cloudA = (1. - keep) * .86;
  // the white glow: pigment right beside a letter is washed out towards white, fading away with distance
  float halo = uHalo * smoothstep(.02, .42, texture2D(uGlow, vUv + w).r);
  vec3 cloud = sum > 0. ? mix(acc / sum, vec3(1.), halo) : vec3(0.);
  float A = cloudA + core * (1. - cloudA);
  vec3 col = mix(cloud, coreCol, core);
  A *= 1. - uGrain * hash(floor(px) + .37) * (.35 + .65 * core);
  gl_FragColor = vec4(col * A, A);
}`;

/* ======================================================================== helpers */
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

function create(canvas, opts) {
  const W = opts.water || {}, PALETTE = opts.pens;
  const params = { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  let gl = canvas.getContext('webgl2', params);
  const isGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
  if (!gl) return null;

  /* ---- texture formats ---- */
  let halfType, linear, fmtRGBA, fmtRG, fmtR;
  if (isGL2) {
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
    halfType = gl.HALF_FLOAT; linear = true;
    fmtRGBA = [gl.RGBA16F, gl.RGBA]; fmtRG = [gl.RG16F, gl.RG]; fmtR = [gl.R16F, gl.RED];
  } else {
    const hf = gl.getExtension('OES_texture_half_float');
    if (!hf) return null;
    gl.getExtension('EXT_color_buffer_half_float');
    halfType = hf.HALF_FLOAT_OES; linear = !!gl.getExtension('OES_texture_half_float_linear');
    fmtRGBA = fmtRG = fmtR = [gl.RGBA, gl.RGBA];
  }
  function renderable(fmt) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], 4, 4, 0, fmt[1], halfType, null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.deleteTexture(t);
    return ok;
  }
  if (!renderable(fmtRGBA)) return null;
  if (isGL2 && !renderable(fmtRG)) fmtRG = fmtRGBA;
  if (isGL2 && !renderable(fmtR)) fmtR = fmtRG;

  /* ---- programs ---- */
  function shader(type, src, defs) {
    const s = gl.createShader(type);
    gl.shaderSource(s, (defs ? defs.map(d => '#define ' + d + '\n').join('') : '') + src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs, defs) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs, defs));
    gl.bindAttribLocation(p, 0, 'aPosition'); gl.bindAttribLocation(p, 0, 'aPoint'); gl.bindAttribLocation(p, 0, 'aV');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, name); }
    return { p, u };
  }
  let P;
  try {
    P = {
      splat: program(SPLAT_VS, SPLAT_FS), mask: program(MASK_VS, MASK_FS), forces: program(VS, FORCES_FS), curl: program(VS, CURL_FS),
      vorticity: program(VS, VORTICITY_FS), divergence: program(VS, DIVERGENCE_FS), scale: program(VS, SCALE_FS),
      pressure: program(VS, PRESSURE_FS), gradient: program(VS, GRADIENT_FS),
      advect: program(VS, ADVECT_FS, linear ? null : ['MANUAL_FILTERING']), inject: program(VS, INJECT_FS), glow: program(VS, GLOW_FS), display: program(VS, DISPLAY_FS),
      mac: linear ? program(VS, MACCORMACK_FS) : null
    };
  } catch (e) { console.warn('Microdose water: falling back to the classic look.', e); return null; }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pointBuf = gl.createBuffer(), shapeBuf = gl.createBuffer();
  const minmax = isGL2 ? gl.MAX : (gl.getExtension('EXT_blend_minmax') || {}).MAX_EXT;
  const maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;

  /* ---- render targets ---- */
  function target(w, h, fmt, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], w, h, 0, fmt[1], halfType, null);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h, tx: 1 / w, ty: 1 / h };
  }
  function double(w, h, fmt, filter) {
    let a = target(w, h, fmt, filter), b = target(w, h, fmt, filter);
    return { get read () { return a; }, get write () { return b; }, swap () { const t = a; a = b; b = t; }, w, h, tx: 1 / w, ty: 1 / h };
  }
  function free(t) { if (!t) return; for (const x of t.read ? [t.read, t.write] : [t]) { gl.deleteTexture(x.tex); gl.deleteFramebuffer(x.fbo); } }

  /* ---- the letter mask: one 8-bit texture, a pen per channel ---- */
  function target8(w, h) {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, isGL2 ? gl.RGBA8 : gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  /* ---- sizes ---- */
  let tier = W.quality && TIERS[W.quality] ? W.quality : (matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600 ? 'medium' : 'high');
  const autoQ = !(W.quality && TIERS[W.quality]);
  let cw = 0, ch = 0, vel, dyeT, dyeTmp, divT, curlT, presT, maskT, glowA, glowB, mw = 0, mh = 0;
  let map = { s: 1, ox: 0, oy: 0 }, k = 1;          // stage units -> CSS px -> mask px
  function resize(force) {
    const t = TIERS[tier], dpr = Math.min(window.devicePixelRatio || 1, t.dpr);
    const vw = canvas.clientWidth || innerWidth, vh = canvas.clientHeight || innerHeight;
    const w = Math.max(1, Math.round(vw * dpr)), h = Math.max(1, Math.round(vh * dpr));
    const aspect = vw / vh;
    const sw = aspect >= 1 ? Math.round(t.sim * aspect) : t.sim, sh = aspect >= 1 ? t.sim : Math.round(t.sim / aspect);
    const dl = Math.min(t.dye, Math.max(w, h));
    const dw = aspect >= 1 ? dl : Math.round(dl * aspect), dh = aspect >= 1 ? Math.round(dl / aspect) : dl;
    if (!force && w === canvas.width && h === canvas.height && vel && vel.w === sw && dyeT && dyeT.w === dw) return;
    canvas.width = w; canvas.height = h; cw = vw; ch = vh;
    free(vel); free(dyeT); free(dyeTmp); free(divT); free(curlT); free(presT); free(maskT); free(glowA); free(glowB);
    const lf = linear ? gl.LINEAR : gl.NEAREST;
    vel = double(sw, sh, fmtRG, lf); presT = double(sw, sh, fmtR, gl.NEAREST);
    divT = target(sw, sh, fmtR, gl.NEAREST); curlT = target(sw, sh, fmtR, gl.NEAREST);
    dyeT = double(dw, dh, fmtRGBA, lf); dyeTmp = P.mac ? target(dw, dh, fmtRGBA, lf) : null;
    mw = dw; mh = dh; maskT = target8(mw, mh); glowA = target8(mw, mh); glowB = target8(mw, mh); k = mw / vw;
  }

  /* ---- uniforms that rarely change ---- */
  const pens = PENS.map(n => PALETTE[n] || PALETTE.pink);
  const core = new Float32Array(12), mid = new Float32Array(12), far = new Float32Array(12);
  pens.forEach((p, i) => { core.set(hexRGB(p.core), i * 3); mid.set(hexRGB(p.mid), i * 3); far.set(hexRGB(p.far), i * 3); });
  const num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
  const S = {
    seep: num(W.seep, 1), stir: num(W.stir, 1), swirl: num(W.swirl, 1), drift: num(W.drift, 1), sink: num(W.sink, 1),
    linger: Math.max(.05, num(W.linger, 1)), strength: num(W.strength, 1), halftone: num(W.halftone, .55),
    dot: Math.max(2, num(W.dotSize, 5)), grain: num(W.grain, .22), wobble: num(W.wobble, 1),
    glow: Math.max(0, Math.min(1, num(W.glow, .9))), glowSize: Math.max(.2, num(W.glowSize, 1.8))
  };

  const LIVE = ['seep', 'stir', 'sink', 'strength', 'glow'];
  const ALL = new Float32Array([1, 1, 1, 1]), RED = new Float32Array([1, 0, 0, 0]);    // which channels the glow blur reads

  /* ---- drawing passes ---- */
  function bindQuad() { gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
  function use(prog) { gl.useProgram(prog.p); return prog.u; }
  function tex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); return unit; }
  function blit(dst) {
    if (dst) { gl.viewport(0, 0, dst.w, dst.h); gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---- what main.js feeds in each frame ---- */
  let pts = new Float32Array(4 * 4096), npts = 0, speedSum = 0, seepNow = .4;
  let vb = new Float32Array(3 * 65536), nv = 0, drawFrom = 0;
  const draws = [];
  function begin() { npts = 0; speedSum = 0; nv = 0; drawFrom = 0; draws.length = 0; }
  function vert(x, y, a) {
    if (nv * 3 + 3 > vb.length) { const b = new Float32Array(vb.length * 2); b.set(vb); vb = b; }
    const i = nv * 3; vb[i] = x; vb[i+1] = y; vb[i+2] = a; nv++;
  }
  function strip(ax, ay, aa, bx, by, ba, cx, cy, ca, dx, dy, da) {   // edge a-b and edge c-d
    vert(ax, ay, aa); vert(cx, cy, ca); vert(bx, by, ba);
    vert(bx, by, ba); vert(cx, cy, ca); vert(dx, dy, da);
  }
  const TX = new Float32Array(1024), TY = new Float32Array(1024), SX = new Float32Array(1024), SY = new Float32Array(1024);
  function cap(x, y, nx, ny, tx, ty, h, f) {   // a round end: half a disc facing (tx, ty), with a soft rim
    const K = 6;
    let px = x + nx * h, py = y + ny * h, qx = x + nx * (h + f), qy = y + ny * (h + f);
    for (let j = 1; j <= K; j++) {
      const th = Math.PI * j / K, c = Math.cos(th), s = Math.sin(th);
      const dx = nx * c + tx * s, dy = ny * c + ty * s;
      const ux = x + dx * h, uy = y + dy * h, wx = x + dx * (h + f), wy = y + dy * (h + f);
      vert(x, y, 1); vert(px, py, 1); vert(ux, uy, 1);
      strip(px, py, 1, ux, uy, 1, qx, qy, 0, wx, wy, 0);
      px = ux; py = uy; qx = wx; qy = wy;
    }
  }
  /* one stroke of the current letter: centreline points and widths, in stage units */
  function stroke(xs, ys, ws, n) {
    if (n < 2) return;
    const f = 1.3 / (k * map.s);                     // soft edge: about one pigment-grid cell
    let px = 1, py = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = xs[b] - xs[a], ty = ys[b] - ys[a]; const l = Math.hypot(tx, ty);
      if (l > 1e-6) { tx /= l; ty /= l; px = tx; py = ty; } else { tx = px; ty = py; }
      TX[i] = tx; TY[i] = ty;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = TX[a] + TX[i] + TX[b], ty = TY[a] + TY[i] + TY[b]; const l = Math.hypot(tx, ty) || 1;
      SX[i] = tx / l; SY[i] = ty / l;
    }
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1;
      const h0 = ws[i] / 2, h1 = ws[j] / 2, n0x = -SY[i], n0y = SX[i], n1x = -SY[j], n1y = SX[j];
      const x0 = xs[i], y0 = ys[i], x1 = xs[j], y1 = ys[j];
      strip(x0 + n0x * (h0 + f), y0 + n0y * (h0 + f), 0, x1 + n1x * (h1 + f), y1 + n1y * (h1 + f), 0,
           x0 + n0x * h0, y0 + n0y * h0, 1, x1 + n1x * h1, y1 + n1y * h1, 1);
      strip(x0 + n0x * h0, y0 + n0y * h0, 1, x1 + n1x * h1, y1 + n1y * h1, 1,
           x0 - n0x * h0, y0 - n0y * h0, 1, x1 - n1x * h1, y1 - n1y * h1, 1);
      strip(x0 - n0x * h0, y0 - n0y * h0, 1, x1 - n1x * h1, y1 - n1y * h1, 1,
           x0 - n0x * (h0 + f), y0 - n0y * (h0 + f), 0, x1 - n1x * (h1 + f), y1 - n1y * (h1 + f), 0);
    }
    const e = n - 1;
    cap(xs[e], ys[e], -SY[e], SX[e], SX[e], SY[e], ws[e] / 2, f);
    cap(xs[0], ys[0], SY[0], -SX[0], -SX[0], -SY[0], ws[0] / 2, f);
  }
  /* finish a letter: w = how much of each pen it is right now (it changes pen mid-morph) */
  function letter(w) {
    if (nv > drawFrom) draws.push({ from: drawFrom, count: nv - drawFrom, w: [w[0], w[1], w[2], w[3]] });
    drawFrom = nv;
  }
  /* a moving piece of stroke pushes the water: position and velocity in stage units (per second) */
  function push(x, y, vx, vy) {
    if (npts * 4 + 4 > pts.length) { if (pts.length >= 4 * 32768) return; const b = new Float32Array(pts.length * 2); b.set(pts); pts = b; }
    const s = map.s, u = (x * s + map.ox) / cw, v = 1 - (y * s + map.oy) / ch;
    const toCells = s * vel.w / cw * .75 * S.stir;
    speedSum += Math.hypot(vx, vy);
    const i = npts * 4; pts[i] = u; pts[i+1] = v; pts[i+2] = vx * toCells; pts[i+3] = -vy * toCells; npts++;
  }
  /* the thinnest stroke (in stage units) that still shows up on the pigment grid */
  const minWidth = () => 2.2 / (k * map.s);

  /* ---- one step of the water, then draw it ---- */
  let time = 0, frames = 0, slow = 0, lastNow = 0;
  function end(dtIn) {
    const dt = Math.min(1 / 30, Math.max(1 / 240, dtIn || 1 / 60));
    time += dt;
    // how much pigment the letters release: a little at rest, a lot while the strokes are moving
    const motion = npts ? speedSum / npts : 0, target = .12 + Math.min(2.8, motion / 80);
    seepNow += (target - seepNow) * Math.min(1, dt * 4);
    gl.disable(gl.BLEND);
    bindQuad();

    // the letters, into the mask
    gl.bindFramebuffer(gl.FRAMEBUFFER, maskT.fbo); gl.viewport(0, 0, mw, mh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (draws.length) {
      const u = use(P.mask);
      gl.uniform3f(u.uMap, map.s, map.ox, map.oy); gl.uniform2f(u.uView, cw, ch);
      gl.bindBuffer(gl.ARRAY_BUFFER, shapeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, vb.subarray(0, nv * 3), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      if (minmax) gl.blendEquation(minmax);          // overlapping strokes merge rather than add up
      for (const d of draws) { gl.uniform4f(u.uW, d.w[0], d.w[1], d.w[2], d.w[3]); gl.drawArrays(gl.TRIANGLES, d.from, d.count); }
      gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND);
      bindQuad();
    }

    // a soft copy of the mask for the white glow: blur across, then down. Its width follows the pen as drawn on screen.
    // A wide blur takes widely spaced taps, which would pick up thin strokes as streaks, so a wide one is built from a
    // tight blur (one texel per tap) followed by the rest of the width on top of it.
    if (S.glow > 0) {
      const sigma = Math.max(1.6, S.glowSize * 3 * map.s * k), step = Math.max(.5, sigma / 2.4);
      const u = use(P.glow);
      const pass = (src, chan, st, dx, dy, dst) => {
        gl.uniform1i(u.uSrc, tex(0, src.tex)); gl.uniform4fv(u.uChan, chan); gl.uniform2f(u.uStep, dx * st / mw, dy * st / mh); blit(dst);
      };
      const first = step > 1 ? 1 : step;
      pass(maskT, ALL, first, 1, 0, glowA); pass(glowA, RED, first, 0, 1, glowB);
      if (step > 1) { const rest = Math.sqrt(step * step - 1); pass(glowB, RED, rest, 1, 0, glowA); pass(glowA, RED, rest, 0, 1, glowB); }
    }

    // moving strokes push the water
    if (npts) {
      const u = use(P.splat);
      gl.uniform1f(u.uSize, Math.min(maxPoint, Math.max(5, vel.h * .085)));
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pts.subarray(0, npts * 4), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.uniform1f(u.uGrip, .3);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.viewport(0, 0, vel.w, vel.h); gl.bindFramebuffer(gl.FRAMEBUFFER, vel.read.fbo);
      gl.drawArrays(gl.POINTS, 0, npts);
      gl.disable(gl.BLEND);
      bindQuad();
    }

    // currents and sinking pigment
    let u = use(P.forces);
    gl.uniform2f(u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uVelocity, tex(0, vel.read.tex)); gl.uniform1i(u.uDye, tex(1, dyeT.read.tex));
    gl.uniform2f(u.uAspect, cw / ch, 1); gl.uniform1f(u.dt, dt); gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uDrift, 1.3 * S.drift); gl.uniform1f(u.uSink, 9 * S.sink);
    blit(vel.write); vel.swap();

    // swirl
    u = use(P.curl); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform1i(u.uVelocity, tex(0, vel.read.tex)); blit(curlT);
    u = use(P.vorticity); gl.uniform2f(u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uVelocity, tex(0, vel.read.tex)); gl.uniform1i(u.uCurl, tex(1, curlT.tex));
    gl.uniform1f(u.curl, 14 * S.swirl); gl.uniform1f(u.dt, dt);
    blit(vel.write); vel.swap();

    // keep the water incompressible
    u = use(P.divergence); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform1i(u.uVelocity, tex(0, vel.read.tex)); blit(divT);
    u = use(P.scale); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform1i(u.uTexture, tex(0, presT.read.tex)); gl.uniform1f(u.value, .8);
    blit(presT.write); presT.swap();
    u = use(P.pressure); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform1i(u.uDivergence, tex(1, divT.tex));
    for (let i = 0; i < TIERS[tier].iters; i++) { gl.uniform1i(u.uPressure, tex(0, presT.read.tex)); blit(presT.write); presT.swap(); }
    u = use(P.gradient); gl.uniform2f(u.texelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uPressure, tex(0, presT.read.tex)); gl.uniform1i(u.uVelocity, tex(1, vel.read.tex));
    blit(vel.write); vel.swap();

    // carry the water and the pigment along
    u = use(P.advect); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform2f(u.dyeTexelSize, vel.tx, vel.ty);
    gl.uniform1i(u.uVelocity, tex(0, vel.read.tex)); gl.uniform1i(u.uSource, tex(0, vel.read.tex));
    gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, .5);
    blit(vel.write); vel.swap();
    gl.uniform2f(u.dyeTexelSize, dyeT.tx, dyeT.ty);
    gl.uniform1i(u.uVelocity, tex(0, vel.read.tex)); gl.uniform1i(u.uSource, tex(1, dyeT.read.tex));
    if (P.mac) {
      gl.uniform1f(u.dissipation, 0); blit(dyeTmp);
      u = use(P.mac); gl.uniform2f(u.texelSize, vel.tx, vel.ty); gl.uniform2f(u.dyeTexelSize, dyeT.tx, dyeT.ty);
      gl.uniform1i(u.uVelocity, tex(0, vel.read.tex)); gl.uniform1i(u.uSource, tex(1, dyeT.read.tex)); gl.uniform1i(u.uHat, tex(2, dyeTmp.tex));
      gl.uniform1f(u.dt, dt);
    }
    gl.uniform1f(u.dissipation, .3 / S.linger);
    blit(dyeT.write); dyeT.swap();

    // the letters release pigment
    u = use(P.inject); gl.uniform2f(u.texelSize, dyeT.tx, dyeT.ty);
    gl.uniform1i(u.uDye, tex(0, dyeT.read.tex)); gl.uniform1i(u.uMask, tex(1, maskT.tex));
    gl.uniform2f(u.uMaskTexel, 1 / mw, 1 / mh);
    gl.uniform1f(u.uSeep, S.seep * seepNow); gl.uniform1f(u.dt, dt);
    blit(dyeT.write); dyeT.swap();

    // show it
    u = use(P.display); gl.uniform2f(u.texelSize, 1 / canvas.width, 1 / canvas.height);
    gl.uniform1i(u.uDye, tex(0, dyeT.read.tex)); gl.uniform1i(u.uMask, tex(1, maskT.tex));
    gl.uniform1i(u.uGlow, tex(2, glowB.tex)); gl.uniform1f(u.uHalo, S.glow);
    gl.uniform3fv(u.uCore, core); gl.uniform3fv(u.uMid, mid); gl.uniform3fv(u.uFar, far);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uStrength, 4.2 * S.strength); gl.uniform1f(u.uHalftone, S.halftone);
    gl.uniform1f(u.uCell, S.dot * Math.min(1.2, Math.max(.55, map.s / 1.2)) * canvas.width / cw);   // dots shrink with the word on small screens gl.uniform1f(u.uGrain, S.grain); gl.uniform1f(u.uWobble, 2.2 * S.wobble * canvas.width / cw);
    blit(null);

    // on a slow device, step down a level (only while the page is visible and running smoothly otherwise)
    if (autoQ) {
      const now = performance.now();
      if (lastNow && document.visibilityState === 'visible') {
        const f = now - lastNow;
        if (f < 250) { frames++; if (f > 26) slow++; }
        if (frames >= 150) {
          if (slow > 90 && tier !== 'low') { tier = ORDER[ORDER.indexOf(tier) + 1]; resize(true); }
          frames = 0; slow = 0;
        }
      }
      lastNow = now;
    }
  }

  let alive = true;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); alive = false; if (opts.onLost) opts.onLost(); });

  resize(true);
  return {
    begin, stroke, letter, push, end, minWidth,
    resize: () => resize(false),
    setMap: m => { map = m; },
    /* settings that can be changed while it runs (the sliders in the corner) */
    get: key => LIVE.includes(key) ? S[key] : undefined,
    set: (key, v) => { if (LIVE.includes(key) && isFinite(v)) S[key] = key === 'glow' ? Math.max(0, Math.min(1, v)) : Math.max(0, v); },
    get alive () { return alive; },
    get tier () { return tier; }
  };
}

return { create };
})();
