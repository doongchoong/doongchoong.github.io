// 분수 조각공원. 중앙 광장 + 방사형 길 + 바깥 순환로, 조형물 5점.
export const meta = { id: 'park', name: '분수 조각공원' };

export function build(kit) {
  const { THREE, root, mat, add, box, cyl, disc, flat, arc, bench, bush, tree, lamp,
    person, walkPose, sitPose, yawOf } = kit;

  const CX = 0, CZ = -1;          // 광장 중심
  const PAVE = '#d8d0bd';

  /* ---------- 바닥: 길과 광장 ---------- */
  flat(3, 11.4, PAVE, 0, 4.7, 0.015);          // +z 길 (보도까지)
  flat(3, 11.6, PAVE, 0, -6.8, 0.015);         // -z 길
  flat(18.8, 3, PAVE, 9.4, -1, 0.015);         // +x 길
  flat(18.8, 3, PAVE, -9.4, -1, 0.015);        // -x 길
  arc(CX, CZ, 10.2, 0, Math.PI * 2, { w: 2.4, y: 0.025, color: PAVE });   // 바깥 순환로
  disc(7.5, PAVE, CX, CZ, 0.02);               // 중앙 광장

  /* ---------- 분수 ---------- */
  const FX = CX, FZ = CZ;
  cyl(3.2, 0.5, '#b9b4a8', FX, 0.25, FZ, root, 32);        // 물동이
  const rim = add(new THREE.TorusGeometry(3.2, 0.11, 8, 48), '#a9a49a', FX, 0.5, FZ);
  rim.rotation.x = Math.PI / 2;
  disc(3.02, '#5d8fb5', FX, FZ, 0.52);                     // 수면
  cyl(0.5, 0.8, '#b9b4a8', FX, 0.9, FZ, root, 16);         // 기둥
  cyl(1.0, 0.16, '#b9b4a8', FX, 1.4, FZ, root, 24);        // 위 물동이
  disc(0.88, '#6ea3c8', FX, FZ, 1.49);

  // 물줄기: 고정 풀 120방울
  const dropGeo = new THREE.SphereGeometry(0.05, 6, 5);
  const dropMat = new THREE.MeshStandardMaterial({ color: '#dff1ff', emissive: '#a9cbe6', emissiveIntensity: 0.45, roughness: 0.7, metalness: 0 });
  const drops = [];
  function launch(d) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.55 + Math.random() * 0.65;
    d.x = FX + (Math.random() - 0.5) * 0.18;
    d.z = FZ + (Math.random() - 0.5) * 0.18;
    d.vx = Math.cos(a) * sp;
    d.vz = Math.sin(a) * sp;
    d.vy = 3.9 + Math.random() * 1.1;
    d.t = 0;
  }
  for (let i = 0; i < 120; i++) {
    const m = new THREE.Mesh(dropGeo, dropMat);
    root.add(m);
    const d = { m, x: FX, z: FZ, vx: 0, vz: 0, vy: 4.5, t: 0 };
    launch(d);
    d.t = Math.random() * 1.1;                              // 시작 시점 흩뿌리기
    d.m.position.set(d.x + d.vx * d.t, 1.55 + d.vy * d.t - 4.9 * d.t * d.t, d.z + d.vz * d.t);
    drops.push(d);
  }
  // 수면 파문: 스케일만으로 퍼진다
  const ripples = [];
  const rippleGeo = new THREE.RingGeometry(0.92, 1.0, 32);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(rippleGeo, mat('#cfe8f5'));
    m.rotation.x = -Math.PI / 2;
    m.position.set(FX, 0.545, FZ);
    root.add(m);
    ripples.push({ m, t: i * 0.6 });
  }

  /* ---------- 조형물 5점 ---------- */
  function plinth(x, z, w = 1.2) {
    box(w, 1.0, w, '#cfc9bd', x, 0.5, z);
    return { x, z, y: 1.0 };
  }
  {   // 청동 적층 큐브
    const s = plinth(13.0, -1.0);
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    root.add(g);
    for (let i = 0; i < 4; i++) {
      const k = 1.0 - i * 0.18;
      const m = new THREE.Mesh(new THREE.BoxGeometry(k, k * 0.55, k), mat('#8a6a3f'));
      m.position.y = 0.3 + i * 0.6;
      m.rotation.set(i * 0.3, i * 0.7, i * 0.18);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }
  }
  let kinetic;   // 회전하는 조형물
  {   // 코르텐 토러스
    const s = plinth(9.2, 8.2);
    kinetic = new THREE.Group();
    kinetic.position.set(s.x, s.y + 1.35, s.z);
    const m = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.26, 10, 30), mat('#9a4f2c'));
    m.castShadow = true;
    kinetic.add(m);
    root.add(kinetic);
  }
  {   // 대리석 비틀린 기둥
    const s = plinth(-9.2, 8.2);
    for (let i = 0; i < 12; i++) {
      const m = add(new THREE.BoxGeometry(0.62, 0.26, 0.62), '#ece8df', s.x, s.y + 0.14 + i * 0.25, s.z);
      m.rotation.y = i * 0.14;
    }
  }
  {   // 흑석 구 + 원뿔
    const s = plinth(-12.2, -5.4);
    add(new THREE.ConeGeometry(0.55, 1.3, 16), '#4a4a4f', s.x, s.y + 0.65, s.z);
    add(new THREE.SphereGeometry(0.52, 14, 10), '#4a4a4f', s.x, s.y + 1.55, s.z);
  }
  {   // 누운 인체 (캡슐 3개)
    const s = plinth(9.2, -9.6, 1.6);
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = 0.5;
    root.add(g);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 4, 10), mat('#8a6a3f'));
    body.rotation.z = Math.PI / 2; body.position.set(0, 0.28, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.8, 4, 10), mat('#8a6a3f'));
    leg.rotation.z = Math.PI / 2 - 0.35; leg.position.set(0.85, 0.2, 0.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), mat('#8a6a3f'));
    head.position.set(-0.85, 0.34, 0);
    for (const m of [body, leg, head]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  }

  /* ---------- 벤치와 앉은 사람 ---------- */
  const sitters = [];
  [[5.87, 4.83], [-5.87, 4.83], [5.87, -6.83], [-5.87, -6.83]].forEach(([bx, bz], bi) => {
    const ix = CX - bx, iz = CZ - bz;
    const il = Math.hypot(ix, iz) || 1;
    const nx = ix / il, nz = iz / il;
    bench(bx, bz, Math.atan2(nx, nz));                     // 등받이가 분수 반대쪽
    const seats = bi === 0 ? [-0.85, 0.85] : bi === 1 ? [0] : bi === 2 ? [-0.9, 0.7] : [];
    for (const t of seats) {
      const p = person({ shirt: ['#c94a3a', '#e3b23c', '#6b8f5e', '#8b6bb0', '#d97a9a'][sitters.length % 5], pants: '#3a3f47' });
      sitPose(p, 0.48);
      p.g.position.x = bx + nz * t + nx * 0.04;
      p.g.position.z = bz - nx * t + nz * 0.04;
      p.g.rotation.y = yawOf(nx, nz);                      // 분수를 바라본다
      sitters.push(p);
    }
  });

  /* ---------- 산책로 그래프 ---------- */
  const nodes = [];
  const node = (x, z) => (nodes.push({ x, z, n: [] }), nodes.length - 1);
  function link(a, b) { nodes[a].n.push(b); nodes[b].n.push(a); }

  const P = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    P.push(node(CX + Math.cos(a) * 4.8, CZ + Math.sin(a) * 4.8));
  }
  for (let k = 0; k < 8; k++) link(P[k], P[(k + 1) % 8]);

  const XE = node(CX + 7.4, CZ), XW = node(CX - 7.4, CZ);
  const XN = node(CX, CZ + 7.4), XS = node(CX, CZ - 7.4);
  link(P[0], XE); link(P[2], XN); link(P[4], XW); link(P[6], XS);

  const O = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    O.push(node(CX + Math.cos(a) * 10.2, CZ + Math.sin(a) * 10.2));
  }
  for (let k = 0; k < 8; k++) link(O[k], O[(k + 1) % 8]);
  link(XE, O[0]); link(XN, O[2]); link(XW, O[4]); link(XS, O[6]);

  const EN = node(0, 10.0), ES = node(0, -12.2), EE = node(17.4, -1), EW = node(-17.4, -1);
  link(O[2], EN); link(O[6], ES); link(O[0], EE); link(O[4], EW);

  const POIS = [
    { x: FX, z: FZ }, { x: 13.0, z: -1.0 }, { x: 9.2, z: 8.2 },
    { x: -9.2, z: 8.2 }, { x: -12.2, z: -5.4 }, { x: 9.2, z: -9.6 },
  ];
  function nearestPOI(x, z) {
    let best = null, bd = Infinity;
    for (const q of POIS) {
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bd) { bd = d; best = q; }
    }
    return bd < 9 ? best : null;
  }

  const SHIRTS = ['#c94a3a', '#3f6fa8', '#e3b23c', '#6b8f5e', '#8b6bb0', '#d97a9a', '#e8e4da', '#3a3f47'];
  const walkers = [];
  function makeWalker(x, z, follow) {
    const p = person({ shirt: SHIRTS[(Math.random() * SHIRTS.length) | 0], pants: '#3a3f47', h: 1.62 + Math.random() * 0.22 });
    p.g.position.set(x, 0, z);
    const w = { p, x, z, node: 0, prev: -1, speed: 1.0 + Math.random() * 0.5, wait: 0, look: null, follow: follow || null, fx: 0, fz: 1 };
    walkers.push(w);
    return w;
  }
  for (let i = 0; i < 8; i++) {
    const start = (Math.random() * nodes.length) | 0;
    const w = makeWalker(nodes[start].x, nodes[start].z);
    w.prev = start;
    w.node = nodes[start].n[(Math.random() * nodes[start].n.length) | 0];
    const dx = nodes[w.node].x - w.x, dz = nodes[w.node].z - w.z;
    const l = Math.hypot(dx, dz) || 1;
    w.fx = dx / l; w.fz = dz / l;
    w.p.g.rotation.y = yawOf(w.fx, w.fz);
  }
  for (let i = 0; i < 3; i++) {                             // 2인 1조
    const L = walkers[i];
    const f = makeWalker(L.x - L.fx * 0.75, L.z - L.fz * 0.75, L);
    f.fx = L.fx; f.fz = L.fz; f.speed = L.speed;
    f.p.g.rotation.y = L.p.g.rotation.y;
  }

  function turnTo(p, target, dt) {
    let d = target - p.g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.g.rotation.y += d * Math.min(1, dt * 7);
  }
  function pickNext(w) {
    const opts = nodes[w.node].n.filter((i) => i !== w.prev);
    const arr = opts.length ? opts : nodes[w.node].n;
    w.prev = w.node;
    w.node = arr[(Math.random() * arr.length) | 0];
  }

  function updateWalkers(dt) {
    for (const w of walkers) {
      const p = w.p;
      let speed = 0;

      if (w.wait > 0) {
        w.wait -= dt;
        if (w.look) {
          const dx = w.look.x - w.x, dz = w.look.z - w.z;
          const d = Math.hypot(dx, dz) || 1;
          turnTo(p, yawOf(dx, dz), dt);
          w.fx = dx / d; w.fz = dz / d;
        }
      } else {
        let tx, tz, isFollow = false;
        if (w.follow) {
          tx = w.follow.x - w.follow.fx * 0.75;
          tz = w.follow.z - w.follow.fz * 0.75;
          isFollow = true;
        } else {
          tx = nodes[w.node].x; tz = nodes[w.node].z;
        }
        const dx = tx - w.x, dz = tz - w.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.2) {
          const ux = dx / d, uz = dz / d;
          const step = Math.min(d, w.speed * dt);
          w.x += ux * step; w.z += uz * step;
          w.fx = ux; w.fz = uz;
          speed = w.speed;
          turnTo(p, yawOf(ux, uz), dt);
        } else if (!isFollow) {
          pickNext(w);
          if (Math.random() < 0.32) {
            w.wait = 1 + Math.random() * 2;
            w.look = nearestPOI(w.x, w.z);
          }
        }
      }

      walkPose(p, speed, dt);
      p.g.position.set(w.x, p.bob, w.z);
    }
  }

  /* ---------- 비둘기 ---------- */
  const birds = [];
  const birdBody = new THREE.SphereGeometry(0.07, 6, 5);
  const birdHead = new THREE.SphereGeometry(0.042, 5, 4);
  const birdMat = mat('#7d7f86');
  function birdSpot(x, z, rad) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rad * (0.4 + Math.random());
      const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
      const d = Math.hypot(nx - CX, nz - CZ);
      if (d > 3.7 && d < 6.9) return [nx, nz];
    }
    return [CX + 4.5, CZ];
  }
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(birdBody, birdMat);
    b.scale.set(1.25, 0.95, 0.95);
    b.castShadow = true;
    const h = new THREE.Mesh(birdHead, birdMat);
    h.position.set(0.08, 0.055, 0);
    g.add(b, h);
    root.add(g);
    const a = Math.random() * Math.PI * 2, r = 3.9 + Math.random() * 2.6;
    const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
    g.position.set(x, 0, z);
    birds.push({ g, x, z, y: 0, sx: x, sz: z, ex: x, ez: z, t: 0, dur: 1, peak: 0, air: false, timer: Math.random() * 2 });
  }

  function updateBirds(dt) {
    for (const b of birds) {
      if (!b.air) {
        for (const w of walkers) {
          if (Math.hypot(w.x - b.x, w.z - b.z) < 1.5) {     // 산책자가 오면 흩어진다
            const [ex, ez] = birdSpot(b.x, b.z, 3.4);
            b.sx = b.x; b.sz = b.z; b.ex = ex; b.ez = ez;
            b.t = 0; b.dur = 0.85 + Math.random() * 0.3; b.peak = 1.1 + Math.random() * 0.5;
            b.air = true;
            break;
          }
        }
      }
      if (b.air) {
        b.t += dt;
        const u = Math.min(1, b.t / b.dur);
        b.x = b.sx + (b.ex - b.sx) * u;
        b.z = b.sz + (b.ez - b.sz) * u;
        b.y = Math.sin(u * Math.PI) * b.peak;
        const fx = b.ex - b.sx, fz = b.ez - b.sz;
        if (fx * fx + fz * fz > 1e-4) b.g.rotation.y = yawOf(fx, fz);
        if (u >= 1) { b.air = false; b.y = 0; b.timer = 0.5 + Math.random() * 1.8; }
      } else {
        b.timer -= dt;
        b.y = 0;
        if (b.timer <= 0) {                                 // 톡톡 쪼며 짧게 홉
          const [ex, ez] = birdSpot(b.x, b.z, 1.4);
          b.sx = b.x; b.sz = b.z; b.ex = ex; b.ez = ez;
          b.t = 0; b.dur = 0.28 + Math.random() * 0.22; b.peak = 0.09;
          b.air = true;
        }
      }
      b.g.position.set(b.x, b.y, b.z);
    }
  }

  function updateWater(dt) {
    for (const d of drops) {
      d.t += dt;
      const y = 1.55 + d.vy * d.t - 4.9 * d.t * d.t;
      if (y < 0.56) { launch(d); d.m.position.set(d.x, 1.55, d.z); continue; }
      d.m.position.set(d.x + d.vx * d.t, y, d.z + d.vz * d.t);
    }
    for (const r of ripples) {
      r.t += dt;
      const u = (r.t % 2.4) / 2.4;
      r.m.scale.setScalar(0.35 + u * 2.3);
    }
  }

  /* ---------- 나무·덤불·화단·조명 ---------- */
  for (const [x, z, s] of [
    [-17.0, 8.4, 1.0], [17.0, 8.4, 1.0], [-17.0, -11.0, 0.9], [17.0, -11.0, 0.9],
    [-12.4, 3.2, 0.85], [12.6, 3.4, 0.85], [-14.0, -9.8, 0.9], [14.6, -6.0, 0.9],
    [-6.0, -10.2, 0.85], [6.0, -10.2, 0.85],
  ]) tree(x, z, s);

  for (const [x, z, s] of [
    [-16.2, 6.6, 1.2], [-15.2, 7.6, 0.9], [16.2, 6.4, 1.1], [15.2, 7.4, 1.0],
    [-15.8, -10.4, 1.0], [15.8, -10.6, 1.1], [-3.4, -11.4, 0.9], [3.4, -11.4, 0.9],
    [-11.6, 8.8, 1.0], [11.6, 8.8, 1.0],
  ]) bush(x, z, s);

  for (const [x, z, r, c] of [
    [-8.6, 8.6, 1.1, '#d9707a'], [-7.6, 9.4, 0.9, '#e8c547'], [11.0, 6.6, 1.0, '#9b7fd0'],
    [-13.6, -5.0, 1.0, '#e8c547'], [13.8, -3.4, 0.9, '#d9707a'], [-3.0, -9.0, 0.8, '#9b7fd0'],
  ]) disc(r, c, x, z, 0.012);

  lamp(7.2, -4.6); lamp(-7.2, -4.6);

  box(12.8, 0.8, 0.8, '#3f6e3a', -9.2, 0.4, -12.4);        // -z 가장자리 생울타리
  box(12.8, 0.8, 0.8, '#3f6e3a', 9.2, 0.4, -12.4);

  return {
    update(dt, t) {
      const d = Math.min(dt, 0.05);
      updateWalkers(d);
      updateBirds(d);
      updateWater(d);
      kinetic.rotation.y += d * 0.4;
      sitters.forEach((p, i) => {
        p.head.position.y = p.headY + Math.sin(t * 1.4 + i * 1.7) * 0.02;
        p.armL.rotation.z = 0.4 + Math.max(0, Math.sin(t * 0.8 + i * 2.1)) * 0.25;
      });
    },
  };
}
