// 스케이트보드장. 콘크리트 광장에 쿼터파이프 두 개와 펀박스, 보울 자국.
export const meta = { id: 'skate', name: '스케이트보드장' };

export function build(kit) {
  const { THREE, root, add, box, cyl, flat, disc, line, arc, tree, bench, fence, lamp, person, sitPose, yawOf } = kit;

  const CONC = '#c9c6bf', SEAM = '#a9a69f';

  /* ---------- 바닥 ---------- */
  flat(34, 20, CONC, 0, -1, 0.01);
  for (let x = -16; x <= 16; x += 4) line(x, -11, x, 9, { w: 0.04, y: 0.014, color: SEAM });   // 신축 이음
  for (let z = -11; z <= 9; z += 4) line(-17, z, 17, z, { w: 0.04, y: 0.014, color: SEAM });

  disc(3.5, '#9f9b93', -6, -7, 0.02);                                                          // 보울 자국
  arc(-6, -7, 3.5, 0, Math.PI * 2, { w: 0.14, y: 0.026, color: '#8d8a82' });

  /* ---------- 쿼터파이프 ---------- */
  const R = 2, BOT = 12, LIP = 14, DECK = 15.2, RW = 8, RZ = -1, LIM = LIP - 0.1;

  function quarter(s) {                                        // s=-1 왼쪽, +1 오른쪽
    const sh = new THREE.Shape();
    if (s < 0) {
      sh.moveTo(-BOT, 0);
      sh.absarc(-BOT, R, R, -Math.PI / 2, -Math.PI, true);     // 발판에서 립까지 4분원
      sh.lineTo(-DECK, R); sh.lineTo(-DECK, 0); sh.closePath();
    } else {
      sh.moveTo(DECK, 0); sh.lineTo(DECK, R); sh.lineTo(LIP, R);
      sh.absarc(BOT, R, R, 0, -Math.PI / 2, true);
      sh.closePath();
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: RW, bevelEnabled: false, curveSegments: 20 });
    add(g, s < 0 ? '#d6d3cc' : '#dcd9d2', 0, 0, RZ - RW / 2);
    const cop = cyl(0.055, RW + 0.2, '#8a8f96', s * LIP, R, RZ, root, 12);   // 코핑
    cop.rotation.x = Math.PI / 2;
  }
  quarter(-1); quarter(1);

  /* ---------- 펀박스 ---------- */
  const FH = 0.7, FHALF = 2, FEND = 4.5, FZ = -1;
  box(4, FH, 3, '#c2bfb7', 0, FH / 2, FZ);
  function wedge(pts) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false });
  }
  add(wedge([[2, 0], [4.5, 0], [2, FH]]), '#bcb9b1', 0, 0, FZ - 1.5);
  add(wedge([[-2, 0], [-2, FH], [-4.5, 0]]), '#bcb9b1', 0, 0, FZ - 1.5);
  box(3.6, 0.06, 0.08, '#8a8f96', 0, FH + 0.03, FZ);           // 상판 레일

  /* ---------- 롱레일 · 레지 ---------- */
  for (const dx of [-2.4, 2.4]) cyl(0.05, 0.6, '#8a8f96', 7 + dx, 0.3, -7);
  const longRail = cyl(0.045, 5, '#b9bcc2', 7, 0.62, -7, root, 10);
  longRail.rotation.z = Math.PI / 2;
  box(6, 0.45, 0.8, '#c2bfb7', 7, 0.225, 3);
  box(6, 0.05, 0.9, '#b4b1a9', 7, 0.47, 3);

  /* ---------- 가장자리 ---------- */
  fence(-17.5, -12.3, 17.5, -12.3, 2.2);
  bench(-4, -11.5, 0, 3.6);
  bench(5, -11.5, 0, 3.6);
  lamp(-17.5, -11.8); lamp(17.5, -11.8);
  tree(-18, 8.8, 1.0); tree(18, 8.8, 0.9); tree(-18, -12.2, 0.8);

  /* ---------- 지면 높이: 쿼터파이프 곡면 + 펀박스 ---------- */
  function groundY(x, z) {
    let h = 0;
    if (z > RZ - RW / 2 && z < RZ + RW / 2) {
      for (const s of [-1, 1]) {
        const u = x * s;
        if (u > BOT && u < LIP) h = Math.max(h, R - Math.sqrt(Math.max(0, R * R - (u - BOT) * (u - BOT))));
        else if (u >= LIP && u <= DECK) h = Math.max(h, R);
      }
    }
    if (z > FZ - 1.5 && z < FZ + 1.5) {
      const ax = Math.abs(x);
      if (ax <= FHALF) h = Math.max(h, FH);
      else if (ax < FEND) h = Math.max(h, FH * (FEND - ax) / (FEND - FHALF));
    }
    return h;
  }

  /* ---------- 스케이터 ---------- */
  function makeSkater(shirt, h) {
    const b = new THREE.Group();                               // 보드 + 사람
    root.add(b);
    box(0.8, 0.05, 0.22, '#2a2d31', 0, 0.105, 0, b);
    for (const dx of [-0.28, 0.28]) for (const s of [-1, 1]) {
      const w = cyl(0.045, 0.04, '#d8d4c8', dx, 0.045, s * 0.09, b);
      w.rotation.x = Math.PI / 2;
    }
    const p = person({ shirt, pants: '#33363c', h });
    b.add(p.g);                                                // 보드 위로 옮긴다
    p.g.position.set(0, 0.13, 0);
    p.legL.rotation.z = 0.25; p.legR.rotation.z = -0.25;        // 두 발은 보드 길이 방향으로
    p.armL.rotation.x = -0.9; p.armR.rotation.x = 0.9;          // 팔은 옆으로 살짝
    return { b, p };
  }

  const SHIRTS = ['#d9534f', '#3d6fa8', '#4f7f42', '#e3b23c', '#8b6bb0', '#cfd4d8', '#c96a3a'];
  const LANES = [-3.0, -1.9, -0.85, 0.05, 1.9];

  const riders = LANES.map((lz, i) => {
    const s = makeSkater(SHIRTS[i], 1.75 + Math.random() * 0.15);
    const dir = Math.random() < 0.5 ? 1 : -1;
    return {
      b: s.b, p: s.p,
      z: lz + (Math.random() - 0.5) * 0.2,
      x: (Math.random() - 0.5) * 18,
      dir, speed: 5 + Math.random() * 2,
      state: 'ride', airT: 0, pitch: 0, yaw: dir > 0 ? 0 : Math.PI,
    };
  });

  const loopers = [0, 1].map((i) => {
    const s = makeSkater(SHIRTS[5 + i], 1.72 + Math.random() * 0.2);
    return { b: s.b, p: s.p, a: i * Math.PI + Math.random() * 0.6, w: 0.5 + Math.random() * 0.12, ollieT: 0, yaw: 0 };
  });

  function updateRider(sk, dt) {
    if (sk.state === 'ride') {
      sk.x += sk.dir * sk.speed * dt;
      if (sk.x * sk.dir >= LIM) {                              // 립 도착: 살짝 뜨고 180도 돌아 복귀
        sk.x = sk.dir * LIM;
        sk.dir = -sk.dir;
        sk.state = 'air'; sk.airT = 0;
      }
    } else {
      sk.airT += dt;
      sk.x += sk.dir * sk.speed * dt * 0.55;
      if (sk.airT > 0.4) sk.state = 'ride';
    }
    sk.x = Math.max(-LIM, Math.min(LIM, sk.x));

    const bump = sk.state === 'air' ? Math.sin(Math.min(1, sk.airT / 0.4) * Math.PI) * 0.35 : 0;
    sk.b.position.set(sk.x, groundY(sk.x, sk.z) + bump, sk.z);

    const step = 0.3;                                          // 경사 → 보드 피치
    const d = groundY(sk.x + sk.dir * step, sk.z) - groundY(sk.x - sk.dir * step, sk.z);
    const tp = Math.max(-1.1, Math.min(1.1, Math.atan2(d, 2 * step)));
    sk.pitch += (tp - sk.pitch) * Math.min(1, dt * 10);

    let dy = (sk.dir > 0 ? 0 : Math.PI) - sk.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    sk.yaw += dy * Math.min(1, dt * 7);
    sk.b.rotation.set(0, sk.yaw, sk.pitch);
  }

  function updateLooper(sk, dt) {
    sk.a += sk.w * dt;
    const x = 11 * Math.cos(sk.a), z = 6.3 + 2.4 * Math.sin(sk.a);
    const target = yawOf(-11 * Math.sin(sk.a), 2.4 * Math.cos(sk.a));
    let dy = target - sk.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    sk.yaw += dy * Math.min(1, dt * 6);

    if (sk.ollieT > 0) sk.ollieT = Math.max(0, sk.ollieT - dt);
    else if (Math.random() < dt * 0.35) sk.ollieT = 0.5;
    const j = sk.ollieT > 0 ? Math.sin((1 - sk.ollieT / 0.5) * Math.PI) * 0.4 : 0;

    sk.b.position.set(x, j, z);
    sk.b.rotation.set(0, sk.yaw, 0);
    sk.p.armL.rotation.x = -0.7 + Math.sin(sk.a * 3) * 0.2;
    sk.p.armR.rotation.x = 0.7 - Math.sin(sk.a * 3) * 0.2;
  }

  for (const sk of riders) updateRider(sk, 0);
  for (const sk of loopers) updateLooper(sk, 0);

  /* ---------- 앉아서 구경하는 사람 ---------- */
  const sitters = [];
  [[-4.8, -11.5], [-3.2, -11.5], [5.2, -11.5]].forEach(([x, z], i) => {
    const p = person({ shirt: ['#c94a3a', '#e3b23c', '#6b8f5e'][i], pants: '#3a3f47' });
    p.g.position.set(x, 0, z);
    sitPose(p, 0.48);
    p.g.rotation.y = yawOf(0, 1);
    sitters.push(p);
  });

  /* ---------- 레지 옆 구경꾼 ---------- */
  const watchers = [];
  // 순환 스케이터(z 3.9~8.7)와 레인(z -3~2) 경로를 피해 오른쪽 끝에 세운다
  [[15.2, 5.4], [16.0, 6.3], [-15.6, 5.8]].forEach(([x, z], i) => {
    const p = person({ shirt: ['#5d7fa3', '#b5654a', '#d9d4c7'][i] });
    p.g.position.set(x, 0, z);
    p.g.rotation.y = yawOf(0, -1);
    watchers.push(p);
  });

  return {
    update(dt, t) {
      const d = Math.min(dt, 0.05);
      for (const sk of riders) updateRider(sk, d);
      for (const sk of loopers) updateLooper(sk, d);

      sitters.forEach((p, i) => {
        p.head.position.y = p.headY + Math.sin(t * 1.3 + i) * 0.02;
        p.armL.rotation.x = -0.3 + Math.max(0, Math.sin(t * 0.9 + i * 2)) * 0.25;
      });

      for (const p of watchers) {
        let best = null, bd = Infinity;
        for (const sk of riders) {
          const dd = (sk.b.position.x - p.g.position.x) ** 2 + (sk.b.position.z - p.g.position.z) ** 2;
          if (dd < bd) { bd = dd; best = sk; }
        }
        if (!best) continue;
        const target = yawOf(best.b.position.x - p.g.position.x, best.b.position.z - p.g.position.z);
        let dy = target - p.g.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        p.g.rotation.y += dy * Math.min(1, d * 2);
      }
    },
  };
}
