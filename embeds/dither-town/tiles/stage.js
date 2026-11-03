// 야외 공연장. 무대는 45도 직각삼각형, 관객은 잔디에 앉아 공연을 본다.
export const meta = { id: 'stage', name: '야외 공연장' };

export function build(kit) {
  const { THREE, add, box, cyl, flat, line, tree, bush, lamp, person, walkPose, sitPose, yawOf, root, mat } = kit;

  const C = { x: -18.3, z: -12.3 };            // 무대 직각 모서리
  const A = { x: C.x + 13, z: C.z };           // 빗변 끝 A (-5.3, -12.3)
  const B = { x: C.x, z: C.z + 13 };           // 빗변 끝 B (-18.3, 0.7)
  const OUT = Math.SQRT1_2;                    // 빗변 바깥 법선 (1,1)/√2
  const FACE = yawOf(1, 1);                    // 무대에서 관객 쪽을 보는 각

  /* ---------- 무대 데크 ---------- */
  const shape = new THREE.Shape();
  shape.moveTo(C.x, -C.z);                     // shape의 y가 -z가 되도록 뒤집어 넣는다
  shape.lineTo(A.x, -A.z);
  shape.lineTo(B.x, -B.z);
  shape.closePath();
  const deck = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false }),
    [mat('#5a4636'), mat('#46362a')]             // 윗면 나무, 옆면은 조금 어둡게
  );
  deck.rotation.x = -Math.PI / 2;
  deck.castShadow = true;
  deck.receiveShadow = true;
  root.add(deck);

  // 빗변 중앙 계단
  const M = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
  for (let i = 0; i < 3; i++) {
    const h = 0.75 - i * 0.25;
    const d = 0.36 + i * 0.44;
    const st = box(3.6, h, 0.44, '#4f3f31', M.x + OUT * d, h / 2, M.z + OUT * d);
    st.rotation.y = yawOf(-1, 1);
  }

  /* ---------- 마스트와 막 구조물 ---------- */
  // 볼록한 흰 막이 바깥의 높은 마스트에서 내려온 케이블에 매달려 떠 있다.
  // 막의 세 모서리: 뒤 귀퉁이와 빗변 양 끝. 앞 테두리는 아치처럼 가운데가 솟는다.
  const P1 = new THREE.Vector3(-18.6, 5.0, -12.6);  // 뒤 귀퉁이
  const P2 = new THREE.Vector3(-3.0, 3.2, -12.4);   // A 쪽 아치 발
  const P3 = new THREE.Vector3(-18.4, 3.2, 3.0);    // B 쪽 아치 발
  const upV = new THREE.Vector3(0, 1, 0);
  const tmpV = new THREE.Vector3();

  function strut(a, b, r, color, extra) {
    tmpV.subVectors(b, a);
    const len = tmpV.length() || 0.01;
    const m = add(new THREE.CylinderGeometry(r, r, len, 6), color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, root, extra);
    m.quaternion.setFromUnitVectors(upV, tmpV.divideScalar(len));
    return m;
  }

  // 흰 구조물은 해가 뒤에서 들어와 앞면이 그늘지므로 살짝 자체 발광시켜 흰색을 지킨다
  const WHITE = '#f4f3ee';
  const whiteGlow = { emissive: WHITE, emissiveIntensity: 0.35 };
  function mast(a, b, r0, r1) {
    tmpV.subVectors(b, a);
    const len = tmpV.length();
    const m = add(new THREE.CylinderGeometry(r1, r0, len, 12), WHITE, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, root, whiteGlow);
    m.quaternion.setFromUnitVectors(upV, tmpV.divideScalar(len));
    cyl(r0 * 1.8, 0.25, '#b9b4a8', a.x, 0.125, a.z, root, 12);     // 콘크리트 기초
    return m;
  }

  // 케이블이 매다는 점 (무게중심 좌표 u,v,w). 이 점들이 끌려 올라가 천막 봉우리가 된다.
  // 앞의 둘은 양옆 날개(옆 테두리 가까이), 마지막은 가운데.
  const HANGS = [[0.42, 0.52, 0.06], [0.42, 0.06, 0.52], [0.62, 0.19, 0.19]];
  const BULGE = 2.6, ARCH = 4.6, WING = 3.6, PEAK = 1.8, PW = 0.02, N = 32;
  const memP = (u, v, w) => {
    let y = u * P1.y + v * P2.y + w * P3.y
      + BULGE * 27 * u * v * w            // 가운데가 볼록하게
      + ARCH * 4 * v * w                  // 앞 테두리 아치
      // 옆 테두리를 들어 올려 날개를 양옆으로 펼친다 (안쪽으로 갈수록 약하게)
      + WING * (4 * u * v * (1 - w) ** 2 + 4 * u * w * (1 - v) ** 2);
    for (const [hu, hv, hw] of HANGS) {
      const d2 = (u - hu) ** 2 + (v - hv) ** 2 + (w - hw) ** 2;
      y += PEAK * Math.exp(-d2 / PW);     // 케이블이 잡아당긴 봉우리
    }
    return new THREE.Vector3(u * P1.x + v * P2.x + w * P3.x, y, u * P1.z + v * P2.z + w * P3.z);
  };

  const pos = [], map = [];
  let vi = 0;
  for (let i = 0; i <= N; i++) {
    map[i] = [];
    for (let j = 0; j <= N - i; j++) {
      const u = i / N, v = j / N;
      const p = memP(u, v, 1 - u - v);
      pos.push(p.x, p.y, p.z);
      map[i][j] = vi++;
    }
  }
  const tri = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N - i; j++) {
      tri.push(map[i][j], map[i + 1][j], map[i][j + 1]);
      if (i + j <= N - 2) tri.push(map[i + 1][j], map[i + 1][j + 1], map[i][j + 1]);
    }
  }
  const memGeo = new THREE.BufferGeometry();
  memGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  memGeo.setIndex(tri);
  memGeo.computeVertexNormals();
  const sail = new THREE.Mesh(memGeo, mat('#f7f7f4', { side: THREE.DoubleSide, emissive: '#f7f7f4', emissiveIntensity: 0.12 }));
  sail.castShadow = true;
  sail.receiveShadow = true;
  root.add(sail);

  // 막 위의 곡선을 따라가는 흰 관: 테두리 아치와 안쪽 늑골
  function tube(from, to, r, steps = 14) {
    let prev = memP(...from);
    for (let i = 1; i <= steps; i++) {
      const s = i / steps;
      const cur = memP(...from.map((f, k) => f + (to[k] - f) * s));
      cur.y -= 0.05;
      strut(prev, cur, r, WHITE, whiteGlow);
      prev = cur;
    }
  }
  tube([0, 1, 0], [0, 0, 1], 0.13, 20);          // 앞 아치
  tube([0.35, 0.65, 0], [0.35, 0, 0.65], 0.08);  // 안쪽 늑골
  tube([1, 0, 0], [0, 1, 0], 0.08);              // 옆 테두리
  tube([1, 0, 0], [0, 0, 1], 0.08);
  // 아치 발은 땅까지 내려 받친다
  for (const P of [P2, P3]) {
    mast(new THREE.Vector3(P.x, 0, P.z), P, 0.22, 0.15);
  }

  // 바깥에 선 높은 마스트 두 개 + 뒤 귀퉁이의 낮은 마스트
  const TOP_A = new THREE.Vector3(-0.6, 12.5, -12.6), BASE_A = new THREE.Vector3(-1.8, 0, -11.4);
  const TOP_B = new THREE.Vector3(-18.6, 12.5, 5.4), BASE_B = new THREE.Vector3(-17.4, 0, 4.2);
  const TOP_C = new THREE.Vector3(-18.6, 9.0, -12.6);
  mast(BASE_A, TOP_A, 0.32, 0.18);
  mast(BASE_B, TOP_B, 0.32, 0.18);
  mast(new THREE.Vector3(-18.3, 0, -12.3), TOP_C, 0.22, 0.14);

  // 케이블은 렌더 해상도에서 한 픽셀(약 0.11 m)보다 가늘면 끊겨 점선이 된다.
  // 실제보다 굵게 잡고, 조명에 따라 밝기가 출렁이지 않게 어두운 색을 자체 발광으로 고정한다.
  const CABLE = '#5d6268';
  const CW = 0.075;
  const cableGlow = { emissive: CABLE, emissiveIntensity: 0.6 };
  const cable = (a, b) => strut(a, b, CW, CABLE, cableGlow);

  // 매다는 케이블: 마스트 꼭대기 → 막의 봉우리. 마스트끼리는 잇지 않는다.
  const hangPt = HANGS.map((h) => memP(...h));
  cable(TOP_A, hangPt[0]);
  cable(TOP_B, hangPt[1]);
  cable(TOP_C, hangPt[2]);
  cable(TOP_C, P1);
  // 앞 아치도 양쪽 마스트에서 두 줄씩 매단다 (아치 발 가까이와 조금 안쪽)
  for (const s of [0.82, 0.62]) {
    cable(TOP_A, memP(0, s, 1 - s));
    cable(TOP_B, memP(0, 1 - s, s));
  }
  // 마스트는 막을 매단 반대쪽으로 땅에 당겨 버틴다
  for (const [top, anchors] of [
    [TOP_A, [[3.0, -12.6], [1.8, -8.4]]],
    [TOP_B, [[-18.6, 9.2], [-14.4, 8.0]]],
    [TOP_C, [[-18.8, -12.8]]],
  ]) {
    for (const [ax, az] of anchors) {
      cable(top, new THREE.Vector3(ax, 0.1, az));
      box(0.45, 0.2, 0.45, '#b9b4a8', ax, 0.1, az);                   // 앵커 블록
    }
  }

  /* ---------- 조명 트러스 (아치 아래) ---------- */
  const T1 = memP(0.25, 0.65, 0.10); T1.y -= 1.4;
  const T2 = memP(0.25, 0.10, 0.65); T2.y -= 1.4;
  strut(T1, T2, 0.06, '#6f747a');
  const spotGeo = new THREE.BoxGeometry(0.26, 0.26, 0.42);
  const spotMats = ['#ffd27a', '#ff7a7a', '#7ab8ff'].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 1 })
  );
  for (let i = 0; i < 6; i++) {
    const s = (i + 0.5) / 6;
    const m = new THREE.Mesh(spotGeo, spotMats[i % 3]);
    m.position.set(T1.x + (T2.x - T1.x) * s, T1.y - 0.3, T1.z + (T2.z - T1.z) * s);
    m.rotation.y = yawOf(-1, 1);
    root.add(m);
  }

  /* ---------- 무대 위 밴드 ---------- */
  function onStage(x, z, opts) {
    const p = person(opts);
    p.g.position.set(x, 1, z);
    p.g.rotation.y = FACE;
    return p;
  }
  const singer = onStage(-12.2, -6.2, { shirt: '#d94f5c', pants: '#2b2b2e', h: 1.8 });
  const guitar = onStage(-9.5, -9.2, { shirt: '#4a7fd0', pants: '#2b2b2e', h: 1.78 });
  const bass = onStage(-16.2, -4.2, { shirt: '#e8b04b', pants: '#2b2b2e', h: 1.8 });
  const drummer = onStage(-15.2, -9.6, { shirt: '#5aa07a', pants: '#2b2b2e', h: 1.75 });
  sitPose(drummer, 1.45);

  // 마이크 스탠드
  cyl(0.03, 1.5, '#3c4148', -12.2 + 0.45, 1.75, -6.2 + 0.45);
  box(0.1, 0.12, 0.1, '#22252a', -12.2 + 0.45, 2.55, -6.2 + 0.45);

  // 기타·베이스
  const g1 = box(0.1, 0.5, 0.4, '#c98b3a', -9.5 + 0.4, 1.75, -9.2 + 0.4);
  g1.rotation.set(0.25, FACE, 0.85);
  const g2 = box(0.1, 0.55, 0.4, '#8a5ad0', -16.2 + 0.4, 1.72, -4.2 + 0.4);
  g2.rotation.set(0.2, FACE, -0.9);

  // 드럼 키트
  const DC = { x: -14.6, z: -9.0 };
  cyl(0.36, 0.5, '#b83b2e', DC.x, 1.25, DC.z, root, 12);
  cyl(0.22, 0.28, '#efe9dd', DC.x - 0.75, 1.14, DC.z + 0.25, root, 10);
  cyl(0.20, 0.26, '#efe9dd', DC.x - 0.05, 1.62, DC.z - 0.5, root, 10);
  cyl(0.18, 0.24, '#efe9dd', DC.x + 0.55, 1.6, DC.z - 0.5, root, 10);
  cyl(0.28, 0.04, '#d9b45a', DC.x - 1.0, 1.78, DC.z - 0.55, root, 14);

  // 빗변 양 끝 스피커 스택
  for (const [sx, sz] of [[-6.9, -11.2], [-17.4, -0.9]]) {
    box(0.95, 0.12, 0.75, '#2b2f35', sx, 1.05, sz);
    box(0.9, 1.9, 0.7, '#1e2126', sx, 1.96, sz);
  }

  /* ---------- 관객석 ---------- */
  const SHIRTS = ['#d94f5c', '#4a7fd0', '#e8b04b', '#5aa07a', '#8a5ad0', '#d97a9a', '#e2e0d8', '#5d7fa3', '#c94a3a'];
  const seatGeo = new THREE.BoxGeometry(0.46, 0.06, 0.44);
  const backGeo = new THREE.BoxGeometry(0.04, 0.36, 0.44);
  const legGeo = new THREE.BoxGeometry(0.035, 0.45, 0.035);
  // 통짜 받침은 멀리서 비석처럼 보여서, 다리 네 개짜리 가벼운 의자로 만든다
  const chairMat = mat('#f6f5ef', { emissive: '#f6f5ef', emissiveIntensity: 0.15 });

  function chair(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yawOf(C.x - x, C.z - z);     // 무대 쪽을 본다
    const s = new THREE.Mesh(seatGeo, chairMat);
    s.position.set(0, 0.45, 0);
    const b = new THREE.Mesh(backGeo, chairMat);
    b.position.set(-0.21, 0.66, 0);             // 등받이는 무대 반대쪽
    const legs = [[-0.19, -0.19], [-0.19, 0.19], [0.19, -0.19], [0.19, 0.19]].map(([lx, lz]) => {
      const l = new THREE.Mesh(legGeo, chairMat);
      l.position.set(lx, 0.225, lz);
      return l;
    });
    for (const m of [s, b, ...legs]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    root.add(g);
  }

  const audience = [];
  const ROWS = [[14.8, 7], [16.4, 8], [18.0, 8], [19.6, 7], [21.2, 6]];
  const A0 = 0.16, A1 = 1.22;
  for (const [r, n] of ROWS) {
    for (let i = 0; i < n; i++) {
      const a = A0 + (A1 - A0) * (i + 0.5) / n + (Math.random() - 0.5) * 0.02;
      const x = C.x + r * Math.cos(a);
      const z = C.z + r * Math.sin(a);
      if (z > 9.9 || x > 17) continue;
      chair(x, z);
      if (Math.random() < 0.6) {
        const p = person({
          shirt: SHIRTS[(Math.random() * SHIRTS.length) | 0],
          pants: '#3a3f47',
          h: 1.62 + Math.random() * 0.16,
        });
        sitPose(p, 0.48);
        p.g.position.x = x;
        p.g.position.z = z;
        p.g.rotation.y = yawOf(C.x - x, C.z - z);
        audience.push(p);
      }
    }
  }

  /* ---------- 돗자리 ---------- */
  for (const [bx, bz, col, rot] of [
    [8.6, -6.2, '#d9534f', 0.5],
    [12.8, 1.2, '#e8b04b', -0.7],
    [4.6, 6.4, '#5b8fd6', 0.25],
  ]) {
    const m = flat(2.8, 2.2, col, bx, bz, 0.013);
    m.rotation.z = rot;
    const cnt = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < cnt; i++) {
      const px = bx + (Math.random() - 0.5) * 1.6;
      const pz = bz + (Math.random() - 0.5) * 1.4;
      const p = person({
        shirt: SHIRTS[(Math.random() * SHIRTS.length) | 0],
        pants: '#3a3f47',
        h: 1.6 + Math.random() * 0.2,
      });
      sitPose(p, 0.08);
      p.g.position.x = px;
      p.g.position.z = pz;
      p.g.rotation.y = yawOf(C.x - px, C.z - pz);
      audience.push(p);
    }
  }

  /* ---------- 무대 앞에서 추는 사람들 ---------- */
  const dancers = [];
  [0.18, 0.28, 0.38, 0.5, 0.6, 0.72, 0.84].forEach((s, i) => {
    const bx = A.x + (B.x - A.x) * s;
    const bz = A.z + (B.z - A.z) * s;
    const d = 2.6 + Math.random() * 1.6;
    const x = bx + OUT * d, z = bz + OUT * d;
    const p = person({
      shirt: SHIRTS[i % SHIRTS.length],
      pants: '#2f333a',
      h: 1.72 + Math.random() * 0.16,
    });
    p.g.position.set(x, 0, z);
    p.face = yawOf(C.x - x, C.z - z);
    p.g.rotation.y = p.face;
    dancers.push(p);
  });

  /* ---------- 진입로와 산책하는 사람들 ---------- */
  const PATH = [[12.2, 10.4], [10.8, 7.0], [9.2, 3.5], [7.6, 0.0], [5.2, -3.2]];
  for (let i = 0; i < PATH.length - 1; i++) {
    line(PATH[i][0], PATH[i][1], PATH[i + 1][0], PATH[i + 1][1], { w: 2.5, y: 0.014, color: '#d8d0bd' });
  }

  const WAY = [
    [12.4, 10.1], [10.8, 7.0], [9.2, 3.5], [7.6, 0.0], [5.0, -3.5],
    [1.5, -6.0], [-1.5, -7.5], [-3.5, -5.0], [-2.0, -1.5], [1.0, 1.0],
    [4.5, 3.0], [8.0, 6.0], [10.6, 8.4], [14.2, 9.9],
  ];
  const walkers = [];
  for (let i = 0; i < 6; i++) {
    const p = person({ shirt: SHIRTS[(i * 3) % SHIRTS.length], pants: '#3a3f47', h: 1.68 + Math.random() * 0.2 });
    p.wi = (i * 2) % WAY.length;
    p.x = WAY[p.wi][0] + (Math.random() - 0.5) * 0.5;
    p.z = WAY[p.wi][1] + (Math.random() - 0.5) * 0.5;
    p.spd = 0.9 + Math.random() * 0.5;
    p.g.position.set(p.x, 0, p.z);
    walkers.push(p);
  }

  /* ---------- 사운드 부스 ---------- */
  const BX = 6, BZ = 2;
  box(2.6, 1.0, 1.6, '#3a3f47', BX, 0.5, BZ);
  box(2.8, 0.07, 1.8, '#2b2f35', BX, 1.03, BZ);
  for (const [dx, dz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]])
    cyl(0.04, 2.4, '#5a5f66', BX + dx, 1.2, BZ + dz);
  box(3.1, 0.07, 2.1, '#dcd8ca', BX, 2.42, BZ);
  const op = person({ shirt: '#2f333a', pants: '#22252a', h: 1.75 });
  op.g.position.set(BX + 0.9, 0, BZ + 0.9);
  op.g.rotation.y = yawOf(C.x - (BX + 0.9), C.z - (BZ + 0.9));

  /* ---------- 가장자리 녹지 ---------- */
  tree(17.2, -6.5, 1.0);
  tree(16.8, 0.6, 0.9);
  tree(14.0, 9.2, 0.85);
  tree(-6.0, 9.2, 0.85);
  tree(8.2, 9.6, 0.75);
  bush(14.6, -12.0, 1.0);
  bush(0.2, -11.4, 0.85);
  bush(-2.6, 9.6, 0.9);
  lamp(16, -11);
  lamp(16, 8);

  return {
    update(dt, t) {
      /* 밴드 */
      singer.g.rotation.y = FACE + Math.sin(t * 1.1) * 0.3;
      singer.armR.rotation.x = 1.4 + Math.sin(t * 1.7) * 0.9;
      singer.armL.rotation.x = 0.3 + Math.sin(t * 1.1) * 0.25;
      singer.g.position.y = 1 + Math.abs(Math.sin(t * 1.1)) * 0.03;

      const bobA = Math.abs(Math.sin(t * 2.3));
      guitar.g.position.y = 1 + bobA * 0.04;
      guitar.head.position.y = guitar.headY - bobA * 0.02;
      guitar.g.rotation.y = FACE + Math.sin(t * 1.6) * 0.15;

      const bobB = Math.abs(Math.sin(t * 2.3 + 1.5));
      bass.g.position.y = 1 + bobB * 0.04;
      bass.head.position.y = bass.headY - bobB * 0.025;

      const beat = Math.sin(t * 6.5);
      drummer.armL.rotation.x = 0.9 + beat * 0.7;
      drummer.armR.rotation.x = 0.9 - beat * 0.7;
      drummer.head.position.y = drummer.headY + Math.sin(t * 3.2) * 0.02;

      /* 무대 앞 댄서 */
      for (const p of dancers) {
        const s = Math.sin(t * 2.6 + p.phase);
        p.g.position.y = Math.abs(s) * 0.09;
        p.armL.rotation.x = 1.6 + s * 0.9;
        p.armR.rotation.x = 1.6 - s * 0.9;
        p.g.rotation.y = p.face + Math.sin(t * 0.7 + p.phase) * 0.25;
      }

      /* 앉은 관객: 머리만 살짝 흔든다 */
      for (let i = 0; i < audience.length; i++) {
        const p = audience[i];
        p.head.position.y = p.headY + Math.sin(t * 1.2 + i * 1.7) * 0.015;
      }

      /* 산책하는 사람들 */
      for (const p of walkers) {
        const w = WAY[p.wi];
        const dx = w[0] - p.x, dz = w[1] - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) {
          p.wi = (p.wi + 1) % WAY.length;
          continue;
        }
        const vx = (dx / d) * p.spd, vz = (dz / d) * p.spd;
        p.x += vx * dt;
        p.z += vz * dt;
        let dy = yawOf(vx, vz) - p.g.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        p.g.rotation.y += dy * Math.min(1, dt * 5);
        walkPose(p, p.spd, dt);
        p.g.position.set(p.x, p.bob, p.z);
      }
    },
  };
}
