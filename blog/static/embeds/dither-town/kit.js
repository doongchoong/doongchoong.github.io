// 타일을 만들 때 쓰는 공통 도구. 단위는 미터, y=0이 받침 윗면이다.
import * as THREE from 'three';

const mats = new Map();
export function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...extra }));
  return mats.get(key);
}

export const yawOf = (vx, vz) => Math.atan2(-vz, vx);   // 로컬 +x가 앞이 되도록 하는 y 회전

/* ---------- 사람: 점(머리) + 선(몸, 팔, 다리) ---------- */
const limbGeo = new THREE.CylinderGeometry(1, 1, 1, 5);
limbGeo.translate(0, -0.5, 0);                // 위쪽 끝이 관절
const headGeo = new THREE.SphereGeometry(1, 8, 6);
// 한두 픽셀 굵기라 그늘진 면만 잡히면 검게 보인다. 살짝 자체 발광시켜 피규어 도색처럼 띄운다.
const glow = (color) => ({ emissive: color, emissiveIntensity: 0.35 });
const SKINS = ['#e0b48f', '#c08a62', '#8d5a3b', '#5c3a26'];

function limb(parent, r, len, color, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const m = new THREE.Mesh(limbGeo, mat(color, glow(color)));
  m.scale.set(r, len, r);
  m.castShadow = true;
  pivot.add(m);
  parent.add(pivot);
  return pivot;
}

export function makePerson(parent, { shirt = '#888', pants = '#2b2b2e', h = 1.8, skin } = {}) {
  const g = new THREE.Group();
  const k = h / 1.8;
  skin = skin || SKINS[(Math.random() * SKINS.length) | 0];
  const hip = 0.95 * k;
  const legL = limb(g, 0.075, hip, pants, 0, hip, 0.11);
  const legR = limb(g, 0.075, hip, pants, 0, hip, -0.11);
  const torso = limb(g, 0.15, 0.62 * k, shirt, 0, hip + 0.62 * k, 0);
  const armL = limb(g, 0.05, 0.62 * k, skin, 0, hip + 0.56 * k, 0.2);
  const armR = limb(g, 0.05, 0.62 * k, skin, 0, hip + 0.56 * k, -0.2);
  const head = new THREE.Mesh(headGeo, mat(skin, glow(skin)));
  head.position.set(0, hip + 0.8 * k, 0);
  head.scale.setScalar(0.15 * k);
  head.castShadow = true;
  g.add(head);
  parent.add(g);
  return { g, legL, legR, armL, armR, torso, head, hip, headY: hip + 0.8 * k, phase: Math.random() * 6, bob: 0 };
}

// 걷기·뛰기 자세. speed는 m/s. 몸이 위아래로 튀는 양은 p.bob에 넣어 두니 g.position.y에 더해 쓴다.
export function walkPose(p, speed, dt) {
  p.phase += dt * (2.2 + speed * 1.8);
  const a = Math.min(0.75, speed * 0.16);
  const s = Math.sin(p.phase) * a;
  p.legL.rotation.z = s; p.legR.rotation.z = -s;
  p.armL.rotation.z = -s * 0.9; p.armR.rotation.z = s * 0.9;
  p.bob = Math.abs(Math.cos(p.phase)) * a * 0.08;
}

// 앉은 자세. seatY는 엉덩이가 닿는 높이.
export function sitPose(p, seatY) {
  p.g.position.y = seatY - p.hip;
  p.legL.rotation.z = p.legR.rotation.z = 1.35;
  p.armL.rotation.z = p.armR.rotation.z = 0.4;
}

/* ---------- 도구 묶음: 타일의 root 그룹에 붙인다 ---------- */
export function makeKit(root) {
  function add(geo, color, x, y, z, parent = root, extra) {
    const m = new THREE.Mesh(geo, mat(color, extra));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const box = (w, h, d, color, x, y, z, parent = root) => add(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);
  const cyl = (r, h, color, x, y, z, parent = root, seg = 8) => add(new THREE.CylinderGeometry(r, r, h, seg), color, x, y, z, parent);

  // 바닥에 깔리는 평면. 여러 장 겹칠 때는 y를 0.005씩 올려 순서를 정한다.
  function flat(w, d, color, x, z, y = 0.01, parent = root) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function disc(r, color, x, z, y = 0.01, parent = root, seg = 40) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, seg), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function line(x1, z1, x2, z2, { w = 0.07, y = 0.03, color = '#f4f4ef' } = {}) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
    m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    m.receiveShadow = true;
    root.add(m);
    return m;
  }
  // 바닥에 그리는 호. 각도는 +x에서 시작해 -z 쪽으로 돈다 (위에서 볼 때 반시계).
  function arc(cx, cz, r, a0, a1, { w = 0.07, y = 0.03, color = '#f4f4ef' } = {}) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 64, 1, a0, a1 - a0), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, y, cz);
    m.receiveShadow = true;
    root.add(m);
    return m;
  }
  function tree(x, z, s = 1, color = '#3f6e3a') {
    cyl(0.18 * s, 2.2 * s, '#5b4030', x, 1.1 * s, z);
    const geo = new THREE.IcosahedronGeometry(1, 0);
    for (const [dx, dy, dz, r] of [[0, 3.1, 0, 1.7], [0.9, 2.6, 0.5, 1.2], [-0.8, 2.7, -0.4, 1.3], [0.2, 3.9, -0.3, 1.1]]) {
      const m = add(geo, color, x + dx * s, dy * s, z + dz * s, root, { flatShading: true });
      m.scale.setScalar(r * s);
      m.rotation.set(dx, dy, dz);
    }
  }
  function bush(x, z, s = 1, color = '#4f7f42') {
    const b = add(new THREE.IcosahedronGeometry(0.55, 0), color, x, 0.4 * s, z, root, { flatShading: true });
    b.scale.set(1.4 * s, 0.8 * s, 1 * s);
    return b;
  }
  // 벤치. 등받이가 로컬 -z, 앉는 사람은 로컬 +z를 본다. rotY로 돌린다.
  function bench(x, z, rotY = 0, len = 3.6) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    box(len, 0.07, 0.45, '#9a6b3e', 0, 0.45, 0, g);
    box(len, 0.4, 0.06, '#9a6b3e', 0, 0.75, -0.22, g);
    for (const dx of [-len / 2 + 0.3, len / 2 - 0.3]) box(0.07, 0.45, 0.4, '#3c4148', dx, 0.22, 0, g);
    root.add(g);
    return g;
  }
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#4a4f55', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  function fence(x1, z1, x2, z2, h = 3.2) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / 3));
    const ang = -Math.atan2(z2 - z1, x2 - x1);
    for (let i = 0; i <= n; i++) cyl(0.05, h, '#55595e', x1 + (x2 - x1) * i / n, h / 2, z1 + (z2 - z1) * i / n);
    const rail = cyl(0.04, len, '#55595e', (x1 + x2) / 2, h, (z1 + z2) / 2);
    rail.rotation.order = 'YXZ';
    rail.rotation.set(0, ang, Math.PI / 2);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, h), fenceMat);
    mesh.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
    mesh.rotation.y = ang;
    root.add(mesh);
  }
  function lamp(x, z, h = 7) {
    cyl(0.08, h, '#5a5f66', x, h / 2, z);
    box(0.9, 0.18, 0.35, '#2e3236', x, h, z);
  }
  const person = (opts) => makePerson(root, opts);

  return { THREE, root, mat, add, box, cyl, flat, disc, line, arc, tree, bush, bench, fence, lamp, person, walkPose, sitPose, yawOf };
}
