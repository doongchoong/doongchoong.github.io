// crayon-pigeon.js — built from crayon/pigeon.js (+ crayon-core.js, scene3d.js, street.js); edit those, not this.
const { createCrayon } = (() => {
/**
 * crayon-core.js — wax crayon on <canvas>, simulated per pixel.
 *
 *   1. plan (vector)        where the hand goes: zigzag fill paths, wobbly outlines
 *   2. deposit (pixels)     stamp a worn crayon face along the path; wax sticks to the paper tooth
 *   3. present              copy the buffer through a "boil" displacement map, upscale to the canvas
 *
 * Usage
 *   import { createCrayon } from './crayon-core.js';
 *   const cr = createCrayon(canvas, { world: 600 });       // scene units across the square canvas
 *   cr.resize(canvas.clientWidth, devicePixelRatio);       // builds the paper (≈0.7–1.4 s)
 *   const strokes = [
 *     ...cr.fill(poly, '#f07814', { angle: 0.4, width: 18 }),   // returns 2 coats
 *     cr.line(poly, '#2a2521', { closed: true }),
 *   ];
 *   const total = cr.schedule(strokes);                    // start/duration per stroke, in seconds
 *   function frame(now) {                                  // ~25 fps is plenty
 *     const t = (now - t0) / 1000;
 *     cr.update(strokes, t);                               // deposit wax up to time t
 *     cr.present(Math.floor(t * 8));                       // 8 boil frames per second
 *     requestAnimationFrame(frame);
 *   }
 *
 * Sprites (draw once, move later — see traffic.js)
 *   cr.update(strokes, 1e9);                               // finish instantly
 *   cr.snapshot(boil, x, y, w, h);                         // transparent crop in buffer px (cr.bufScale px per unit)
 *   cr.snapshots(x, y, w, h);                              // ...all boil frames at once (much cheaper)
 *   cr.clear(x, y, w, h);                                  // reset only that region before the next sprite
 *   cr.setOrigin(x, y); cr.setSeed(n);                     // tile a picture bigger than the buffer
 *   (sweep mode: schedule() + update() the same strokes again per tile — their prep is reused)
 *   options: createCrayon({ ds }) stamp spacing in buffer px (0.6; ~1.0 is cheaper, looks the same)
 *            createCrayon({ mode: 'sweep' }) one evaluation per pixel per pass: ~8x faster, same look
 *            createCrayon({ fastPaper }) smooth paper/boil noise on a coarse grid (default true)
 *            fill/line(..., { resist }) how much existing wax repels this stroke (fill 0.7, line 0.15)
 *            line(..., { taper }) scale the press-in / lift-off length (short marks need < 1)
 *            fill/line(..., { press }) pressure multiplier for one stroke (> 1 darker)
 *   cr.setAblate({ paper, ridges, hand, resist })          // switch ingredients of the look off (comparison)
 */

// ───────────────────────── noise ─────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x, y) {                                   // value noise, 0..1
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function rn(x, y, ang, off) {                          // rotated octave: no alignment with the pixel grid
  const c = Math.cos(ang), s = Math.sin(ang);
  return vn(x * c - y * s + off, x * s + y * c + off * 1.37);
}
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

// ───────────────────────── vector plan ─────────────────────────
// Colouring plan: scanlines across the shape (rotated by `ang`), vertices alternate left/right.
function zigzagVerts(poly, ang, sp, w, rng, jit, hd = 1) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const rp = poly.map(([x, y]) => [x * c + y * s, -x * s + y * c]);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of rp) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const out = []; let k = 0;
  for (let y = y0 + sp * 0.5; y < y1 - sp * 0.2; y += sp * ((0.55 + rng() * 0.9) * hd + (1 - hd))) {   // uneven spacing
    const xs = [];
    for (let i = 0; i < rp.length; i++) {
      const a = rp[i], b = rp[(i + 1) % rp.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    if (xs.length < 2) continue;
    const xa = Math.min(...xs), xb = Math.max(...xs);
    const inset = Math.min(w * 0.4, (xb - xa) * 0.45), over = (rng() - 0.35) * w * 0.45 * hd;   // stop short / overshoot
    const x = (k++ % 2 === 0 ? xa + inset - over : xb - inset + over) + (rng() - 0.5) * jit * hd;
    const yy = y + (rng() - 0.5) * jit * hd;
    out.push([x * c - yy * s, x * s + yy * c]);
  }
  return out;
}
function roundCorners(v, r) {                          // each interior vertex -> 6-point quadratic turn
  if (v.length < 3) return v.slice();
  const out = [v[0]];
  for (let i = 1; i < v.length - 1; i++) {
    const A = v[i - 1], V = v[i], B = v[i + 1];
    const ta = Math.min(0.45, r / (Math.hypot(A[0] - V[0], A[1] - V[1]) || 1));
    const tb = Math.min(0.45, r / (Math.hypot(B[0] - V[0], B[1] - V[1]) || 1));
    const q1 = [V[0] + (A[0] - V[0]) * ta, V[1] + (A[1] - V[1]) * ta];
    const q2 = [V[0] + (B[0] - V[0]) * tb, V[1] + (B[1] - V[1]) * tb];
    for (let j = 0; j <= 5; j++) {
      const t = j / 5, m = 1 - t;
      out.push([m * m * q1[0] + 2 * m * t * V[0] + t * t * q2[0], m * m * q1[1] + 2 * m * t * V[1] + t * t * q2[1]]);
    }
  }
  out.push(v[v.length - 1]);
  return out;
}
// Arc length of each zigzag turn: a new "pass" of the crayon starts there.
function turnPositions(verts, rounded) {
  const cum = [0];
  for (let i = 1; i < rounded.length; i++) cum.push(cum[i - 1] + Math.hypot(rounded[i][0] - rounded[i - 1][0], rounded[i][1] - rounded[i - 1][1]));
  const out = [];
  for (let v = 1; v < verts.length - 1; v++) { const ix = 1 + (v - 1) * 6 + 3; if (ix < cum.length) out.push(cum[ix]); }
  return out;
}
function makePath(pts, step = 2.5) {                   // resample + cumulative length + normals
  const P = [[pts[0][0], pts[0][1]]]; let need = step;
  for (let i = 1; i < pts.length; i++) {
    let ax = pts[i - 1][0], ay = pts[i - 1][1]; const bx = pts[i][0], by = pts[i][1];
    let L = Math.hypot(bx - ax, by - ay);
    while (L >= need) { const t = need / L; ax += (bx - ax) * t; ay += (by - ay) * t; P.push([ax, ay]); L -= need; need = step; }
    need -= L;
  }
  P.push([...pts[pts.length - 1]]);
  const n = P.length, cum = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / l; ny[i] = tx / l;
  }
  return { P, cum, nx, ny, n, L: n > 1 ? cum[n - 1] : 0 };
}
function lineVerts(pts0, closed, rng, hd = 1) {        // hand-drawn outline: bowed edges, jitter, overshoot
  const pts = pts0.map((p) => [p[0], p[1]]);
  if (closed) pts.push([pts[0][0], pts[0][1]]);
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ns = Math.max(1, Math.round(L / 28));
    const bow = (rng() - 0.5) * Math.min(6, L * 0.04) * hd, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    for (let k = 0; k < ns; k++) {
      const t = k / ns, s = Math.sin(Math.PI * t) * bow;
      out.push([a[0] + (b[0] - a[0]) * t + nx * s + (rng() - 0.5) * 1.4 * hd, a[1] + (b[1] - a[1]) * t + ny * s + (rng() - 0.5) * 1.4 * hd]);
    }
  }
  const e = pts[pts.length - 1];
  out.push([e[0] + (rng() - 0.5) * 1.4 * hd, e[1] + (rng() - 0.5) * 1.4 * hd]);
  if (closed && hd) {
    const a = pts[0], b = pts[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, o = Math.min(L * 0.3, 8 + rng() * 10);
    out.push([a[0] + (b[0] - a[0]) / L * o + (rng() - 0.5) * 3, a[1] + (b[1] - a[1]) / L * o + (rng() - 0.5) * 3]);
  }
  return out;
}

// ───────────────────────── the crayon ─────────────────────────
function createCrayon(canvas, opt = {}) {
  const WORLD = opt.world ?? 600;
  const HAND = opt.hand ?? -0.55;              // screen angle of the worn face's long axis (right hand)
  const PAPER = opt.paper ?? [236, 228, 213];
  let pressure = opt.pressure ?? 0.65;         // 0 = light hand, 1 = heavy hand
  let seed = (opt.seed ?? Math.random() * 1e9) | 0;
  const NB = 3, DS = opt.ds ?? 0.6, NBIN = 48;  // boil maps, stamp spacing (buffer px), tip resolution
  const AB = { paper: true, ridges: true, hand: true, resist: true };   // what makes it crayon (see setAblate)
  const SWEEP = opt.mode === 'sweep';          // evaluate each pixel once per pass instead of once per stamp
  const FAST_PAPER = opt.fastPaper ?? true;    // smooth noise fields on a coarse grid, bilinear in between

  const ctx = canvas.getContext('2d');
  const buf = document.createElement('canvas'), bctx = buf.getContext('2d');
  let IW = 0, DW = 0, S = 1, N = 0, GEN = 0, out = null, DISP = [];
  let OX = 0, OY = 0;          // world point at the buffer's top-left (tiles of a bigger picture)
  let heq, GX, GY;            // paper: tooth height (equalised 0..1) and its slope
  let C, W;                   // colour (RGB float) and wax amount per pixel
  let M, MS, MC, MG;          // current pass: applied coverage, contact sum, touch count, pass id

  // ── paper ──
  // A smooth field fn(worldX, worldY) for every buffer pixel. FAST_PAPER samples it every ~1 world unit and
  // interpolates: these octaves change over 3+ units, so the result is indistinguishable and ~4x cheaper.
  function field(fn) {
    const F = new Float32Array(N);
    const G = FAST_PAPER ? Math.max(1, Math.round(S)) : 1;
    if (G === 1) { for (let y = 0; y < IW; y++) for (let x = 0; x < IW; x++) F[y * IW + x] = fn(x / S, y / S); return F; }
    const gw = Math.floor((IW - 1) / G) + 2, g = new Float32Array(gw * gw);
    for (let j = 0; j < gw; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn((i * G) / S, (j * G) / S);
    for (let y = 0; y < IW; y++) {
      const gy = y / G, j = gy | 0, fy = gy - j;
      for (let x = 0; x < IW; x++) {
        const gx = x / G, i = gx | 0, fx = gx - i, o = j * gw + i;
        const a = g[o] + (g[o + 1] - g[o]) * fx, b = g[o + gw] + (g[o + gw + 1] - g[o + gw]) * fx;
        F[y * IW + x] = a + (b - a) * fy;
      }
    }
    return F;
  }
  function buildPaper() {
    N = IW * IW;
    // (a) "lunar" spot noise: white noise convolved with a quarter-circle arc -> rough, no grid
    const wn = new Float32Array(N), rg = mulberry32(90210);
    for (let i = 0; i < N; i++) wn[i] = rg();
    const R = Math.max(1.5, 2.2 * S), steps = Math.max(5, Math.round(R * 2)), arc = [], seen = new Set();
    for (let k = 0; k <= steps; k++) {
      const a = (k / steps) * Math.PI / 2, ax = Math.round(R * Math.cos(a) - R * 0.5), ay = Math.round(R * Math.sin(a) - R * 0.5);
      if (!seen.has(ax + ',' + ay)) { seen.add(ax + ',' + ay); arc.push(ax, ay); }
    }
    const lun = new Float32Array(N), na = arc.length / 2;
    for (let y = 0; y < IW; y++) for (let x = 0; x < IW; x++) {
      let sum = 0;
      for (let k = 0; k < arc.length; k += 2) {
        let xx = x + arc[k], yy = y + arc[k + 1];
        if (xx < 0) xx += IW; else if (xx >= IW) xx -= IW;
        if (yy < 0) yy += IW; else if (yy >= IW) yy -= IW;
        sum += wn[yy * IW + xx];
      }
      lun[y * IW + x] = sum / na;
    }
    let m = 0, v = 0;
    for (let i = 0; i < N; i++) m += lun[i]; m /= N;
    for (let i = 0; i < N; i++) v += (lun[i] - m) ** 2;
    const sd = Math.sqrt(v / N) || 1;
    // (b) + two larger, rotated octaves for clumps; then histogram-equalise to 0..1
    const oct = field((wx, wy) => 0.3 * (rn(wx * 0.2, wy * 0.2, 0.7, 11.1) - 0.5) / 0.17 + 0.2 * (rn(wx * 0.05, wy * 0.05, 2.1, 47.3) - 0.5) / 0.17);
    const raw = new Float32Array(N); let mn = 1e9, mx = -1e9;
    for (let i = 0; i < N; i++) {
      const h = 0.75 * (lun[i] - m) / sd + oct[i];
      raw[i] = h; if (h < mn) mn = h; if (h > mx) mx = h;
    }
    const B = 1024, hist = new Float32Array(B), k = (B - 0.001) / (mx - mn);
    for (let i = 0; i < N; i++) hist[((raw[i] - mn) * k) | 0]++;
    for (let b = 0, acc = 0; b < B; b++) { acc += hist[b]; hist[b] = acc / N; }
    heq = new Float32Array(N);
    for (let i = 0; i < N; i++) heq[i] = hist[((raw[i] - mn) * k) | 0];
    PAPER_REAL = null;
    GX = new Float32Array(N); GY = new Float32Array(N);
    for (let y = 1; y < IW - 1; y++) for (let x = 1; x < IW - 1; x++) {
      const i = y * IW + x; GX[i] = (heq[i + 1] - heq[i - 1]) * 0.5; GY[i] = (heq[i + IW] - heq[i - IW]) * 0.5;
    }
    // (c) boil: NB displacement maps (like Turbulent Displace), cycled when presenting
    DISP = [];
    for (let mI = 0; mI < NB; mI++) {
      const map = new Int32Array(N);
      const DX = field((wx, wy) => ((rn(wx * 0.09, wy * 0.09, 0.5 + mI, 31.7 * mI + 5) - 0.5) * 4.0 + (rn(wx * 0.35, wy * 0.35, 1.3 + mI, 13.3 * mI + 7) - 0.5) * 1.4) * S);
      const DY = field((wx, wy) => ((rn(wx * 0.09, wy * 0.09, 2.2 + mI, 17.9 * mI + 60) - 0.5) * 4.0 + (rn(wx * 0.35, wy * 0.35, 0.9 + mI, 7.1 * mI + 33) - 0.5) * 1.4) * S);
      for (let y = 0; y < IW; y++) for (let x = 0; x < IW; x++) {
        const i = y * IW + x;
        const sx = Math.min(IW - 1, Math.max(0, Math.round(x + DX[i]))), sy = Math.min(IW - 1, Math.max(0, Math.round(y + DY[i])));
        map[i] = sy * IW + sx;
      }
      DISP.push(map);
    }
    PAPER_REAL = [heq, GX, GY];
    applyPaper();
    C = new Float32Array(N * 3); W = new Float32Array(N);
    M = new Float32Array(N); MS = new Float32Array(N); MC = new Uint16Array(N); MG = new Int32Array(N);
    buf.width = buf.height = IW;
    out = bctx.createImageData(IW, IW);
    for (let j = 3; j < out.data.length; j += 4) out.data[j] = 255;
  }
  let PAPER_REAL = null;                      // [heq, GX, GY] of the real paper
  function applyPaper() {                     // AB.paper off: a perfectly flat sheet, same mean height
    if (!PAPER_REAL) return;
    if (AB.paper) [heq, GX, GY] = PAPER_REAL;
    else { heq = new Float32Array(N).fill(0.5); GX = new Float32Array(N); GY = new Float32Array(N); }
  }
  function clear(x = 0, y = 0, w = IW, h = IW) {   // optionally just a region (buffer px)
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0), x1 = Math.min(IW, x0 + Math.ceil(w)), y1 = Math.min(IW, y0 + Math.ceil(h));
    for (let yy = y0; yy < y1; yy++) for (let i = yy * IW + x0, e = yy * IW + x1, j = i * 3; i < e; i++, j += 3) {
      const f = 0.97 + 0.035 * heq[i];
      C[j] = PAPER[0] * f; C[j + 1] = PAPER[1] * f; C[j + 2] = PAPER[2] * f; W[i] = 0;
    }
  }
  function resize(cssSize, dpr = 1) {
    DW = Math.round(cssSize * Math.min(3, dpr));
    canvas.width = canvas.height = DW;
    const iw = Math.round(Math.min(cssSize, 640) * Math.min(2, dpr));
    if (iw !== IW) { IW = iw; S = IW / WORLD; buildPaper(); }
    clear();
  }

  // ── strokes (plain objects; positions in world units) ──
  function baseStroke(isFill, color, rng) {
    const phi = HAND + (rng() - 0.5) * 0.24 * +AB.hand;
    return {
      isFill, rgb: hex(color), phi, cphi: Math.cos(phi), sphi: Math.sin(phi),
      wamp: 0.6 + rng(), wA: rng() * 1000, pA: rng() * 1000, pB: rng() * 1000, rA: rng() * 1000, tA: rng() * 1000, tB: rng() * 1000,
      row: new Float32Array(NBIN), rowS: -Infinity, gainC: 3, nextS: 0, k: 0, gen: 0, ti: 0, start: 0, dur: 0,
    };
  }
  function dust(rng, L, n) {                         // hard bits in the wax -> short white tracks
    const parts = [];
    for (let k = 0; k < n; k++) { const s0 = rng() * L; parts.push({ b: (rng() * NBIN) | 0, w: rng() < 0.5 ? 0 : 1, s0, s1: s0 + 30 + rng() * 160 }); }
    return parts;
  }
  /** Fill a polygon with two coats of zigzag hatching. Returns [coat1, coat2]. */
  function fill(poly, color, o = {}) {
    const w = o.width ?? 16;
    return [1, 2].map((coat) => {
      const rng = mulberry32(seed++ * 7919);
      const st = baseStroke(true, color, rng);
      const ang = (o.angle ?? 0) + (coat === 2 ? (rng() < 0.5 ? -1 : 1) * (0.18 + rng() * 0.17) : 0);
      st.pa = 1.15; st.pb = 0.55;                   // worn face: long/short half-axes (x radius)
      // how wide the face is across this hatch direction -> zigzag spacing follows it
      const cn = -Math.sin(ang) * st.cphi + Math.cos(ang) * st.sphi, sn = Math.sin(ang) * st.sphi + Math.cos(ang) * st.cphi;
      const fac = Math.hypot(st.pa * cn, st.pb * sn);
      st.verts = zigzagVerts(poly, ang, w * (coat === 2 ? 0.95 : 0.5) * fac, w * fac, rng, 4, +AB.hand);
      const rounded = st.verts.length ? roundCorners(st.verts, w * 0.55) : [[0, 0]];
      st.path = makePath(rounded);
      st.turns = turnPositions(st.verts, rounded);
      st.r = (w / 2) * (coat === 2 ? 0.85 : 1);
      st.kPass = coat === 2 ? 2.4 : 3.4; st.tau = 0.25; st.ridgeK = 0.6; st.resist = o.resist ?? 0.7;
      st.gain = coat === 2 ? 0.75 : 1;              // second coat: lighter hand
      st.press = o.press ?? 1;
      st.passLen = Math.max(20, st.path.L / Math.max(1, st.verts.length - 1));
      st.tin = w * 0.6; st.tout = w * 1.6;
      st.parts = dust(rng, st.path.L, Math.floor(rng() * 3));
      return st;
    });
  }
  /** Hand-drawn outline through `pts`. */
  function line(pts, color, o = {}) {
    const rng = mulberry32(seed++ * 7919);
    const st = baseStroke(false, color, rng);
    const w = o.width ?? 7.2;
    st.pa = 1.1; st.pb = 0.7;
    st.path = makePath(roundCorners(lineVerts(pts, !!o.closed, rng, +AB.hand), 2.5));
    st.verts = null; st.turns = []; st.gain = 1;
    st.r = w / 2; st.kPass = 3.8; st.tau = 0.56; st.ridgeK = 0.55; st.resist = o.resist ?? 0.15;
    const tp = o.taper ?? 1;                  // < 1: press in / lift off faster (short marks: eyes, dots)
    st.press = o.press ?? 1;                  // > 1: a heavier hand for this stroke
    st.tin = 5 * tp; st.tout = w * 2.2 * tp;
    st.parts = dust(rng, st.path.L, rng() < 0.3 ? 1 : 0);
    return st;
  }

  // ── deposit: one stamp of the crayon face ──
  function stamp(cx, cy, nx, ny, st, q, r) {
    const a = r * st.pa, b = r * st.pb, cph = st.cphi, sph = st.sphi;
    const cn = nx * cph + ny * sph, sn = -nx * sph + ny * cph;
    const he = Math.sqrt(a * a * cn * cn + b * b * sn * sn);    // half-width of the swept stroke
    const R = Math.max(a, b), iA = 1 / a, iB = 1 / b, invHe = 1 / he, kb = (NBIN - 1) * 0.5;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(IW - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(IW - 1, Math.ceil(cy + R));
    const tx = ny, ty = -nx, row = st.row, rk = st.ridgeK, rk0 = 1 - rk, fk = 0.7 * S;
    const gen = st.gen, gain = st.gainC, kp = st.kPass * 0.85, tau = st.tau, wr = AB.resist ? st.resist : 0;
    const [cr, cg, cb] = st.rgb;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        // inside the rounded-rectangle face (superellipse, n = 4) held at the hand's angle?
        const pu = (dx * cph + dy * sph) * iA, pv = (dy * cph - dx * sph) * iB, p2 = pu * pu, v2 = pv * pv;
        if (p2 * p2 + v2 * v2 > 1) continue;
        // position across the stroke -> pressure profile and which tip ridge touches here
        const u = dx * nx + dy * ny;
        let xr = Math.abs(u) * invHe; if (xr > 1) xr = 1;
        let bi = ((u * invHe + 1) * kb + 0.5) | 0; bi = bi < 0 ? 0 : bi >= NBIN ? NBIN - 1 : bi;
        const P = q * (1 - xr * xr) * (rk0 + rk * row[bi]);
        // paper resists in tooth valleys; slopes facing the motion catch wax (friction)
        const i = y * IW + x, h = heq[i];
        const res = (1 - h) * tau - fk * (GX[i] * tx + GY[i] * ty);
        let c = (P - res) * gain; c = c < 0 ? 0 : c > 1 ? 1 : c;
        // mean contact over every touch in this pass (misses count): centre = classic build-up,
        // edges/ends don't fade like an airbrush. New pass (new gen) -> builds on top.
        if (MG[i] !== gen) { MG[i] = gen; M[i] = 0; MS[i] = 0; MC[i] = 0; }
        MS[i] += c; if (MC[i] < 65535) MC[i]++;
        const target = 1 - Math.exp(-kp * MS[i] / MC[i]), m0 = M[i];
        if (target <= m0) continue;
        M[i] = target;
        // wax already on the paper resists new wax (more for fills, little for outlines)
        const w = W[i], d = ((target - m0) / (1 - m0 + 1e-6)) * (1 - wr * w);
        W[i] = w + (1 - w) * (target - m0);
        const sh = 0.95 + 0.1 * h, j = i * 3;
        C[j] += (cr * sh - C[j]) * d; C[j + 1] += (cg * sh - C[j + 1]) * d; C[j + 2] += (cb * sh - C[j + 2]) * d;
      }
    }
  }

  // ── the crayon's state at arc length s (shared by stamp and sweep) ──
  // worn tip cross-section: ridges drift slowly along the stroke -> long streaks
  function tipRow(st, s, row) {
    if (!AB.ridges) { row.fill(1); return; }  // a perfectly smooth tip: no streaks, no grit
    for (let b = 0; b < NBIN; b++) {
      let v = (0.65 * vn(b * 0.22 + st.tA, s * 0.004) + 0.35 * vn(b * 0.6 + st.tB, s * 0.012 + 9.1) - 0.5) * 2.6 + 0.5;
      for (const pt of st.parts) if (s >= pt.s0 && s < pt.s1 && Math.abs(b - pt.b) <= pt.w) v *= 0.1;
      row[b] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
  }
  const wobble = (st, s) => (AB.hand ? st.wamp * (vn(s * 0.012 + st.wA, 7.1) - 0.5) * 2 : 0);   // hand wobble
  // pressure q and tip radius r (buffer px) -> st.q, st.r_
  function pressAt(st, s, L) {
    const base = 0.6 + 0.6 * pressure;
    // fills change a lot from pass to pass (light/dark bands); outlines wander
    const H = AB.hand ? 1 : 0, J = (n, mean) => n * H + mean * (1 - H);   // a steady machine hand: the means
    let q = st.isFill
      ? base * st.gain * J(0.5 + 0.5 * vn((s / st.passLen) * 0.8 + st.pA, 0.5), 0.75) * J(0.8 + 0.2 * vn(s * 0.03 + st.pB, 2.2), 0.9)
      : Math.min(1.2, base + 0.25) * J(0.62 + 0.38 * vn(s * 0.012 + st.pA, 0.5), 0.81) * J(0.85 + 0.15 * vn(s * 0.06 + st.pB, 4.4), 0.925);
    let r = st.isFill
      ? st.r * S * J(0.8 + 0.3 * vn(s * 0.01 + st.rA, 3.3), 0.95) * J(0.95 + 0.1 * vn(s * 0.05 + st.rA, 8.8), 1)
      : st.r * S * J(0.8 + 0.45 * vn(s * 0.015 + st.rA, 3.3), 1.025);
    // press in at the start, lift off at the end
    const tin = Math.min(1, s / st.tin), tout = Math.max(0, Math.min(1, (L - s) / st.tout));
    const tp = Math.min(0.4 + 0.6 * tin * tin * (3 - 2 * tin), 0.12 + 0.88 * tout * tout * (3 - 2 * tout));
    st.q = q * tp * st.press; st.r_ = r * (0.75 + 0.25 * tp);
  }

  // ── drive the crayon along a stroke up to arc length `toLen` (world units) ──
  function advance(st, toLen) {
    if (SWEEP) return sweepAdvance(st, toLen);
    const { P, cum, nx, ny, n, L } = st.path;
    if (n < 2) { st.nextS = Infinity; return; }
    const dsw = DS / S;
    if (!st.gen) st.gen = ++GEN;
    while (st.nextS <= toLen) {
      const s = st.nextS;
      while (st.ti < st.turns.length && s >= st.turns[st.ti]) { st.ti++; st.gen = ++GEN; }   // zigzag turn = new pass
      while (st.k < n - 2 && cum[st.k + 1] < s) st.k++;
      const k = st.k, f = Math.max(0, Math.min(1, (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1)));
      let vx = nx[k] + (nx[k + 1] - nx[k]) * f, vy = ny[k] + (ny[k + 1] - ny[k]) * f;
      const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
      const wob = wobble(st, s);
      const px = P[k][0] + (P[k + 1][0] - P[k][0]) * f + vx * wob, py = P[k][1] + (P[k + 1][1] - P[k][1]) * f + vy * wob;
      // ridges move ~0.01 noise cells per world unit, so refreshing every 0.8 units is invisible
      if (s - st.rowS >= 0.8 || s < st.rowS) { st.rowS = s; tipRow(st, s, st.row); }
      pressAt(st, s, L);
      stamp((px - OX) * S, (py - OY) * S, vx, vy, st, st.q, st.r_);
      st.nextS += dsw;
    }
  }

  // ── sweep: the same crayon, but each pixel is evaluated once per pass ──
  // Stamping touches a pixel ~30 times per pass with almost the same contact every time (same offset across
  // the stroke, slowly varying pressure), then averages. Sweeping computes that average directly from the
  // nearest point of the path: per path segment, every pixel in the band the face sweeps gets one evaluation.
  function prepSweep(st) {
    const { P, cum, nx, ny, n, L } = st.path;
    const X = new Float32Array(n), Y = new Float32Array(n), Q = new Float32Array(n), R = new Float32Array(n), ROW = new Float32Array(n * NBIN);
    for (let k = 0; k < n; k++) {
      const s = cum[k], wob = wobble(st, s);
      X[k] = (P[k][0] + nx[k] * wob) * S; Y[k] = (P[k][1] + ny[k] * wob) * S;    // origin applied when drawing
      pressAt(st, s, L); Q[k] = st.q; R[k] = st.r_;
      if (k % 3 === 0) tipRow(st, s, ROW.subarray(k * NBIN, (k + 1) * NBIN));   // ridges barely move over 7 units
      else ROW.copyWithin(k * NBIN, (k - 1) * NBIN, k * NBIN);
    }
    st.sw = { X, Y, Q, R, ROW, k: 0, cap0: false };
  }
  function capStamp(st, k) {                         // the stroke's two ends keep the face's real shape
    const sw = st.sw, { nx, ny } = st.path;
    st.row.set(sw.ROW.subarray(k * NBIN, (k + 1) * NBIN));
    stamp(sw.X[k] - OX * S, sw.Y[k] - OY * S, nx[k], ny[k], st, sw.Q[k], sw.R[k]);
  }
  function sweepAdvance(st, toLen) {
    const { cum, n, L } = st.path;
    if (n < 2 || L <= 0) { st.nextS = Infinity; return; }
    if (!st.sw) prepSweep(st);
    const sw = st.sw;
    if (!st.gen) st.gen = ++GEN;
    if (!sw.cap0) { sw.cap0 = true; capStamp(st, 0); }
    while (sw.k < n - 1 && cum[sw.k + 1] <= toLen) {
      const k = sw.k, mid = (cum[k] + cum[k + 1]) * 0.5;
      while (st.ti < st.turns.length && mid >= st.turns[st.ti]) { st.ti++; st.gen = ++GEN; }   // zigzag turn = new pass
      sweepSeg(st, k);
      sw.k++;
    }
    if (sw.k >= n - 1) { capStamp(st, n - 1); st.nextS = Infinity; } else st.nextS = cum[sw.k + 1];
  }
  function sweepSeg(st, k) {
    const sw = st.sw, X = sw.X, Y = sw.Y, n = st.path.n;
    const ax = X[k] - OX * S, ay = Y[k] - OY * S, ex = X[k + 1] - X[k], ey = Y[k + 1] - Y[k], len = Math.hypot(ex, ey);
    if (len < 1e-4) return;
    const reach = Math.max(sw.R[k], sw.R[k + 1]) * 3.2 + len + 2;                 // off this buffer (another tile): skip
    if (ax + reach < 0 || ay + reach < 0 || ax - reach > IW || ay - reach > IW) return;
    const tx = ex / len, ty = ey / len, nx = -ty, ny = tx, il = 1 / len;
    // the face held at the hand's angle: ellipse half-width (pressure profile) and the n = 4 superellipse's
    // true extent across this direction (its corners still reach the paper)
    const cph = st.cphi, sph = st.sphi, cn = nx * cph + ny * sph, sn = -nx * sph + ny * cph;
    const heK = Math.sqrt(st.pa * st.pa * cn * cn + st.pb * st.pb * sn * sn);
    const supK = Math.pow(Math.pow(Math.abs(st.pa * cn), 4 / 3) + Math.pow(Math.abs(st.pb * sn), 4 / 3), 0.75);
    const r0 = sw.R[k], r1 = sw.R[k + 1], q0 = sw.Q[k], q1 = sw.Q[k + 1];
    const band = Math.max(r0, r1) * supK + 0.5;
    // bends: reach a little past each end on the outside of the turn so no wedge is left unpainted
    const bend = (j) => {
      if (j < 0 || j + 1 >= n) return 0;
      const fx = X[j + 1] - X[j], fy = Y[j + 1] - Y[j], fl = Math.hypot(fx, fy) || 1;
      return Math.abs(tx * fy - ty * fx) / fl;
    };
    const t0 = k === 0 ? 0 : -(band * bend(k - 1) * il + 0.02), t1 = k + 2 >= n ? 1 : 1 + band * bend(k + 1) * il + 0.02;
    // the swept quad, scanned row by row
    const qx = [ax + ex * t0 + nx * band, ax + ex * t1 + nx * band, ax + ex * t1 - nx * band, ax + ex * t0 - nx * band];
    const qy = [ay + ey * t0 + ny * band, ay + ey * t1 + ny * band, ay + ey * t1 - ny * band, ay + ey * t0 - ny * band];
    const y0 = Math.max(0, Math.floor(Math.min(...qy))), y1 = Math.min(IW - 1, Math.ceil(Math.max(...qy)));
    const rowA = sw.ROW.subarray(k * NBIN, (k + 1) * NBIN), rowB = sw.ROW.subarray((k + 1) * NBIN, (k + 2) * NBIN);
    const rk = st.ridgeK, rk0 = 1 - rk, fk = 0.7 * S, kb = (NBIN - 1) * 0.5;
    const gen = st.gen, gain = st.gainC, kp = st.kPass * 0.85, tau = st.tau, wr = AB.resist ? st.resist : 0;
    const [cr, cg, cb] = st.rgb;
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      let xa = Infinity, xb = -Infinity;             // where this row crosses the quad
      for (let e = 0; e < 4; e++) {
        const pxa = qx[e], pya = qy[e], pxb = qx[(e + 1) & 3], pyb = qy[(e + 1) & 3];
        if ((pya <= cy && pyb >= cy) || (pyb <= cy && pya >= cy)) {
          const xx = pya === pyb ? Math.min(pxa, pxb) : pxa + ((cy - pya) / (pyb - pya)) * (pxb - pxa);
          const xx2 = pya === pyb ? Math.max(pxa, pxb) : xx;
          if (xx < xa) xa = xx; if (xx2 > xb) xb = xx2;
        }
      }
      if (xa > xb) continue;
      const x0 = Math.max(0, Math.floor(xa - 0.5)), x1 = Math.min(IW - 1, Math.ceil(xb - 0.5));
      const dy = cy - ay;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - ax;
        const t = (dx * tx + dy * ty) * il;
        if (t < t0 || t >= t1) continue;
        const tc = t < 0 ? 0 : t > 1 ? 1 : t, r = r0 + (r1 - r0) * tc;
        const u = dx * nx + dy * ny, au = u < 0 ? -u : u;
        if (au > r * supK) continue;
        // same contact model as stamp()
        const he = r * heK, invHe = 1 / he;
        let xr = au * invHe; if (xr > 1) xr = 1;
        let bi = ((u * invHe + 1) * kb + 0.5) | 0; bi = bi < 0 ? 0 : bi >= NBIN ? NBIN - 1 : bi;
        const P = (q0 + (q1 - q0) * tc) * (1 - xr * xr) * (rk0 + rk * (tc < 0.5 ? rowA[bi] : rowB[bi]));
        const i = y * IW + x, h = heq[i];
        const res = (1 - h) * tau - fk * (GX[i] * tx + GY[i] * ty);
        let c = (P - res) * gain; c = c < 0 ? 0 : c > 1 ? 1 : c;
        if (MG[i] !== gen) { MG[i] = gen; M[i] = 0; MS[i] = c; MC[i] = 1; }
        const target = 1 - Math.exp(-kp * c), m0 = M[i];
        if (target <= m0) continue;
        M[i] = target;
        const w = W[i], d = ((target - m0) / (1 - m0 + 1e-6)) * (1 - wr * w);
        W[i] = w + (1 - w) * (target - m0);
        const sh = 0.95 + 0.1 * h, j = i * 3;
        C[j] += (cr * sh - C[j]) * d; C[j + 1] += (cg * sh - C[j + 1]) * d; C[j + 2] += (cb * sh - C[j + 2]) * d;
      }
    }
  }

  // ── timeline helpers (strokes must be in drawing order) ──
  function schedule(strokes, { fillSpeed = 4200, lineSpeed = 1100, gap = 0.06, start = 0.25 } = {}) {
    let t = start;
    for (const st of strokes) {
      st.nextS = 0; st.k = 0; st.gen = 0; st.ti = 0; st.rowS = -Infinity;
      if (st.sw) { st.sw.k = 0; st.sw.cap0 = false; }                   // keep the prep: redrawing in another tile
      st.start = t; st.dur = Math.max(0.08, st.path.L / (st.isFill ? fillSpeed : lineSpeed));
      t += st.dur + gap;
    }
    return t;
  }
  function update(strokes, t) {
    let changed = false;
    for (const st of strokes) {
      const p = Math.max(0, Math.min(1, (t - st.start) / st.dur));
      if (p <= 0) break;
      if (st.nextS <= p * st.path.L) { advance(st, p * st.path.L); changed = true; }
    }
    return changed;
  }

  // ── present: displaced copy (boil) -> small buffer -> smooth upscale to the canvas ──
  function present(boil = 0) {
    const src = DISP[((boil % NB) + NB) % NB], d = out.data;
    for (let i = 0, j = 0; i < N; i++, j += 4) { const o = src[i] * 3; d[j] = C[o]; d[j + 1] = C[o + 1]; d[j + 2] = C[o + 2]; }
    bctx.putImageData(out, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(buf, 0, 0, DW, DW);
  }

  // ── snapshot: a boiled crop of the buffer as its own canvas ──
  // Transparent mode: alpha follows the wax amount and colour is un-mixed from the paper underneath,
  // so the sprite composited over any similar paper looks like the direct render.
  function snapshot(boil = 0, x = 0, y = 0, w = IW, h = IW, opaque = false) {
    x = Math.max(0, x | 0); y = Math.max(0, y | 0); w = Math.min(IW - x, w | 0); h = Math.min(IW - y, h | 0);
    const src = DISP[((boil % NB) + NB) % NB];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const s = src[(y + yy) * IW + x + xx], o = s * 3, j = (yy * w + xx) * 4;
      if (opaque) { d[j] = C[o]; d[j + 1] = C[o + 1]; d[j + 2] = C[o + 2]; d[j + 3] = 255; continue; }
      const a = Math.min(1, W[s] * 2.5);
      if (a < 0.004) continue;
      const f = (0.97 + 0.035 * heq[s]) * (1 - a), ia = 1 / a;
      d[j] = (C[o] - PAPER[0] * f) * ia; d[j + 1] = (C[o + 1] - PAPER[1] * f) * ia; d[j + 2] = (C[o + 2] - PAPER[2] * f) * ia;
      d[j + 3] = a * 255;
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  // All NB boil frames of a transparent crop at once: un-mix the region (plus the boil's reach) one time,
  // then each frame is only a remap of packed pixels.
  function snapshots(x, y, w, h) {
    x = Math.max(0, x | 0); y = Math.max(0, y | 0); w = Math.min(IW - x, w | 0); h = Math.min(IW - y, h | 0);
    const m = Math.ceil(3 * S) + 2;
    const rx = Math.max(0, x - m), ry = Math.max(0, y - m), rw = Math.min(IW, x + w + m) - rx, rh = Math.min(IW, y + h + m) - ry;
    const base = new Uint32Array(rw * rh);
    for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < rw; xx++) {
      const s = (ry + yy) * IW + rx + xx, a = Math.min(1, W[s] * 2.5);
      if (a < 0.004) continue;
      const f = (0.97 + 0.035 * heq[s]) * (1 - a), ia = 1 / a, o = s * 3;
      const r = Math.max(0, Math.min(255, Math.round((C[o] - PAPER[0] * f) * ia)));
      const g = Math.max(0, Math.min(255, Math.round((C[o + 1] - PAPER[1] * f) * ia)));
      const b = Math.max(0, Math.min(255, Math.round((C[o + 2] - PAPER[2] * f) * ia)));
      base[yy * rw + xx] = (((a * 255 + 0.5) | 0) << 24 | b << 16 | g << 8 | r) >>> 0;   // RGBA bytes, little-endian
    }
    return DISP.map((src) => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'), img = cx.createImageData(w, h), d = new Uint32Array(img.data.buffer);
      for (let yy = 0, j = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++, j++) {
        const s = src[(y + yy) * IW + x + xx], sx = s % IW - rx, sy = ((s / IW) | 0) - ry;
        if (sx >= 0 && sy >= 0 && sx < rw && sy < rh) d[j] = base[sy * rw + sx];
      }
      cx.putImageData(img, 0, 0);
      return cv;
    });
  }

  return {
    resize, clear, fill, line, advance, schedule, update, present, snapshot, snapshots,
    setPressure(p) { pressure = p; },
    // Turn the ingredients of the crayon look off one at a time (all true = normal). Takes effect for
    // strokes made after the call; paper also changes clear().
    //   paper: tooth & grain   ridges: streaks from the worn tip   hand: wobble, uneven pressure/spacing
    //   resist: wax repelling wax
    setAblate(o = {}) {
      const was = AB.paper;
      for (const k of Object.keys(AB)) AB[k] = o[k] ?? true;
      if (was !== AB.paper) applyPaper();
    },
    // Tiling a picture bigger than the buffer: draw the same strokes once per tile, each with the
    // tile's origin and the same seed, so every stroke wobbles identically across the seams.
    setOrigin(x, y) { OX = x; OY = y; },
    setSeed(n) { seed = n | 0; },
    get scale() { return DW / WORLD; },          // world -> canvas px, for overlays
    get bufScale() { return S; },                // world -> buffer px (snapshot coordinates)
    get bufSize() { return IW; },
  };
}
return { createCrayon };
})();
const { TH, EL, SE, CE, WORLD, mulberry32, shade, sub, cross, lerp3, unit, proj, depth, visible, fp, quad, disc, faceDisc, block, shift, boxOps, hull, area, castShadow, bake, forgetDirty, opsToStrokes, bakeSprite } = (() => {
/**
 * scene3d.js — shared bits for crayon scenes seen from the same 3/4 view (traffic, soccer).
 *
 *   camera    orthographic, ground rotated 45° and tilted 50°: x+ runs down-right on screen, y+ down-left
 *   models    boxes / discs in metres, local x = forward, z = up; proj() takes a heading
 *   sprites   bakeSprite(): crayon ops -> 3 boil frames, optional 45° cast shadow cut out under the body
 */

// ───────────────────────── camera ─────────────────────────
const TH = Math.PI / 4;                // ground x axis vs. screen
const EL = (50 * Math.PI) / 180;
const SE = Math.sin(EL);
const CE = Math.cos(EL);
const WORLD = 600;                     // sprite world size (units)

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shade(hex, k) {               // k > 0 lighten towards white, k < 0 darken
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const m = c.map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ───────────────────────── 3D helpers ─────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

function proj(p, h) {                  // local point (m), heading -> screen metres
  const a = h + TH, c = Math.cos(a), s = Math.sin(a);
  const qy = p[0] * s + p[1] * c;
  return [p[0] * c - p[1] * s, qy * SE - p[2] * CE];
}
function depth(p, h = 0) {             // how near the camera a point is (bigger = nearer)
  const a = h + TH;
  return (p[0] * Math.sin(a) + p[1] * Math.cos(a)) * CE + p[2] * SE;
}
function visible(f, h) {               // outward normal = (v1-v0) x (v3-v0)
  const n = unit(cross(sub(f[1], f[0]), sub(f[3], f[0]))), a = h + TH;
  return (n[0] * Math.sin(a) + n[1] * Math.cos(a)) * CE + n[2] * SE > 0.05;
}
const fp = (f, u, v) => lerp3(lerp3(f[0], f[1], u), lerp3(f[3], f[2], u), v);   // point on a face
const quad = (f, u0, u1, v0, v1) => [fp(f, u0, v0), fp(f, u1, v0), fp(f, u1, v1), fp(f, u0, v1)];
function disc(c, e1, e2, r, n = 18) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a) * r, y = Math.sin(a) * r;
    out.push([c[0] + e1[0] * x + e2[0] * y, c[1] + e1[1] * x + e2[1] * y, c[2] + e1[2] * x + e2[2] * y]);
  }
  return out;
}
const faceDisc = (f, u, v, r) => disc(fp(f, u, v), unit(sub(f[1], f[0])), unit(sub(fp(f, u, 1), fp(f, u, 0))), r);

// A box whose top is pulled in (ix0 at the rear, ix1 at the front, iy at the sides).
// Faces run [bottom-a, bottom-b, top-b, top-a], so (u, v) = (along, up) on every side.
function block(x0, x1, w, z0, z1, ix0 = 0, ix1 = 0, iy = 0) {
  const y0 = -w / 2, y1 = w / 2;
  const b00 = [x0, y0, z0], b10 = [x1, y0, z0], b11 = [x1, y1, z0], b01 = [x0, y1, z0];
  const t00 = [x0 + ix0, y0 + iy, z1], t10 = [x1 - ix1, y0 + iy, z1], t11 = [x1 - ix1, y1 - iy, z1], t01 = [x0 + ix0, y1 - iy, z1];
  return {
    w, x0, x1, z1,
    front: [b10, b11, t11, t10], rear: [b01, b00, t00, t01],
    left: [b11, b01, t01, t11], right: [b00, b10, t10, t00], top: [t00, t10, t11, t01],
    all: [b00, b10, b11, b01, t00, t10, t11, t01],
  };
}
// Move a block's points (all faces share the same vertex arrays).
function shift(b, dx, dy, dz = 0) {
  for (const p of b.all) { p[0] += dx; p[1] += dy; p[2] += dz; }
  return b;
}

// Ops for a box drawn the way a child draws one: contour, the inner edges where two visible faces
// meet, then each visible face coloured in (top lighter, ends darker).
function boxOps(ops, b, col, w, h, ow = 5, ink = '#211e1b') {
  const shown = ['top', 'left', 'right', 'front', 'rear'].filter((k) => visible(b[k], h));
  if (ow > 0) {
    ops.push({ line: b.all, hull: true, closed: true, color: ink, w: ow });
    const edges = new Map();
    for (const k of shown) for (let i = 0; i < 4; i++) {
      const a = b[k][i], c = b[k][(i + 1) % 4], key = [b.all.indexOf(a), b.all.indexOf(c)].sort().join();
      const e = edges.get(key) ?? { a, c, n: 0 }; e.n++; edges.set(key, e);
    }
    for (const e of edges.values()) if (e.n === 2) ops.push({ line: [e.a, e.c], color: ink, w: ow * 0.85 });
  }
  if (col) for (const k of shown) {             // col = null: outline only
    const c = k === 'top' ? shade(col, 0.12) : k === 'front' || k === 'rear' ? shade(col, -0.16) : shade(col, -0.06);
    ops.push({ fill: b[k], color: c, w });
  }
  return shown;
}

// ───────────────────────── 2D helpers ─────────────────────────
function hull(pts) {                   // monotone chain, convex hull of 2D points
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}
// The 45° cast shadow of some solids (lists of 3D points): footprint + each point pushed by its height.
function castShadow(solids, P, len = 0.85) {
  const sh = [];
  for (const s of solids) for (const p of s) {
    const g = P([p[0], p[1], 0]);
    sh.push(g, [g[0] + len * p[2], g[1] + len * p[2]]);
  }
  return hull(sh);
}

// ───────────────────────── baking a sprite ─────────────────────────
// Each crayon remembers its last sprite's area in the buffer, cleared before the next one.
function clearFor(cr, x, y, w, h) {
  const g = 48;                               // wobble/overshoot past the crop + the boil's reach
  if (cr.lastSprite) cr.clear(...cr.lastSprite);
  cr.lastSprite = [x - g, y - g, w + 2 * g, h + 2 * g];
  cr.clear(...cr.lastSprite);
}
function bake(cr, strokes) {
  const ok = strokes.filter((s) => s.path.L > 1);
  cr.schedule(ok); cr.update(ok, 1e9);
}
function forgetDirty(cr) { cr.lastSprite = null; }

// Crayon ops -> crayon-core strokes. world(op) gives the op's point -> world-units mapping.
function opsToStrokes(cr, ops, world, rng, outlineFirst = true) {
  const strokes = [];
  const order = outlineFirst ? [...ops.filter((op) => op.line), ...ops.filter((op) => op.fill)] : ops;
  for (const op of order) {
    const f = world(op);
    if (op.line) {
      const pts = op.hull ? hull(op.line.map(f)) : op.line.map(f);
      strokes.push(cr.line(pts, op.color, { width: op.w, closed: !!op.closed, resist: op.resist, taper: op.taper, press: op.press }));
      continue;
    }
    const pts = op.fill.map(f);
    const dx = pts[1][0] - pts[0][0], dy = pts[1][1] - pts[0][1], el = Math.hypot(dx, dy) || 1;
    const thick = area(pts) / el;              // how deep the face is across its first edge
    const width = Math.max(op.minW ?? 4.5, Math.min(op.w, thick * 0.75));
    const coats = cr.fill(pts, op.color, { angle: op.angle ?? Math.atan2(dy, dx) + (rng() - 0.5) * 0.3, width, resist: op.resist, press: op.press });
    strokes.push(...(op.oneCoat ? coats.slice(0, 1) : coats));
  }
  return strokes;
}

// Crayon ops -> 3 boil frames. An op is { line | fill: points, color, w, closed?, hull?, resist?, flat? };
// points are 3D (projected by P) unless flat (already screen metres). With a cast shadow, it is drawn
// first and cut out under the silhouettes so the body's own paper gaps never show shadow through.
// outlineFirst: all lines, then all colouring (a child's order); otherwise ops keep their order.
function bakeSprite(cr, ops, P, rng, o = {}) {
  const { shadow = null, sil = [], U = 37.5, shadowColor = '#1f4a59', outlineFirst = true, shadowWidth = 13, margin = 16 } = o;
  const PP = (op) => (op.flat ? (p) => p : P);
  // frame: centre the bounding box of everything in the sprite world
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (q) => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); };
  if (shadow) shadow.forEach(grow);
  sil.forEach((s) => s.forEach(grow));
  for (const op of ops) { const f = PP(op); (op.line || op.fill).forEach((p) => grow(f(p))); }
  const OX = WORLD / 2 - ((x0 + x1) / 2) * U, OY = WORLD / 2 - ((y0 + y1) / 2) * U;
  const W2 = (q) => [OX + q[0] * U, OY + q[1] * U];

  const S = cr.bufScale, M = margin;          // margin in world units: wobble, overshoot, boil (+ half the widest stroke)
  const rx = Math.floor((OX + x0 * U - M) * S), ry = Math.floor((OY + y0 * U - M) * S);
  const rw = Math.ceil(((x1 - x0) * U + 2 * M) * S), rh = Math.ceil(((y1 - y0) * U + 2 * M) * S);

  // pass 1: the shadow alone
  let shadowSnaps = null;
  if (shadow) {
    clearFor(cr, rx, ry, rw, rh);
    const sp = shadow.map(W2);
    bake(cr, cr.fill(sp, shadowColor, { angle: Math.PI / 4 + (rng() - 0.5) * 0.2, width: shadowWidth }).slice(0, 1));   // one coat: gappy
    shadowSnaps = cr.snapshots(rx, ry, rw, rh);
  }

  // pass 2: the drawing
  clearFor(cr, rx, ry, rw, rh);
  bake(cr, opsToStrokes(cr, ops, (op) => (op.flat ? W2 : (p) => W2(P(p))), rng, outlineFirst));
  const snaps = cr.snapshots(rx, ry, rw, rh);

  // compose: shadow, minus the silhouette, then the drawing on top
  const frames = !shadow ? snaps : [0, 1, 2].map((b) => {
    const cv = document.createElement('canvas'); cv.width = rw; cv.height = rh;
    const c = cv.getContext('2d');
    c.drawImage(shadowSnaps[b], 0, 0);
    c.globalCompositeOperation = 'destination-out';
    for (const s of sil) {
      c.beginPath();
      s.forEach((q, i) => { const w = W2(q); c[i ? 'lineTo' : 'moveTo'](w[0] * S - rx, w[1] * S - ry); });
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    c.drawImage(snaps[b], 0, 0);
    return cv;
  });
  return { frames, ax: OX * S - rx, ay: OY * S - ry, w: rw, h: rh, u: U };
}

return { TH, EL, SE, CE, WORLD, mulberry32, shade, sub, cross, lerp3, unit, proj, depth, visible, fp, quad, disc, faceDisc, block, shift, boxOps, hull, area, castShadow, bake, forgetDirty, opsToStrokes, bakeSprite };
})();
const { U, LANE, MEDIAN, INK, PAL, LEN, MIX, makeCar, CW, MARKS, makeMark, XC, groundBounds, roadMarks, makeLanes, mod, stepTraffic } = (() => {
/**
 * street.js — the cars and road markings of the crayon street (shared by traffic and pigeon).
 *
 *   makeCar(cr, type, heading, palette, seed)   one car sprite (3 boil frames, 45° cast shadow)
 *   makeMark(cr, kind, seed)                     one piece of road paint (centre line, dash, zebra, stop line)
 */

const U = 37.5;                        // sprite world units per metre
const LANE = 3.0;                      // lane width (m)
const MEDIAN = 1.4;                    // gap between the two directions (m)

const INK = '#211e1b';
const TIRE = '#23201e', SHADOW = '#1f4a59', LIGHT_Y = '#f7c62c', LIGHT_R = '#da3328';
const PAL = {
  bus:   [{ body: '#d8392a', win: '#26272c' }, { body: '#2e9086', win: '#24282c' }],
  suv:   [{ body: '#5847d4', win: '#25242e' }, { body: '#4c9a3e', win: '#24282a' }],
  sedan: [{ body: '#d2c8b4', win: '#2c4b9c' }, { body: '#2f6ec2', win: '#24262e' }],
  taxi:  [{ body: '#f29a1d', win: '#28252a', sign: '#fff1b3' }, { body: '#f3c32e', win: '#28252a', sign: '#f6f1e6' }],
};
const LEN = { bus: 9, suv: 4.7, sedan: 4.5, taxi: 4.5 };
const MIX = [['sedan', 0.34], ['taxi', 0.27], ['suv', 0.29], ['bus', 0.1]];

// ───────────────────────── car models ─────────────────────────
// Returns draw ops in painting order plus the solids (for silhouette + cast shadow).
function buildCar(type, h, pal, rng) {
  const J = (v, k = 0.05) => v * (1 + (rng() - 0.5) * 2 * k);
  const ops = [], solids = [];
  const vis = (f) => visible(f, h);
  const faces = (b, col, w, ow = 5) => { boxOps(ops, b, col, w, h, ow, INK); solids.push(b.all); };
  const win = (pts) => ops.push({ fill: pts, color: pal.win, w: 7, resist: 0.25 }, { line: pts, closed: true, color: INK, w: 4.4 });
  const dot = (pts, color, w = 5) => ops.push({ fill: pts, color, w, resist: 0.2 });
  const stroke = (pts, w = 4.4, color = INK) => ops.push({ line: pts, color, w });
  const wheels = (b, xs, r) => {
    const side = vis(b.left) ? 1 : -1, y = side * (b.w / 2 + 0.06), R = r * 1.18;   // a bit chunkier than real
    for (const x of xs) {
      const pts = disc([x, y, R * 0.9], [1, 0, 0], [0, 0, 1], R);
      ops.push({ fill: pts, color: TIRE, w: 10, resist: 0.1 }, { line: pts, closed: true, color: TIRE, w: 5.5 });
      ops.push({ fill: disc([x, y + side * 0.01, R * 0.9], [1, 0, 0], [0, 0, 1], R * 0.32, 10), color: '#9b958b', w: 4, resist: 0.1 });
      solids.push(pts);
    }
  };
  const sideOf = (b) => (vis(b.left) ? b.left : vis(b.right) ? b.right : null);

  if (type === 'bus') {
    const L = J(9, 0.03), W = 2.45, zb = 0.35, zt = J(3.0, 0.03);
    const body = block(-L / 2, L / 2, W, zb, zt, 0.08, 0.14, 0.05);
    faces(body, pal.body, 16);
    const roof = block(-1.8, 0.5, 1.5, zt, zt + 0.28, 0.06, 0.06, 0.06);
    faces(roof, '#cdc5b6', 9, 4);
    const sd = sideOf(body);
    if (sd) for (let i = 0; i < 5; i++) { const u0 = 0.05 + i * 0.182; win(quad(sd, u0, u0 + 0.15, 0.5, 0.84)); }
    if (vis(body.front)) {
      const f = body.front;
      win(quad(f, 0.07, 0.93, 0.42, 0.82));
      ops.push({ fill: quad(f, 0.22, 0.78, 0.87, 0.96), color: '#2a2622', w: 5, resist: 0.2 });
      stroke([fp(f, 0.28, 0.27), fp(f, 0.72, 0.27)], 5); stroke([fp(f, 0.28, 0.2), fp(f, 0.72, 0.2)], 5);
      dot(faceDisc(f, 0.13, 0.17, 0.2), LIGHT_Y, 6); dot(faceDisc(f, 0.87, 0.17, 0.2), LIGHT_Y, 6);
    }
    if (vis(body.rear)) {
      const f = body.rear;
      win(quad(f, 0.16, 0.84, 0.58, 0.86));
      dot(faceDisc(f, 0.13, 0.2, 0.19), LIGHT_R, 6); dot(faceDisc(f, 0.87, 0.2, 0.19), LIGHT_R, 6);
      stroke([fp(f, 0.06, 0.08), fp(f, 0.94, 0.08)], 5);
    }
    wheels(body, [-L / 2 + J(1.7), L / 2 - J(1.6)], 0.52);
  } else if (type === 'suv') {
    const L = J(4.7), W = 1.95, zb = 0.42, zm = J(1.05), zt = J(1.9, 0.03);
    const body = block(-L / 2, L / 2, W, zb, zm, 0.08, 0.16, 0.04);
    const cab = block(-L / 2 + 0.12, L / 2 - J(1.15), W - 0.1, zm, zt, 0.08, J(0.42), 0.1);
    faces(body, pal.body, 15);
    if (vis(body.front)) {
      const f = body.front;
      dot(faceDisc(f, 0.17, 0.62, 0.21), LIGHT_Y, 6); dot(faceDisc(f, 0.83, 0.62, 0.21), LIGHT_Y, 6);
      stroke([fp(f, 0.32, 0.5), fp(f, 0.68, 0.5)], 5); stroke([fp(f, 0.32, 0.36), fp(f, 0.68, 0.36)], 5);
      stroke([fp(f, 0.04, 0.12), fp(f, 0.96, 0.12)]);
    }
    if (vis(body.rear)) {
      const f = body.rear;
      dot(faceDisc(f, 0.13, 0.66, 0.18), LIGHT_R, 6); dot(faceDisc(f, 0.87, 0.66, 0.18), LIGHT_R, 6);
      dot(faceDisc(f, 0.5, 0.5, 0.36), TIRE, 7);
      stroke([fp(f, 0.04, 0.12), fp(f, 0.96, 0.12)]);
    }
    faces(cab, pal.body, 13);
    const sd = sideOf(cab);
    if (sd) { win(quad(sd, 0.06, 0.32, 0.18, 0.84)); win(quad(sd, 0.37, 0.64, 0.18, 0.84)); win(quad(sd, 0.69, 0.92, 0.18, 0.84)); }
    if (vis(cab.front)) win(quad(cab.front, 0.1, 0.9, 0.14, 0.86));
    if (vis(cab.rear)) win(quad(cab.rear, 0.14, 0.86, 0.3, 0.86));
    for (const y of [-1, 1]) {                                  // roof rails
      const yy = y * (cab.w / 2 - 0.22);
      stroke([[cab.x0 + 0.3, yy, zt + 0.06], [cab.x1 - 0.55, yy, zt + 0.06]], 4.2);
    }
    wheels(body, [-L / 2 + J(1.05), L / 2 - J(1.05)], 0.43);
  } else {                                                      // sedan / taxi
    const L = J(4.5), W = J(1.8, 0.03), zb = 0.3, zm = J(0.86), zt = J(1.42, 0.03);
    const body = block(-L / 2, L / 2, W, zb, zm, 0.12, 0.2, 0.04);
    const cab = block(-L / 2 + J(0.95), L / 2 - J(1.35), W - 0.12, zm, zt, J(0.4), J(0.55), 0.14);
    faces(body, pal.body, 15);
    if (vis(body.front)) {
      const f = body.front;
      dot(faceDisc(f, 0.17, 0.58, 0.2), LIGHT_Y, 6); dot(faceDisc(f, 0.83, 0.58, 0.2), LIGHT_Y, 6);
      stroke([fp(f, 0.33, 0.45), fp(f, 0.67, 0.45)], 5);
      stroke([fp(f, 0.04, 0.12), fp(f, 0.96, 0.12)]);
    }
    if (vis(body.rear)) {
      const f = body.rear;
      dot(faceDisc(f, 0.16, 0.6, 0.19), LIGHT_R, 6); dot(faceDisc(f, 0.84, 0.6, 0.19), LIGHT_R, 6);
      stroke([fp(f, 0.04, 0.12), fp(f, 0.96, 0.12)]);
    }
    if (type === 'taxi') {                                      // checker stripe along the side
      const sd = sideOf(body);
      if (sd) for (let u = 0.08; u < 0.9; u += 0.11) stroke([fp(sd, u, 0.55), fp(sd, u + 0.05, 0.55)], 5.5);
    }
    faces(cab, pal.body, 13);
    const sd = sideOf(cab);
    if (sd) { win(quad(sd, 0.1, 0.47, 0.16, 0.84)); win(quad(sd, 0.53, 0.9, 0.16, 0.84)); }
    if (vis(cab.front)) win(quad(cab.front, 0.1, 0.9, 0.14, 0.86));
    if (vis(cab.rear)) win(quad(cab.rear, 0.12, 0.88, 0.18, 0.84));
    if (type === 'taxi') {
      const mid = (cab.x0 + cab.x1) / 2 + 0.05;
      faces(block(mid - 0.28, mid + 0.28, 0.72, zt, zt + 0.26, 0.04, 0.04, 0.04), pal.sign, 6, 3.6);
    }
    wheels(body, [-L / 2 + J(1.0), L / 2 - J(1.05)], 0.36);
  }
  return { ops, solids };
}

// ───────────────────────── sprites ─────────────────────────
function makeCar(cr, type, h, pal, seed) {
  const rng = mulberry32(seed);
  const { ops, solids } = buildCar(type, h, pal, rng);
  const P = (p) => proj(p, h);
  return bakeSprite(cr, ops, P, rng, { U, shadow: castShadow(solids, P), sil: solids.map((s) => hull(s.map(P))), shadowColor: SHADOW });
}

// ───────────────────────── road markings ─────────────────────────
// Small pieces in ground metres (anchor at the origin), drawn in crayon and laid along the road.
const YELLOW = '#efb422', PAINT = '#a7a29a', PAINT_EDGE = '#86827b';
const CW = 3.6;                                // crosswalk stripe length along the road
const MARKS = { center: 3, dash: 4, stripe: 4, stop: 3 };   // variants of each piece
function makeMark(cr, kind, seed) {
  const rng = mulberry32(seed), j = (k) => (rng() - 0.5) * 2 * k;
  const ops = [];
  if (kind === 'center') {                     // double yellow line, one 10 m piece
    for (const side of [-1, 1]) {
      const y = side * 0.17;
      ops.push({ line: [[0, y + j(0.03), 0], [5, y + j(0.05), 0], [10, y + j(0.03), 0]], color: YELLOW, w: 6.5 });
    }
  } else if (kind === 'dash') {                // lane line dash
    ops.push({ line: [[0, j(0.04), 0], [3, j(0.04), 0]], color: PAINT, w: 6.5 });
  } else if (kind === 'stripe') {              // one zebra stripe, outlined then coloured in
    const r = [[0, -0.26, 0], [CW, -0.26 + j(0.04), 0], [CW, 0.26, 0], [0, 0.26 + j(0.04), 0]];
    ops.push({ line: r, closed: true, color: PAINT_EDGE, w: 4 }, { fill: r, color: PAINT, w: 9 });
  } else {                                     // stop line across one lane
    ops.push({ line: [[j(0.05), -LANE / 2 + 0.2, 0], [j(0.05), LANE / 2 - 0.2, 0]], color: PAINT, w: 10 });
  }
  return bakeSprite(cr, ops, (p) => proj(p, 0), rng, { U });
}

// ───────────────────────── the road and its traffic ─────────────────────────
// Ground metres: x runs down-right on screen, y down-left; the road's centre line is y = 0 through the
// screen centre. vw, vh in css px, PM css px per metre.
const XC = -4;                         // where the crosswalk crosses the road (ground x)
function groundBounds(vw, vh, PM) {    // the patch of ground the screen sees, with room for car heights
  const c = Math.cos(TH), s = Math.sin(TH), xs = [], ys = [];
  for (const [px, py] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const qx = (px * vw) / 2 / PM, qy = (py * vh) / 2 / PM / SE;
    xs.push(qx * c + qy * s); ys.push(-qx * s + qy * c);
  }
  return { x0: Math.min(...xs) - 14, x1: Math.max(...xs) + 14, yLo: Math.min(...ys) - 6, yHi: Math.max(...ys) + 6 };
}

function roadMarks({ x0, x1, yLo, yHi }) {    // where every piece of road paint goes
  const rng = mulberry32(99), marks = [];
  const put = (kind, x, y) => marks.push({ key: `${kind}-${(rng() * MARKS[kind]) | 0}`, x, y, phase: (rng() * 3) | 0 });
  const gap = CW / 2 + 1.6, far = Math.max(-yLo, yHi);   // bare road either side of the crosswalk (stop lines there)
  // centre line: 10 m pieces, overlapping a little, running away from the crosswalk both ways
  for (let x = XC + gap; x < x1; x += 9.6) put('center', x, 0);
  for (let x = XC - gap - 10; x > x0 - 10; x -= 9.6) put('center', x, 0);
  // lane lines between lanes of the same direction: 3 m dashes every 8 m
  for (let y = MEDIAN / 2 + LANE; y <= far; y += LANE) for (const yy of [y, -y]) {
    if (yy < yLo || yy > yHi) continue;
    for (let x = XC + gap + 1; x < x1; x += 8) put('dash', x, yy);
    for (let x = XC - gap - 4; x > x0 - 3; x -= 8) put('dash', x, yy);
  }
  // zebra stripes across the whole road, and a stop line in every lane before it
  for (let y = Math.floor(yLo); y < yHi; y += 1.0) put('stripe', XC - CW / 2, y);
  for (let y = MEDIAN / 2 + LANE / 2; y - LANE <= far; y += LANE) {
    if (y <= yHi) put('stop', XC - CW / 2 - 1.0, y);        // down lanes arrive from the upper left
    if (-y >= yLo) put('stop', XC + CW / 2 + 1.0, -y);      // up lanes arrive from the lower right
  }
  return marks;
}

function makeLanes({ x0, x1, yLo, yHi }, seed) {   // lanes full of cars, gaps and all
  const rng = mulberry32(seed * 131 + 17), Lx = x1 - x0;
  const pick = () => { let r = rng(); for (const [t, p] of MIX) { if ((r -= p) <= 0) return t; } return 'sedan'; };
  // y > 0 is the lower-left half (down lanes, heading to the bottom-right), y < 0 the upper-right (up lanes)
  const laneY = (i) => (i >= 0 ? 1 : -1) * (MEDIAN / 2 + LANE * ((i >= 0 ? i : -i - 1) + 0.5));
  const lanes = [];
  for (let i = Math.floor((yLo + MEDIAN / 2) / LANE) - 1; laneY(i) <= yHi; i++) {
    if (laneY(i) < yLo) continue;
    const dir = i >= 0 ? 1 : -1;
    const lane = { y: laneY(i) + (rng() - 0.5) * 0.3, dir, x0, Lx, cars: [],
      stopX: dir > 0 ? XC - CW / 2 - 1.0 : XC + CW / 2 + 1.0 };          // the stop line this lane meets
    let pos = rng() * 4;
    for (;;) {
      const type = pick(), len = LEN[type];
      if (pos + len + 1.5 > Lx) break;
      lane.cars.push({ key: `${type}-${dir > 0 ? 'd' : 'u'}-${rng() < 0.5 ? 0 : 1}`, len, x: x0 + pos + len / 2,
        v: 0, vmax: (type === 'bus' ? 2.4 : 2.8) + rng() * 1.4, phase: (rng() * 3) | 0 });
      pos += len + 1.4 + rng() * 2.4 + (rng() < 0.15 ? 3 + rng() * 8 : 0);
    }
    lane.cars.sort((a, b) => (a.x - b.x) * dir);                          // back of the queue -> front
    lanes.push(lane);
  }
  return lanes;
}

// Driving: follow the car ahead, stop at the line while the crosswalk is red. An optional
// react(car, lane) can add a hazard: { room } caps how far the car may go, { rush } makes it bolt.
const GREEN = 8, RED = 6;                     // seconds; both directions share the light (people cross)
const mod = (a, m) => ((a % m) + m) % m;
function stepTraffic(lanes, state, dt, react) {
  state.t += dt;
  const red = state.t % (GREEN + RED) >= GREEN;
  for (const L of lanes) {
    const n = L.cars.length;
    const next = L.cars.map((car, k) => {
      const lead = L.cars[(k + 1) % n];
      const front = car.x + (L.dir * car.len) / 2;
      let room = n > 1 ? mod((lead.x - (L.dir * lead.len) / 2 - front) * L.dir, L.Lx) - 1.2 : Infinity;   // keep a bumper gap
      if (red) {
        const toLine = mod((L.stopX - front) * L.dir, L.Lx);
        if (toLine < 28) room = Math.min(room, toLine - 0.4);                // ahead of us and close: brake for it
      }
      let vmax = car.vmax, acc = 2.2;
      const h = react && react(car, L);
      if (h) {
        if (h.room !== undefined) room = Math.min(room, h.room);
        if (h.rush) { vmax = h.rush; acc = 9; }
      }
      const want = Math.max(0, Math.min(vmax, room * (h && h.rush ? 2 : 0.8)));
      car.v += Math.max(-9 * dt, Math.min(acc * dt, want - car.v));         // pull away gently (or bolt), brake firmly
      const ds = Math.max(0, Math.min(car.v * dt, room));
      return L.x0 + mod(car.x + L.dir * ds - L.x0, L.Lx);
    });
    L.cars.forEach((car, k) => (car.x = next[k]));
  }
}

return { U, LANE, MEDIAN, INK, PAL, LEN, MIX, makeCar, CW, MARKS, makeMark, XC, groundBounds, roadMarks, makeLanes, mod, stepTraffic };
})();
(() => {
/**
 * pigeon.js — a person-sized crayon pigeon wanders the crayon street, and the traffic gets out of its way.
 *
 *   bird      follows the mouse (desktop) or a finger dragged across the screen (mobile); walks with
 *             the pigeon head-bob, pecks when idle, takes off when the target is far and lands near it
 *   traffic   the street from traffic.js; a pigeon in front of a car stops it, a pigeon coming at its
 *             side or tail makes it bolt (if the road ahead is clear) — with a crayon "!" over the car
 */

const FPS = 12, BOIL_FPS = 8;
const UB = 90;                                // sprite units per metre for the bird (finer than the cars)
const BIG = 1.7;                              // the model is a 1.6 m pigeon; on the road it's drawn this much bigger

const C = {
  body: '#8e97a7', wing: '#7b8394', bar: '#2c2b30', neck: '#4f8f6c', sheen: '#7d5c97', head: '#8a93a2',
  beak: '#3b3634', cere: '#f2ede2', eye: '#ec6a28', feet: '#e5838a', tail: '#6d7483', band: '#2f2e34',
  shadow: '#1f4a59', alarm: '#e8452c',
};

// ───────────────────────── the pigeon ─────────────────────────
// A giant pigeon (about 1.6 m tall, 2.3 m beak to tail) in metres; local x = facing, y = left, z = up.
// Round parts are ellipsoids; each is projected and its convex hull coloured in like a kid fills a blob.
const POSES = {
  walk0: { step: [0.22, -0.12], head: 0.1 },  walk1: { step: [0.05, 0.05], head: 0.1 },
  walk2: { step: [-0.12, 0.22], head: -0.06 }, walk3: { step: [0.05, 0.05], head: -0.06 },
  idle:  { step: [0.04, -0.04], head: 0 },    peck: { step: [0.04, -0.04], head: 0, peck: true },
  flyUp: { fly: 0.75 },                       flyDown: { fly: -0.45 },
};

function ellipsoid(c, r, pitch = 0, n = 10) {  // points on an ellipsoid, nose pitched up by `pitch`
  const out = [], cp = Math.cos(pitch), sp = Math.sin(pitch);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    for (let j = 0; j < n * 2; j++) {
      const b = (j / (n * 2)) * Math.PI * 2;
      const x = Math.sin(a) * Math.cos(b) * r[0], y = Math.sin(a) * Math.sin(b) * r[1], z = Math.cos(a) * r[2];
      out.push([c[0] + x * cp - z * sp, c[1] + y, c[2] + x * sp + z * cp]);
    }
  }
  return out;
}

function buildPigeon(pose, h) {
  const Q = POSES[pose], P = (p) => proj(p, h), parts = [], solids = [];
  const blob = (pts3, color, ow = 3) => {        // a round part: inked outline, then coloured in
    const poly = hull(pts3.map(P));
    return [{ line: poly, closed: true, color: INK, w: ow, flat: true }, { fill: poly, color, w: 9, flat: true }];
  };
  const part = (pts3, ops, bias = 0) => { parts.push({ d: pts3.reduce((a, p) => a + depth(p, h), 0) / pts3.length + bias, ops }); solids.push(pts3); };
  const L = (pts3, color, w, press = 1.3) => ({ line: pts3.map(P), color, w, press, flat: true });
  const fly = Q.fly !== undefined;

  // legs and feet (tucked away in flight)
  if (!fly) for (const [i, s] of [[0, 1], [1, -1]]) {
    const hip = [0.05, s * 0.14, 0.56], foot = [0.05 + Q.step[i], s * 0.17, 0.02];
    const toes = [[0.2, 0], [0.17, s * 0.1], [0.17, -s * 0.1]].map(([dx, dy]) => [foot[0] + dx, foot[1] + dy, 0.01]);
    part([hip, foot], [L([hip, foot], C.feet, 7), ...toes.map((t) => L([foot, t], C.feet, 5))]);
  }
  // tail: a wedge out the back with a dark band at the tip
  const tail = [[-0.5, 0.13, 0.78], [-0.5, -0.13, 0.78], [-1.12, -0.24, 0.66], [-1.12, 0.24, 0.66]];
  const band = [[-0.98, 0.21, 0.68], [-0.98, -0.21, 0.68], [-1.12, -0.24, 0.66], [-1.12, 0.24, 0.66]];
  part(tail, [...blob(tail, C.tail), { fill: hull(band.map(P)), color: C.band, w: 6, flat: true }]);
  // body
  const body = ellipsoid([0, 0, 0.84], [0.62, 0.36, 0.38], 0.22);
  part(body, blob(body, C.body));
  // wings: folded along the sides with two black bars, or spread and flapping
  for (const s of [1, -1]) {
    if (!fly) {
      const wing = ellipsoid([-0.14, s * 0.27, 0.95], [0.56, 0.12, 0.25], 0.18, 8);
      const bars = [-0.02, -0.24].map((x) => L([[x, s * 0.37, 0.82], [x - 0.08, s * 0.38, 1.06]], C.bar, 5, 1.6));
      part(wing, [...blob(wing, C.wing), ...bars], 0.05);
    } else {
      const f = Q.fly, root = [[0.28, s * 0.25, 1.0], [-0.36, s * 0.25, 0.98]];
      const tip = [[-0.2, s * 1.55, 1.0 + f], [-0.5, s * 1.25, 0.95 + f * 0.75], [-0.42, s * 0.85, 0.96 + f * 0.4]];
      const wing = [...root, ...tip];
      const edge = [[-0.2, s * 1.55, 1.0 + f], [-0.5, s * 1.25, 0.95 + f * 0.75], [-0.48, s * 1.0, 0.96 + f * 0.5]];
      part(wing, [...blob(wing, C.wing), L(edge, C.band, 9, 1.5), L([[0.0, s * 0.6, 1.0 + f * 0.25], [-0.32, s * 0.62, 0.98 + f * 0.25]], C.bar, 5)], 0.05);
    }
  }
  // neck and breast: green with a purple sheen
  const peck = Q.peck, hx = 0.6 + (Q.head ?? 0) + (peck ? 0.18 : 0), hz = peck ? 0.62 : 1.38;
  const neck = ellipsoid([0.4 + (peck ? 0.1 : 0), 0, peck ? 0.92 : 1.08], [0.25, 0.26, 0.3], peck ? -0.6 : 0.3, 8);
  part(neck, [...blob(neck, C.neck), { fill: hull(ellipsoid([0.47, 0, peck ? 0.85 : 1.0], [0.14, 0.2, 0.16], 0, 6).map(P)), color: C.sheen, w: 6, flat: true, resist: 0.3 }], 0.1);
  // head (round billboard), beak, eye on the side that faces us
  const hc = [hx, 0, hz], c2 = P(hc), r = 0.2;
  const fwd = (() => { const a = P([hx + 0.3, 0, hz]); const l = Math.hypot(a[0] - c2[0], a[1] - c2[1]) || 1; return [(a[0] - c2[0]) / l, (a[1] - c2[1]) / l]; })();
  const circ = (cx, cy, rr, n = 14) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * 6.283) * rr, cy + Math.sin((i / n) * 6.283) * rr]);
  const head = circ(c2[0], c2[1], r);
  const bb = P([hx + 0.17, 0, hz + (peck ? -0.04 : -0.02)]), bt = P([hx + 0.42, 0, hz - (peck ? 0.14 : 0.06)]);
  const nx = -fwd[1], ny = fwd[0], bw = 0.055;
  const beak = [[bb[0] + nx * bw, bb[1] + ny * bw], bt, [bb[0] - nx * bw, bb[1] - ny * bw]];
  const side = depth([0, 0.3, 0], h) > depth([0, -0.3, 0], h) ? 1 : -1;   // the cheek turned towards us
  const e2 = P([hx + 0.07, side * 0.13, hz + 0.05]);
  const headOps = [
    { line: head, closed: true, color: INK, w: 3, flat: true }, { fill: head, color: C.head, w: 7, flat: true },
    { fill: beak, color: C.beak, w: 3, minW: 1.5, flat: true, resist: 0.1 }, { line: [...beak, beak[0]], color: INK, w: 2, flat: true, taper: 0.3 },
    { fill: circ(bb[0] + ny * 0.03, bb[1] - nx * 0.03 - 0.02, 0.045, 8), color: C.cere, w: 2, minW: 1.5, flat: true, resist: 0.1 },
  ];
  if (Math.abs(fwd[0]) > 0.25 || fwd[1] > -0.5) headOps.push(  // facing away we see the back of the head
    { fill: circ(e2[0], e2[1], 0.055, 8), color: C.eye, w: 2, minW: 1.5, flat: true, resist: 0.1 },
    { fill: circ(e2[0] + fwd[0] * 0.01, e2[1] + fwd[1] * 0.01, 0.025, 6), color: INK, w: 2, minW: 1.2, flat: true, resist: 0.05 });
  parts.push({ d: depth(hc, h) + (fwd[1] < -0.5 ? -0.2 : 0.4), ops: headOps });
  solids.push([[hx, 0, hz + r]]);
  parts.sort((a, b) => a.d - b.d);
  return { ops: parts.flatMap((p) => p.ops), solids, fly };
}

function makePigeon(cr, pose, hk, seed) {
  const h = hk * (Math.PI / 4), rng = mulberry32(seed);
  const { ops, solids, fly } = buildPigeon(pose, h);
  const P = (p) => proj(p, h), pts = solids.flat();
  const lw = UB / 44;                          // stroke widths above are for ~44 units/m
  ops.forEach((o) => (o.w *= lw));
  return bakeSprite(cr, ops, P, rng, {
    U: UB, outlineFirst: false, shadowColor: C.shadow, shadowWidth: 8 * lw,
    ...(fly ? {} : { shadow: castShadow([ellipsoid([0, 0, 0.84], [0.62, 0.36, 0.38], 0.22, 6), [[0.6, 0, 1.55]]], P, 0.6), sil: [hull(pts.map(P))] }),
  });
}

// a crayon "!" over a car that's stopping for the bird or bolting from it
function alarmOps() {
  const s = [[0, -1.1], [0.04, -0.35]], dot = Array.from({ length: 10 }, (_, i) => [0.05 + Math.cos(i * 0.628) * 0.11, 0.0 + Math.sin(i * 0.628) * 0.11]);
  return [
    { line: s, color: INK, w: 34, press: 1.8, flat: true }, { fill: dot.map(([x, y]) => [x, y]), color: INK, w: 10, press: 1.8, flat: true },
    { line: s, color: C.alarm, w: 18, press: 1.8, resist: 0.02, flat: true },
    { fill: dot.map(([x, y]) => [x * 0.5 + 0.025, y * 0.5]), color: C.alarm, w: 6, press: 1.8, resist: 0.02, flat: true },
  ];
}

// ───────────────────────── the scene ─────────────────────────
const HEADS = 8, headKey = (vx, vy) => ((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % HEADS) + HEADS) % HEADS;
const R_BIRD = 1.0 * BIG;                     // how much road the bird takes up (m)
const yieldNow = () => new Promise((r) => setTimeout(r, 0));

function makePaper(cr) {
  cr.clear();
  const half = cr.bufSize / 2, tile = cr.snapshot(0, 0, 0, half, half, true);
  const m = document.createElement('canvas'); m.width = m.height = half * 2;
  const c = m.getContext('2d');               // mirror-tile: the paper's big octaves don't wrap
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    c.setTransform(sx, 0, 0, sy, sx < 0 ? half * 2 : 0, sy < 0 ? half * 2 : 0);
    c.drawImage(tile, 0, 0);
  }
  return m;
}

/**
 * The street + pigeon on a canvas, sized to the canvas's own box (call layout() when it changes).
 * Nothing is drawn until start(); the crayon sprites are baked on the first start.
 *   onStatus(text, done)   loading / hint messages
 */
function createPigeonScene(canvas, { seed = 7, onStatus = () => {}, sheet = null } = {}) {
  const ctx = canvas.getContext('2d');
  const cr = createCrayon(document.createElement('canvas'), { world: WORLD, seed, mode: 'sweep' });
  cr.resize(640, 2);
  const S = cr.bufScale;
  let vw = 0, vh = 0, dpr = 1, PM = 40, pattern = null, lanes = [], marks = [], paper = null;
  let running = false, ready = false, baking = null, raf = 0, lastTick = -1, t0 = 0;
  const sim = { t: 0 }, sprites = {}, markSprites = {}, birdSprites = {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bird = { x: 3, y: 0.2, z: 0, vx: 0, vy: 0, hk: 1, flying: false, walked: 0, still: 0 };
  const target = { x: bird.x, y: bird.y };

  function layout() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    vw = r.width; vh = r.height; dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    PM = Math.max(18, Math.min(46, Math.min(vw, vh) / 11));
    if (paper) { const k = (PM / U / S) * dpr; pattern = ctx.createPattern(paper, 'repeat'); pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0])); }
    const b = groundBounds(vw, vh, PM);
    marks = roadMarks(b); lanes = makeLanes(b, seed); sim.t = 0;
    render(0, 0);
  }
  function toScreen(x, y, z = 0) {              // ground metres -> device px
    const c = Math.cos(TH), s = Math.sin(TH), qx = x * c - y * s, qy = x * s + y * c;
    return [(qx * PM + vw / 2) * dpr, ((qy * SE - z * CE) * PM + vh / 2) * dpr];
  }
  function toGround(X, Y) {                     // css px within the canvas -> ground metres
    const qx = (X - vw / 2) / PM, qy = (Y - vh / 2) / PM / SE, c = Math.cos(TH), s = Math.sin(TH);
    return [qx * c + qy * s, -qx * s + qy * c];
  }

  // ── the bird ──
  function stepBird(dt) {
    const dx = target.x - bird.x, dy = target.y - bird.y, d = Math.hypot(dx, dy);
    if (!bird.flying && d > 8) bird.flying = true;               // far: take off
    if (bird.flying && d < 1.2) bird.flying = false;             // there: land
    const top = bird.flying ? 12 : 4.2, sp = d < 0.25 ? 0 : Math.min(top, d * (bird.flying ? 2.4 : 2.2));
    const wx = d ? (dx / d) * sp : 0, wy = d ? (dy / d) * sp : 0, a = (bird.flying ? 16 : 14) * dt;
    bird.vx += Math.max(-a, Math.min(a, wx - bird.vx)); bird.vy += Math.max(-a, Math.min(a, wy - bird.vy));
    bird.x += bird.vx * dt; bird.y += bird.vy * dt;
    bird.z += ((bird.flying ? 2.6 : 0) - bird.z) * Math.min(1, dt * 4);
    const v = Math.hypot(bird.vx, bird.vy);
    if (v > 0.25) bird.hk = headKey(bird.vx, bird.vy);
    bird.walked += v * dt;
    bird.still = v < 0.25 && !bird.flying ? bird.still + dt : 0;
  }
  function birdPose(t) {
    if (bird.flying || bird.z > 0.3) return Math.floor(t * 8) % 2 ? 'flyUp' : 'flyDown';
    if (bird.still > 0.8) return Math.floor((bird.still - 0.8) / 0.35) % 2 ? 'peck' : 'idle';   // pecking about
    if (Math.hypot(bird.vx, bird.vy) < 0.25) return 'idle';
    return `walk${Math.floor(bird.walked / (0.32 * BIG)) % 4}`;
  }
  // how each car reacts: a bird ahead in its lane stops it; a bird at its side or tail makes it bolt
  function react(car, L) {
    if (bird.z > 1.2) return null;
    if (Math.abs(bird.y - L.y) > LANE / 2 + R_BIRD * 0.8) return null;
    const rel = (bird.x - car.x) * L.dir;      // + : the bird is ahead of the car's middle
    if (rel > 0 && rel < car.len / 2 + R_BIRD + 14) {
      const gap = rel - car.len / 2 - R_BIRD - 0.4;
      if (gap < 6) car.alarm = 0.7;
      return { room: Math.max(0, gap) };
    }
    if (rel <= 0 && rel > -(car.len / 2 + R_BIRD + 2.5)) { car.alarm = 0.7; return { rush: 9 }; }
    return null;
  }

  // ── drawing ──
  function render(boil, t) {
    if (!vw) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pattern || '#ece4d5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (sheet !== null) {                     // ?sheet=walk : the bird drawings in a grid, for checking
      const keys = Object.keys(birdSprites).filter((k) => k.startsWith(sheet));
      const cols = Math.max(1, Math.ceil(Math.sqrt(keys.length * canvas.width / canvas.height))), rows = Math.max(1, Math.ceil(keys.length / cols));
      const cw = canvas.width / cols, ch = canvas.height / rows;
      keys.forEach((k, i) => { const sp = birdSprites[k], f = Math.min(cw / sp.w, ch / sp.h) * 0.9; ctx.drawImage(sp.frames[boil % 3], (i % cols) * cw + (cw - sp.w * f) / 2, Math.floor(i / cols) * ch + (ch - sp.h * f) / 2, sp.w * f, sp.h * f); });
      return;
    }
    const draw = (sp, [sx, sy], f, k) => {
      const x = sx - sp.ax * k, y = sy - sp.ay * k, w = sp.w * k, h = sp.h * k;
      if (x > canvas.width || y > canvas.height || x + w < 0 || y + h < 0) return;
      ctx.drawImage(sp.frames[((f % 3) + 3) % 3], x, y, w, h);
    };
    const kc = (PM / U / S) * dpr, kb = (BIG * PM / UB / S) * dpr;
    for (const m of marks) if (markSprites[m.key]) draw(markSprites[m.key], toScreen(m.x, m.y), boil + m.phase, kc);

    const list = [];
    for (const L of lanes) for (const car of L.cars) if (sprites[car.key]) list.push({ z: L.y * 1e4 + car.x, fn: () => draw(sprites[car.key], toScreen(car.x, L.y), boil + car.phase, kc) });
    const bs = birdSprites[`${birdPose(t)}|${bird.hk}`];
    if (bird.z > 0.05 && birdSprites.shadow) {   // in the air: its shadow lies on the road, 45° away
      const [gx, gy] = toScreen(bird.x, bird.y), o = 0.85 * bird.z * PM * dpr;
      list.push({ z: bird.y * 1e4 + bird.x - 0.5, fn: () => draw(birdSprites.shadow, [gx + o, gy + o], boil, kb) });
    }
    if (bs) list.push({ z: Infinity, fn: () => draw(bs, toScreen(bird.x, bird.y, bird.z), boil + 1, kb) });   // the star of the show: never hidden
    list.sort((a, b) => a.z - b.z);
    for (const it of list) it.fn();

    if (sprites.alarm) for (const L of lanes) for (const car of L.cars) if (car.alarm > 0) {   // "!" over startled cars
      const [x, y] = toScreen(car.x, L.y, car.len > 6 ? 4.4 : 3.1);
      draw(sprites.alarm, [x, y - 6 * dpr], boil + car.phase, (1.5 * PM * dpr) / (1.3 * 40 * S));   // about 1.5 m tall
    }
  }

  // ── running ──
  function frame(now) {
    if (!running) return;
    const tick = Math.floor(((now - t0) / 1000) * FPS);
    if (tick !== lastTick) {
      if (!reduced) for (let i = Math.max(lastTick, tick - 6); i < tick; i++) {
        stepBird(1 / FPS);
        stepTraffic(lanes, sim, 1 / FPS, react);
        for (const L of lanes) for (const car of L.cars) if (car.alarm > 0) car.alarm -= 1 / FPS;
      }
      lastTick = tick;
      render(Math.floor(((now - t0) / 1000) * BOIL_FPS), (now - t0) / 1000);
    }
    raf = requestAnimationFrame(frame);
  }

  async function bakeAll() {
    paper = makePaper(cr);
    layout();
    onStatus('크레용으로 도로 그리는 중…'); await yieldNow();
    let m = 0;
    for (const [kind, nv] of Object.entries(MARKS)) for (let v = 0; v < nv; v++) markSprites[`${kind}-${v}`] = makeMark(cr, kind, seed * 77 + ++m);
    onStatus('크레용으로 비둘기 그리는 중…'); render(0, 0); await yieldNow();
    let n = 0;
    for (const pose of Object.keys(POSES)) for (let hk = 0; hk < HEADS; hk++) {
      birdSprites[`${pose}|${hk}`] = makePigeon(cr, pose, hk, 500 + n++);
      if (n % 8 === 0) await yieldNow();
    }
    birdSprites.shadow = bakeSprite(cr, [{ fill: hull([...Array(12)].map((_, i) => [Math.cos(i * 0.52) * 1.2, Math.sin(i * 0.52) * 0.45])), color: C.shadow, w: 8, flat: true, oneCoat: true }], null, mulberry32(9), { U: UB });
    sprites.alarm = bakeSprite(cr, alarmOps(), null, mulberry32(41), { U: 40, outlineFirst: false, margin: 30 });
    const jobs = [];
    for (const type of ['sedan', 'taxi', 'suv', 'bus']) for (const d of ['d', 'u']) for (const v of [0, 1]) jobs.push([type, d, v]);
    let c = 0;
    for (const [type, d, v] of jobs) {
      onStatus(`크레용으로 자동차 그리는 중… ${++c} / ${jobs.length}`);
      await yieldNow();
      sprites[`${type}-${d}-${v}`] = makeCar(cr, type, d === 'd' ? 0 : Math.PI, PAL[type][v], seed * 1000 + 600 + c);
      render(0, 0);
    }
    ready = true;
    onStatus(matchMedia('(pointer: coarse)').matches ? '손가락으로 쓱쓱 그으면 비둘기가 따라가요' : '마우스를 움직이면 비둘기가 따라가요', true);
  }

  // pointer: a hovering mouse leads the bird; on touch, wherever the finger drags
  function aim(e) {
    const r = canvas.getBoundingClientRect(), [x, y] = toGround(e.clientX - r.left, e.clientY - r.top);
    target.x = x; target.y = y;
  }
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) aim(e); });
  canvas.addEventListener('pointerdown', (e) => { aim(e); canvas.setPointerCapture?.(e.pointerId); });

  return {
    layout,
    start() {                                 // (re)start drawing; bakes the sprites the first time
      if (running) return;
      running = true;
      if (!baking) baking = bakeAll();
      baking.then(() => {
        if (!running || raf) return;
        t0 = performance.now(); lastTick = -1;
        raf = requestAnimationFrame(frame);
      });
    },
    stop() { running = false; cancelAnimationFrame(raf); raf = 0; },
    get ready() { return ready; },
  };
}

// ───────────────────────── <crayon-pigeon> ─────────────────────────
//   <crayon-pigeon seed="7" ratio="16/10"></crayon-pigeon>
// Sizes itself to its box (16:10 unless `ratio` or CSS says otherwise), draws only while on screen.
const ElementBase = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};
class CrayonPigeon extends ElementBase {
  connectedCallback() {
    if (this._scene) { this._io?.observe(this); return; }
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host { display: block; position: relative; aspect-ratio: var(--ratio, 16 / 10); background: #ece4d5; overflow: hidden; }
      canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
      .msg { position: absolute; left: 12px; right: 12px; bottom: 10px; text-align: center; pointer-events: none;
        font: 500 13px/1.4 system-ui, -apple-system, sans-serif; color: #5b5348; transition: opacity 0.6s; }
    </style><canvas role="img" aria-label="크레용으로 그린 도로 위를 걷는 커다란 비둘기와 피해 가는 자동차들"></canvas><div class="msg">크레용 준비 중…</div>`;
    const ratio = this.getAttribute('ratio');
    if (ratio) this.style.setProperty('--ratio', ratio.replace(':', ' / '));
    const msg = root.querySelector('.msg');
    let fade = 0;
    this._scene = createPigeonScene(root.querySelector('canvas'), {
      seed: +(this.getAttribute('seed') ?? 7) || 7,
      sheet: this.getAttribute('sheet'),
      onStatus: (text, done) => {
        msg.textContent = text; msg.style.opacity = 1; clearTimeout(fade);
        if (done) fade = setTimeout(() => (msg.style.opacity = 0), 3500);
      },
    });
    let rt = 0;
    this._ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => this._scene.layout(), 120); });
    this._ro.observe(this);
    this._io = new IntersectionObserver((es) => (es[0].isIntersecting ? this._scene.start() : this._scene.stop()));
    this._io.observe(this);
  }
  disconnectedCallback() { this._scene?.stop(); this._io?.disconnect(); }
}
if (typeof customElements !== 'undefined' && !customElements.get('crayon-pigeon')) customElements.define('crayon-pigeon', CrayonPigeon);

})();
