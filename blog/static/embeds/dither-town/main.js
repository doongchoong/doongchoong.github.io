// 디더링 미니어처 마을: 같은 크기(38 × 26 m)의 타일을 한 곳씩 보거나 x축으로 나란히 이어 본다.
import * as THREE from 'three';
import { makeKit, makePerson, walkPose, yawOf, createCrowd } from './kit.js';

const TILE_W = 38, TILE_D = 26;
const SIDEWALK_Z = 11.5, SIDEWALK_D = 2.2;     // 모든 타일이 공유하는 앞쪽 보도
const ALL_IDS = ['court', 'futsal', 'stage', 'skate', 'park', 'market'];

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('view');
const params = new URLSearchParams(location.search);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
} catch (e) {
  $('err').style.display = 'grid';
  throw e;
}
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffffff');

/* ---------- 타일 불러오기 ---------- */
const wanted = (params.get('tiles') || ALL_IDS.join(',')).split(',').filter(Boolean);
const tiles = [];
for (const id of wanted) {
  try {
    const mod = await import(`./tiles/${id}.js`);
    const group = new THREE.Group();
    scene.add(group);
    buildBase(group);
    const content = new THREE.Group();
    group.add(content);
    const api = mod.build(makeKit(content), { W: TILE_W, D: TILE_D }) || {};
    bakeStatic(group, api);
    tiles.push({ meta: mod.meta, group, api });
  } catch (err) {
    console.warn(`타일 ${id}을(를) 불러오지 못했습니다`, err);
  }
}

// 움직이지 않는 메시를 재질별로 한 덩어리로 합친다. 타일 하나에 메시가 수백 개라
// 그대로 두면 그리기 호출이 수천 번이 되고, 모바일은 GPU보다 이 호출 수에서 먼저 막힌다.
// 무엇이 움직이는지는 15초를 미리 돌려 보고 가려낸다. 사람(userData.dynamic)은 늘 뺀다.
function bakeStatic(group, api) {
  group.updateMatrixWorld(true);
  const before = new Map();
  group.traverse((o) => { if (o.isMesh) before.set(o, o.matrixWorld.clone()); });
  if (api.update) for (let i = 0; i < 300; i++) api.update(1 / 20, i / 20);
  group.updateMatrixWorld(true);

  const inv = group.matrixWorld.clone().invert();
  const buckets = new Map();
  for (const [mesh, m0] of before) {
    if (Array.isArray(mesh.material) || !mesh.matrixWorld.equals(m0)) continue;
    let o = mesh, skip = false;
    for (; o && o !== group; o = o.parent) if (!o.visible || o.userData.dynamic) { skip = true; break; }
    if (skip || o !== group) continue;
    const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, { mesh, list: [] });
    buckets.get(key).list.push(mesh);
  }

  const rel = new THREE.Matrix4();
  for (const { mesh: first, list } of buckets.values()) {
    if (list.length < 2) continue;
    const pos = [], nor = [];
    for (const mesh of list) {
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(rel.multiplyMatrices(inv, mesh.matrixWorld));
      pos.push(g.attributes.position.array);
      nor.push(g.attributes.normal.array);
      g.dispose();
      mesh.parent.remove(mesh);
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(concat(pos), 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(concat(nor), 3));
    const m = new THREE.Mesh(merged, first.material);
    m.castShadow = first.castShadow;
    m.receiveShadow = first.receiveShadow;
    group.add(m);
  }
}
function concat(arrays) {
  const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

// 타일마다 깔리는 흙 받침, 잔디, 보도. 나란히 놓으면 이음새 없이 이어진다.
function buildBase(group) {
  const kit = makeKit(group);
  kit.box(TILE_W + 0.8, 0.5, TILE_D + 0.8, '#3b2a1e', 0, -1.45, 0);   // 나무 틀. 이웃 타일 아래로 겹쳐 들어가 하나로 보인다.
  kit.box(TILE_W, 1.2, TILE_D, '#6b5137', 0, -0.6, 0);
  kit.flat(TILE_W, TILE_D, '#6f9a52', 0, 0, 0.005);
  kit.flat(TILE_W, SIDEWALK_D, '#cdc7ba', 0, SIDEWALK_Z, 0.012);
  kit.flat(TILE_W, 0.12, '#a9a395', 0, SIDEWALK_Z - SIDEWALK_D / 2, 0.014);
}
/* ---------- 보도를 걷는 사람들 (타일을 가로질러 다닌다) ---------- */
const walkersRoot = new THREE.Group();
scene.add(walkersRoot);
let walkers = [], dog = null;
const WALK_SHIRTS = ['#a8443a', '#2f5d7c', '#d6b44a', '#6d6d6d', '#e8e2d4', '#7a9a5a', '#c47a9a'];
// streets: 보도 한 줄마다 { xmin, xmax, z(타일 줄의 중심 z) }
function spawnWalkers(streets) {
  walkersRoot.clear();
  walkers = [];
  let i = 0;
  for (const st of streets) {
    const n = Math.round((st.xmax - st.xmin) / TILE_W * 4);
    for (let k = 0; k < n; k++, i++) {
      const p = makePerson(walkersRoot, { shirt: WALK_SHIRTS[i % WALK_SHIRTS.length], h: 1.6 + Math.random() * 0.25 });
      p.a = st.xmin + 1.5; p.b = st.xmax - 1.5;
      p.x = p.a + Math.random() * (p.b - p.a);
      p.z = st.z + SIDEWALK_Z - 0.6 + Math.random() * 1.2;
      p.dir = Math.random() < 0.5 ? -1 : 1;
      p.speed = 1.1 + Math.random() * 0.5;
      walkers.push(p);
    }
  }
  dog = new THREE.Group();
  const k = makeKit(dog);
  k.box(0.55, 0.22, 0.18, '#7a5a3a', 0, 0.35, 0);
  k.box(0.2, 0.18, 0.16, '#7a5a3a', 0.33, 0.48, 0);
  for (const dx of [-0.2, 0.2]) k.box(0.05, 0.25, 0.14, '#5a4028', dx, 0.13, 0);
  walkersRoot.add(dog);
}
function updateWalkers(dt, t) {
  for (const p of walkers) {
    p.x += p.dir * p.speed * dt;
    if (p.x > p.b) p.dir = -1;
    if (p.x < p.a) p.dir = 1;
    p.g.rotation.y = yawOf(p.dir, 0);
    walkPose(p, p.speed, dt);
    p.g.position.set(p.x, p.bob, p.z);
  }
  const owner = walkers[0];
  if (owner && dog) {
    dog.position.set(owner.x + owner.dir * 1.1, Math.abs(Math.sin(t * 9)) * 0.05, owner.z + 0.5);
    dog.rotation.y = yawOf(owner.dir, 0);
  }
}

/* ---------- 조명 ---------- */
scene.add(new THREE.HemisphereLight('#e4edf5', '#7a6f58', 1.1));
const sun = new THREE.DirectionalLight('#fff1d6', 3.0);
const SUN_OFFSET = new THREE.Vector3(-16, 24, -11);
sun.castShadow = true;
// 터치 기기(폰·태블릿)는 그림자 맵을 줄여 메모리와 그림자 패스 부담을 던다
const SHADOW = matchMedia('(pointer: coarse)').matches ? 2048 : 4096;
sun.shadow.mapSize.set(SHADOW, SHADOW);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

/* ---------- 카메라: 등각(isometric) ---------- */
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
const ISO_ELEV = Math.atan(1 / Math.SQRT2);     // 35.26°
const view = { az: Math.PI / 4, azGoal: Math.PI / 4, zoom: 1, tx: 0, tz: 0, xmin: -TILE_W / 2, xmax: TILE_W / 2, zmin: -TILE_D / 2, zmax: TILE_D / 2 };
function baseHalfH() {
  const aspect = renderer.domElement.width / renderer.domElement.height;
  return Math.max(17.5, 25.5 / aspect);
}
function updateCamera() {
  const aspect = renderer.domElement.width / renderer.domElement.height;
  const halfH = baseHalfH() / view.zoom;
  cam.left = -halfH * aspect; cam.right = halfH * aspect; cam.top = halfH; cam.bottom = -halfH;
  cam.updateProjectionMatrix();
  const d = 120;
  cam.position.set(
    view.tx + Math.sin(view.az) * Math.cos(ISO_ELEV) * d,
    Math.sin(ISO_ELEV) * d,
    view.tz + Math.cos(view.az) * Math.cos(ISO_ELEV) * d);
  cam.lookAt(view.tx, 2.5, view.tz);              // 공연장 마스트(12.5 m)까지 화면에 들어오도록 조금 위를 본다

  // 그림자는 보이는 범위만 덮는다
  const s = Math.max(halfH * aspect, halfH) * 1.25;
  const sc = sun.shadow.camera;
  if (sc.right !== s) {
    Object.assign(sc, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 200 });
    sc.updateProjectionMatrix();
  }
  sun.position.set(view.tx + SUN_OFFSET.x * 2, SUN_OFFSET.y * 2, view.tz + SUN_OFFSET.z * 2);
  sun.target.position.set(view.tx, 0, view.tz);
}
// 보이는 타일 전체가 들어오는 확대 배율
// heightOnly: 세로로 긴 화면(폰)에서는 폭에 맞추면 마을이 위쪽에 작게 남으니 높이에만 맞추고,
// 좌우로 넘치는 부분은 드래그로 본다
function fitZoom(heightOnly = false) {
  const aspect = renderer.domElement.width / renderer.domElement.height;
  const wx = view.xmax - view.xmin, wz = view.zmax - view.zmin;
  const ca = Math.abs(Math.cos(view.azGoal)), sa = Math.abs(Math.sin(view.azGoal));
  const halfW = (wx * ca + wz * sa) / 2 + 1;
  const halfH = ((wx * sa + wz * ca) * Math.sin(ISO_ELEV) + 9 * Math.cos(ISO_ELEV)) / 2 + 1;
  return Math.min(1, baseHalfH() / (heightOnly ? halfH : Math.max(halfH, halfW / aspect)));
}

/* ---------- 배치: 한 곳 / 한 줄 / 격자 ---------- */
const LAYOUTS = ['one', 'row', 'grid'];
const state = { layout: LAYOUTS.includes(params.get('view')) ? params.get('view') : 'grid', current: params.get('tile') || (tiles[0] && tiles[0].meta.id) };
// 블록 순서. 주소에 tiles=를 주면 그 순서를 지키고, 아니면 섞는다.
let order = tiles.slice();
function shuffle() {
  for (let i = order.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [order[i], order[j]] = [order[j], order[i]];
  }
}
if (!params.get('tiles')) shuffle();

// keepView: 섞기처럼 배치만 바꿀 때는 카메라 위치·배율·카메라 이동 설정을 그대로 둔다
function applyLayout(keepView = false) {
  const active = state.layout === 'one' ? tiles.filter((t) => t.meta.id === state.current).slice(0, 1) : order;
  const n = active.length;
  // 등각 시점에서는 x로만 이으면 화면에서 대각선 띠가 된다. 격자는 정사각형에 가깝게 접되,
  // 6개면 x 2칸 × z 3줄로 놓는다.
  const rows = state.layout === 'grid' ? Math.ceil(Math.sqrt(n)) : 1;
  const cols = Math.ceil(n / rows);
  tiles.forEach((t) => { t.group.visible = false; });
  const streets = [];
  active.forEach((t, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = (c - (cols - 1) / 2) * TILE_W, z = (r - (rows - 1) / 2) * TILE_D;
    t.group.visible = true;
    t.group.position.set(x, 0, z);
    const st = streets[r] || (streets[r] = { xmin: Infinity, xmax: -Infinity, z });
    st.xmin = Math.min(st.xmin, x - TILE_W / 2); st.xmax = Math.max(st.xmax, x + TILE_W / 2);
  });
  view.xmin = -cols * TILE_W / 2; view.xmax = cols * TILE_W / 2;
  view.zmin = -rows * TILE_D / 2; view.zmax = rows * TILE_D / 2;
  spawnWalkers(streets);
  if (keepView) return;
  const many = state.layout !== 'one';
  $('tour').checked = many && params.get('tour') === '1';
  // 카메라 이동이 꺼져 있으면 여러 블록이 한 화면에 다 들어오게 시작한다
  view.tx = 0; view.tz = 0;
  const portrait = renderer.domElement.width < renderer.domElement.height;
  view.zoom = many && !$('tour').checked ? fitZoom(portrait) : 1;
  $('pickWrap').style.display = many ? 'none' : '';
  $('rowOnly').style.display = many ? '' : 'none';
}

/* ---------- 후처리: 틸트시프트 + 디더 ---------- */
let rt = null;
const quadScene = new THREE.Scene();
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const post = new THREE.ShaderMaterial({
  uniforms: {
    tex: { value: null }, texel: { value: new THREE.Vector2() },
    mode: { value: 4 }, levels: { value: 4 }, pal: { value: 4 }, linear: { value: 1 }, tilt: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tex;
    uniform vec2 texel;
    uniform int mode, pal, linear;
    uniform float levels, tilt;
    varying vec2 vUv;

    vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
    float toSrgb1(float c) { return pow(max(c, 0.0), 1.0 / 2.2); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    float threshold(vec2 p) {
      if (mode == 2) return hash(p);
      if (mode == 3) return bayer4(p) + 0.5 / 16.0;
      if (mode == 4) return bayer8(p) + 0.5 / 64.0;
      if (mode == 5) return ign(p);
      return 0.5;
    }
    // 틸트시프트: 화면 위아래로 갈수록 흐리게. 미니어처 사진처럼 초점면이 얇아 보인다.
    vec3 sceneColor(vec2 uv) {
      vec3 c = texture2D(tex, uv).rgb;
      if (tilt < 0.5) return c;
      float r = smoothstep(0.1, 0.45, abs(uv.y - 0.52)) * 5.0;
      if (r < 0.01) return c;
      vec3 acc = c; float w = 1.0;
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float ang = fi * 2.39996;
        vec2 o = vec2(cos(ang), sin(ang)) * sqrt((fi + 0.5) / 16.0) * r * texel;
        acc += texture2D(tex, uv + o).rgb; w += 1.0;
      }
      return acc / w;
    }
    void palette(out vec3 c0, out vec3 c1) {
      if (pal == 1) { c0 = vec3(0.106, 0.102, 0.090); c1 = vec3(0.945, 0.910, 0.816); }
      else if (pal == 2) { c0 = vec3(0.059, 0.220, 0.059); c1 = vec3(0.608, 0.737, 0.059); }
      else { c0 = vec3(0.04); c1 = vec3(1.0); }
    }
    void main() {
      vec3 lin = clamp(sceneColor(vUv), 0.0, 1.0);
      vec3 c0, c1; palette(c0, c1);
      float L = levels - 1.0;
      vec3 outc;
      if (mode == 0) {
        outc = pal == 4 ? toSrgb(lin) : mix(c0, c1, toSrgb1(dot(lin, vec3(0.2126, 0.7152, 0.0722))));
      } else {
        float t = threshold(gl_FragCoord.xy);
        vec3 x = linear == 1 ? lin : toSrgb(lin);
        if (pal == 4) {
          vec3 q = floor(x * L + t) / L;
          outc = linear == 1 ? toSrgb(q) : q;
        } else {
          float q = floor(dot(x, vec3(0.2126, 0.7152, 0.0722)) * L + t) / L;
          outc = mix(c0, c1, linear == 1 ? toSrgb1(q) : q);
        }
      }
      gl_FragColor = vec4(outc, 1.0);
    }
  `,
  depthTest: false, depthWrite: false,
});
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

/* ---------- UI ---------- */
const ui = { mode: $('mode'), pal: $('pal'), levels: $('levels'), px: $('px'), tilt: $('tilt'), lin: $('lin') };
// 주소로 기본값을 바꿀 수 있다: ?mode=3&pal=4&levels=4&px=1&tilt=0&lin=1&ui=0
for (const key of ['mode', 'pal', 'levels', 'px']) if (params.has(key)) ui[key].value = params.get(key);
for (const key of ['tilt', 'lin']) if (params.has(key)) ui[key].checked = params.get(key) === '1';
if (params.get('ui') === '0') document.body.classList.add('noui');
let pxSize = +ui.px.value;
function sync() {
  const u = post.uniforms;
  u.mode.value = +ui.mode.value; u.pal.value = +ui.pal.value; u.levels.value = +ui.levels.value;
  u.linear.value = ui.lin.checked ? 1 : 0; u.tilt.value = ui.tilt.checked ? 1 : 0;
  $('levelsOut').textContent = ui.levels.value;
  $('pxOut').textContent = ui.px.value;
  if (pxSize !== +ui.px.value) { pxSize = +ui.px.value; resize(); }
}
for (const el of Object.values(ui)) el.addEventListener('input', sync);

const pick = $('pick');
for (const t of tiles) pick.add(new Option(t.meta.name, t.meta.id));
pick.value = state.current;
pick.addEventListener('input', () => { state.current = pick.value; applyLayout(); });
const layoutSel = $('layout');
layoutSel.value = state.layout;
layoutSel.addEventListener('input', () => { state.layout = layoutSel.value; applyLayout(); });
$('rotL').addEventListener('click', () => { view.azGoal += Math.PI / 2; });
$('rotR').addEventListener('click', () => { view.azGoal -= Math.PI / 2; });
$('shuffle').addEventListener('click', () => { shuffle(); applyLayout(true); });
$('fit').addEventListener('click', () => { $('tour').checked = false; view.tx = 0; view.tz = 0; view.zoom = fitZoom(); });

function resize() {
  const cw = stage.clientWidth, ch = stage.clientHeight;
  if (!cw || !ch) return;
  const w = Math.max(16, Math.round(cw / pxSize)), h = Math.max(16, Math.round(ch / pxSize));
  renderer.setSize(w, h, false);
  if (rt) rt.dispose();
  rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  post.uniforms.texel.value.set(1 / w, 1 / h);
}
new ResizeObserver(resize).observe(stage);

// 드래그로 이동, 휠로 확대
let dragging = false, lx = 0, ly = 0;
stage.addEventListener('pointerdown', (e) => {
  dragging = true; lx = e.clientX; ly = e.clientY;
  stage.classList.add('drag'); stage.setPointerCapture(e.pointerId);
  $('tour').checked = false;
});
stage.addEventListener('pointerup', () => { dragging = false; stage.classList.remove('drag'); });
stage.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const u = (cam.right - cam.left) / stage.clientWidth;
  const dx = (e.clientX - lx) * u, dy = (e.clientY - ly) * u / Math.sin(ISO_ELEV);
  lx = e.clientX; ly = e.clientY;
  const c = Math.cos(view.az), s = Math.sin(view.az);
  view.tx += -c * dx - s * dy;
  view.tz += s * dx - c * dy;
  view.tx = Math.min(view.xmax, Math.max(view.xmin, view.tx));
  view.tz = Math.min(view.zmax, Math.max(view.zmin, view.tz));
});
// 블로그 글에 iframe으로 들어가 있으면 그냥 휠은 페이지 스크롤로 넘기고, Ctrl/⌘ + 휠(트랙패드 핀치)일 때만 확대한다
const embedded = window.self !== window.top;
if (embedded) {
  document.body.classList.add('embedded');
  $('hint').textContent = '드래그로 이동 · Ctrl/⌘ + 휠로 확대';
}
stage.addEventListener('wheel', (e) => {
  if (embedded && !e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  view.zoom = Math.min(3.5, Math.max(0.2, view.zoom * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });

/* ---------- 측정: ?stats=1 이면 그리기 호출 수와 프레임 시간을 띄운다 ---------- */
const stats = params.get('stats') === '1' ? { el: document.createElement('div'), n: 0, cpu: 0, since: performance.now() } : null;
if (stats) {
  stats.el.style.cssText = 'position:absolute;right:8px;top:8px;padding:4px 8px;background:rgba(0,0,0,.7);color:#fff;font:11px/1.4 ui-monospace,monospace;white-space:pre;pointer-events:none';
  stage.appendChild(stats.el);
  renderer.info.autoReset = false;        // 장면 + 후처리 두 번의 render를 한 프레임으로 센다
}
function reportStats(cpu) {
  stats.n++; stats.cpu += cpu;
  const now = performance.now();
  if (now - stats.since < 500) return;
  const r = renderer.info.render, m = renderer.info.memory;
  stats.el.textContent =
    `fps   ${(stats.n * 1000 / (now - stats.since)).toFixed(0)}\n` +
    `cpu   ${(stats.cpu / stats.n).toFixed(2)} ms\n` +
    `calls ${r.calls}\n` +
    `tris  ${(r.triangles / 1000).toFixed(0)}k\n` +
    `geo   ${m.geometries}\n` +
    `crowd ${crowd.drawn().join(' / ')}`;
  stats.n = 0; stats.cpu = 0; stats.since = now;
}

/* ---------- 루프 ---------- */
// 글을 스크롤해 화면 밖으로 나가면 멈춘다. iframe 안에서도 바깥 페이지 기준으로 판정된다.
let onScreen = true;
new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; }).observe(stage);

const crowd = createCrowd(scene);
const clock = new THREE.Clock();
let tourT = 0;
function frameLoop() {
  if (!onScreen) {
    clock.getDelta();                       // 돌아왔을 때 시간이 한꺼번에 튀지 않게 흘려보낸다
    requestAnimationFrame(frameLoop);
    return;
  }
  const t0 = performance.now();
  if (stats) renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  view.az += (view.azGoal - view.az) * Math.min(1, dt * 5);
  if ($('tour').checked && !dragging) {
    // 카메라가 타일 중심들을 잇는 고리를 따라 천천히 돈다 (한 줄이면 좌우 왕복)
    tourT += dt;
    const ex = (view.xmax - view.xmin - TILE_W) / 2, ez = (view.zmax - view.zmin - TILE_D) / 2;
    const w = 2.2 / Math.max(ex + ez, 1);
    const gx = Math.sin(tourT * w) * ex, gz = Math.cos(tourT * w) * ez;
    const k = Math.min(1, dt * 1.5);
    view.tx += (gx - view.tx) * k; view.tz += (gz - view.tz) * k;
  }
  updateCamera();
  for (const tile of tiles) if (tile.group.visible && tile.api.update) tile.api.update(dt, t);
  updateWalkers(dt, t);
  if (rt) {
    scene.updateMatrixWorld();
    crowd.update();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    post.uniforms.tex.value = rt.texture;
    renderer.render(quadScene, quadCam);
  }
  if (stats) reportStats(performance.now() - t0);
  requestAnimationFrame(frameLoop);
}
sync();
resize();
applyLayout();
requestAnimationFrame(frameLoop);
