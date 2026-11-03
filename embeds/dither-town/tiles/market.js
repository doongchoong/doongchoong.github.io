export const meta = { id: 'market', name: '상가 거리' };

export function build(kit) {
  const { THREE, root, add, box, cyl, flat, disc, line, arc, tree, bush, bench, lamp, person, walkPose, sitPose, yawOf } = kit;

  /* ================= 건물 디테일 도우미 ================= */
  // 지붕 둘레의 얇은 난간벽
  function parapet(cx, cz, w, d, y, color = '#d6cfc2', h = 0.5) {
    box(w, h, 0.2, color, cx, y + h / 2, cz - d / 2 + 0.1);
    box(w, h, 0.2, color, cx, y + h / 2, cz + d / 2 - 0.1);
    box(0.2, h, d - 0.4, color, cx - w / 2 + 0.1, y + h / 2, cz);
    box(0.2, h, d - 0.4, color, cx + w / 2 - 0.1, y + h / 2, cz);
  }

  // 옥상 실외기
  function acUnit(x, y, z) {
    box(1.02, 0.06, 0.79, '#8b9196', x, y + 0.03, z);
    box(0.95, 0.62, 0.72, '#b9bec3', x, y + 0.34, z);
    const fan = cyl(0.24, 0.06, '#3a4148', x, y + 0.34, z + 0.36, root, 12);
    fan.rotation.x = Math.PI / 2;
  }

  // 옥상 물탱크: 다리 + 원통 + 뚜껑
  function waterTank(x, y, z) {
    for (const o of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      box(0.1, 0.45, 0.1, '#7c8288', x + o[0], y + 0.225, z + o[1]);
    }
    cyl(0.6, 1.0, '#c8cccf', x, y + 0.95, z, root, 14);
    cyl(0.63, 0.08, '#9aa0a6', x, y + 1.48, z, root, 14);
    cyl(0.1, 0.16, '#7c8288', x, y + 1.6, z, root, 8);
  }

  // 삼각 프리즘 박공지붕
  function gableRoof(cx, cy, cz, w, h, d, color) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    geo.translate(0, 0, -d / 2);
    return add(geo, color, cx, cy, cz, root, { flatShading: true });
  }

  // 기울어진 줄무늬 천막 + 앞쪽 물결 발란스
  function awning(cx, cy, cz, w, d, cA, cB, stripes, tilt = 0.42) {
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    g.rotation.x = tilt;
    root.add(g);
    const sw = w / stripes;
    for (let i = 0; i < stripes; i++) box(sw, 0.07, d, i % 2 ? cB : cA, -w / 2 + sw / 2 + i * sw, 0, d / 2, g);
    const fy = cy - d * Math.sin(tilt);
    const fz = cz + d * Math.cos(tilt);
    for (let i = 0; i < stripes; i++) {
      const hh = 0.24 + (i % 2) * 0.14;
      box(sw * 0.9, hh, 0.07, i % 2 ? cB : cA, cx - w / 2 + sw / 2 + i * sw, fy - hh / 2 + 0.03, fz);
    }
  }

  // 창: 밝은 틀 + 어두운(또는 불 켜진) 유리
  function paintWindow(x, y, z, w, h, lit) {
    box(w + 0.2, h + 0.2, 0.07, '#e8dcc0', x, y, z - 0.05);
    add(new THREE.BoxGeometry(w, h, 0.1), lit ? '#ffd98a' : '#2b3a44', x, y, z, root,
      lit ? { emissive: '#ffcf7a', emissiveIntensity: 0.6 } : { roughness: 0.5 });
  }

  // 입간판(A자)
  function aFrame(x, z, rotY, boardColor, frameColor = '#8d6543') {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    root.add(g);
    const b1 = box(0.9, 1.0, 0.06, boardColor, 0, 0.56, 0.17, g); b1.rotation.x = 0.2;
    const b2 = box(0.9, 1.0, 0.06, boardColor, 0, 0.56, -0.17, g); b2.rotation.x = -0.2;
    box(0.96, 0.06, 0.44, frameColor, 0, 1.07, 0, g);
    return g;
  }

  // 화분 + 이코사헤드론 수관
  function pottedTree(x, z, potColor, leafColor, s = 1) {
    cyl(0.3 * s, 0.5 * s, potColor, x, 0.25 * s, z, root, 10);
    cyl(0.34 * s, 0.08 * s, '#d6cfc2', x, 0.52 * s, z, root, 10);
    const a = add(new THREE.IcosahedronGeometry(0.5 * s, 0), leafColor, x, 0.98 * s, z, root, { flatShading: true });
    a.rotation.y = x;
    const b = add(new THREE.IcosahedronGeometry(0.32 * s, 0), leafColor, x + 0.22 * s, 1.35 * s, z - 0.12 * s, root, { flatShading: true });
    b.rotation.y = z;
  }

  // 상자 더미
  function crateStack(x, z, n, color, c2) {
    for (let i = 0; i < n; i++) {
      box(0.56, 0.34, 0.56, i % 2 ? (c2 || color) : color, x + (i % 2) * 0.6, 0.17 + ((i / 2) | 0) * 0.35, z);
    }
  }

  // 이륜 스쿠터(조립만)
  function scooterBody(color) {
    const g = new THREE.Group();
    box(0.95, 0.3, 0.42, color, 0, 0.55, 0, g);
    box(0.5, 0.08, 0.4, '#3a4148', 0.12, 0.36, 0, g);
    box(0.1, 0.7, 0.1, '#3a4148', 0.45, 0.8, 0, g);
    box(0.06, 0.06, 0.5, '#2b2f33', 0.48, 1.1, 0, g);
    box(0.45, 0.45, 0.45, '#f2c230', -0.36, 0.85, 0, g);
    const w1 = cyl(0.22, 0.1, '#2b2f33', 0.45, 0.22, 0, g, 10); w1.rotation.x = Math.PI / 2;
    const w2 = cyl(0.22, 0.1, '#2b2f33', -0.4, 0.22, 0, g, 10); w2.rotation.x = Math.PI / 2;
    root.add(g);
    return g;
  }

  /* ================= 바닥 포장 ================= */
  flat(37.6, 23, '#d9d2c4', 0, -1.3, 0.01);
  for (let z = -12; z <= 10; z += 2) line(-18.6, z, 18.6, z, { w: 0.04, y: 0.014, color: '#c8c0b0' });
  for (let x = -18; x <= 18; x += 2) line(x, -12.6, x, 10, { w: 0.04, y: 0.014, color: '#c8c0b0' });

  // 상점 입구로 이어지는 진한 석재 길
  function stonePath(x, z0, z1) {
    let k = 0;
    for (let z = z0; z > z1; z -= 2.2) {
      flat(1.9, 1.7, k % 2 ? '#c2b7a4' : '#bdb29e', x, z, 0.017);
      k++;
    }
  }
  stonePath(-13, 8.9, -4.0);
  stonePath(0, 8.9, -0.2);
  stonePath(12.5, 8.9, 0.4);

  // 솜사탕 수레 밑 원형 모자이크
  disc(2.4, '#c6bba6', -4.0, 4.0, 0.014);
  arc(-4.0, 4.0, 2.05, 0, Math.PI * 2, { w: 0.14, y: 0.019, color: '#b0a48e' });
  arc(-4.0, 4.0, 1.45, 0, Math.PI * 2, { w: 0.1, y: 0.019, color: '#b0a48e' });
  disc(0.55, '#b0a48e', -4.0, 4.0, 0.019);

  /* ================= 행인 회피 구역 ================= */
  const BLOCKED = [
    [-18.6, -7.5, -12.8, -4.3],   // 편의점 + 앞 진열
    [-6.5, 6.5, -12.8, -0.5],     // 치킨집 + 테라스
    [7.3, 17.9, -12.8, -0.1],     // 카페 + 데크
    [-6.4, 0.4, 2.3, 6.7],        // 솜사탕 수레 + 줄
    [13.5, 16.9, 5.7, 8.2],       // 매점
    [-16.9, -15.1, 7.7, 9.5],     // 가로수
    [-9.9, -8.1, 7.7, 9.5],
    [2.7, 4.5, 7.7, 9.5],
    [9.5, 11.3, 7.7, 9.5],
    [-17.6, -16.4, 1.2, 4.8],     // 왼쪽 벤치
    [5.0, 8.2, 9.0, 9.8],         // 오른쪽 벤치
    [-11.9, -10.9, 7.0, 8.3],     // 풍선 든 아이
    [5.4, 6.6, 8.1, 9.0],         // 거리 악사
    [17.2, 18.8, 1.6, 3.6],       // 화단
    [17.2, 18.8, 6.6, 8.6],
    [-17.9, -16.1, 5.7, 7.5],
    [4.6, 6.6, -0.5, 2.6],        // 주차된 스쿠터
    [-18.6, -17.4, -3.6, -2.4],   // 가로등
    [12.3, 13.5, 8.9, 10.1],
    [-7.0, -6.2, -1.4, -0.6],     // 전구 기둥
    [5.9, 6.7, -1.4, -0.6],
    [-7.0, -6.2, 2.6, 3.4],
    [5.9, 6.7, 2.6, 3.4],
  ];
  function blocked(x, z) {
    for (let i = 0; i < BLOCKED.length; i++) {
      const b = BLOCKED[i];
      if (x > b[0] && x < b[1] && z > b[2] && z < b[3]) return true;
    }
    return false;
  }
  function pickStrollTarget(s) {
    s.state = 'walk';
    if (Math.random() < 0.18) {           // 가끔 진열장 구경
      s.tx = -13.4 + Math.random() * 2.4; s.tz = -4.4; s.state = 'window'; s.wait = 2 + Math.random() * 2.5;
      return;
    }
    for (let i = 0; i < 16; i++) {
      const x = -17 + Math.random() * 34;
      const z = -3.2 + Math.random() * 12.0;
      if (!blocked(x, z)) { s.tx = x; s.tz = z; return; }
    }
    s.tx = 0; s.tz = 8.4;
  }

  /* ================= 1) 편의점 ================= */
  const SX = -13, SH = 4.2;
  flat(9.4, 6.4, '#e9e5da', SX, -9, 0.016);
  box(10, SH, 0.3, '#f4f2ec', SX, SH / 2, -12.35);
  box(0.3, SH, 7, '#f4f2ec', -17.85, SH / 2, -9);
  box(0.3, SH, 7, '#f4f2ec', -8.15, SH / 2, -9);
  box(10.5, 0.32, 7.5, '#e4dfd4', SX, SH - 0.16, -9);
  parapet(SX, -9, 10.5, 7.5, SH, '#d6cfc2', 0.45);
  acUnit(-16.4, SH, -10.4);
  acUnit(-11.4, SH, -11.0);

  // 유리벽 + 기둥 + 인방
  add(new THREE.BoxGeometry(9.4, 2.5, 0.08), '#3a5266', SX, 1.75, -5.55, root, { transparent: true, opacity: 0.62 });
  for (let i = 0; i <= 4; i++) box(0.12, 2.5, 0.18, '#ccd2d6', -17.6 + i * 2.3, 1.75, -5.5);
  box(9.6, 0.32, 0.26, '#e6e2d8', SX, 0.16, -5.52);
  box(9.6, 0.3, 0.26, '#ccd2d6', SX, 3.12, -5.52);
  box(2.2, 2.4, 0.1, '#26323c', -11.6, 1.2, -5.5);
  box(2.4, 0.12, 0.6, '#cfcabf', -11.6, 0.06, -5.22);

  // 간판 띠 3단
  box(9.8, 0.32, 0.18, '#2e8b57', SX, 3.44, -5.5);
  box(9.8, 0.32, 0.18, '#f2f2f2', SX, 3.76, -5.5);
  box(9.8, 0.32, 0.18, '#2f6db5', SX, 4.08, -5.5);
  awning(SX, 3.06, -5.56, 9.2, 1.3, '#2e8b57', '#f2f2f2', 10, 0.4);

  // 돌출 광고등
  box(0.36, 1.1, 2.2, '#f2f2f2', -7.88, 2.9, -7.0);
  add(new THREE.BoxGeometry(0.06, 0.9, 2.0), '#eaffd9', -7.68, 2.9, -7.0, root,
    { emissive: '#a8f07a', emissiveIntensity: 0.9 });

  // 자판기 두 대
  function vending(x, z, color) {
    box(1.05, 2.0, 0.82, color, x, 1.0, z);
    add(new THREE.BoxGeometry(0.76, 1.05, 0.06), '#eaf6ff', x, 1.42, z + 0.43, root,
      { emissive: '#cfe8ff', emissiveIntensity: 0.5 });
    box(0.86, 0.16, 0.12, '#2b2f33', x, 0.6, z + 0.42);
    box(1.1, 0.08, 0.88, '#8b9196', x, 2.02, z);
  }
  vending(-16.6, -4.95, '#c8463a');
  vending(-15.4, -4.95, '#3a6fc8');

  // 분리수거함 3종
  const BIN = ['#4d8f8a', '#e3b23c', '#5d7fa3'];
  for (let i = 0; i < 3; i++) {
    box(0.42, 0.62, 0.42, BIN[i], -10.1 + i * 0.5, 0.31, -4.95);
    box(0.46, 0.08, 0.46, '#3a3f47', -10.1 + i * 0.5, 0.66, -4.95);
  }

  // 음료 상자 더미 + 우산 꽂이
  crateStack(-17.3, -4.9, 4, '#cfd8dd', '#b8c0c6');
  cyl(0.24, 0.5, '#5a5f66', -10.6, 0.25, -4.8, root, 10);
  for (let i = 0; i < 4; i++) {
    const u = cyl(0.045, 0.8, ['#d95f5f', '#5d7fa3', '#3f6e3a', '#e3b23c'][i],
      -10.6 + Math.cos(i * 1.7) * 0.1, 0.46, -4.8 + Math.sin(i * 1.7) * 0.1, root, 5);
    u.rotation.z = 0.12 * (i - 1.5);
  }

  // -x 옆벽: 배수관 + 계량기함
  cyl(0.09, 4.0, '#9aa0a6', -18.0, 2.0, -11.9, root, 6);
  box(0.34, 0.7, 0.5, '#b9bec3', -18.02, 2.9, -7.2);
  box(0.06, 0.5, 0.06, '#8b9196', -17.86, 2.9, -7.2);

  /* ================= 2) 치킨집 ================= */
  box(9, 7, 7, '#9b4a35', 0, 3.5, -9);
  box(9.4, 0.32, 7.4, '#7d3a2a', 0, 7.0, -9);
  parapet(0, -9, 9.4, 7.4, 7.16, '#8b4230', 0.55);
  waterTank(-2.7, 7.16, -10.3);
  acUnit(2.9, 7.16, -10.4);
  acUnit(-3.4, 7.16, -7.4);

  // 1층: 걸레받이 + 쇼윈도 + 출입문
  box(9.04, 0.45, 0.16, '#6b3225', 0, 0.225, -5.46);
  paintWindow(-3.0, 1.55, -5.42, 2.6, 1.35, false);
  paintWindow(3.0, 1.55, -5.42, 2.6, 1.35, true);
  box(1.95, 2.45, 0.08, '#e8dcc0', 0, 1.22, -5.48);
  box(1.7, 2.3, 0.12, '#241d1a', 0, 1.15, -5.43);
  box(2.0, 0.14, 0.55, '#9aa0a6', 0, 0.07, -5.2);
  awning(0, 2.85, -5.52, 9.0, 1.5, '#d23a2a', '#f2f2f2', 12, 0.42);

  // 간판 띠
  box(9.0, 1.15, 0.22, '#f2c230', 0, 3.58, -5.44);
  box(9.0, 0.16, 0.26, '#d23a2a', 0, 3.02, -5.42);
  box(9.0, 0.16, 0.26, '#d23a2a', 0, 4.14, -5.42);

  // 2층 창 6개 + 창턱 + 벽기둥
  for (let i = 0; i < 6; i++) {
    const wx = -3.5 + i * 1.4;
    paintWindow(wx, 5.7, -5.42, 0.9, 1.1, i === 1 || i === 4);
    box(1.16, 0.1, 0.2, '#e8dcc0', wx, 5.02, -5.42);
  }
  for (const px of [-4.2, -2.8, -1.4, 0, 1.4, 2.8, 4.2]) {
    box(0.18, 3.15, 0.16, '#7d3a2a', px, 5.62, -5.42);
  }
  box(0.3, 7, 0.3, '#7d3a2a', -4.5, 3.5, -5.4);
  box(0.3, 7, 0.3, '#7d3a2a', 4.5, 3.5, -5.4);

  // 세로 돌출 간판(닭다리 실루엣)
  box(0.16, 2.4, 0.92, '#f2c230', 4.68, 5.5, -5.0);
  box(0.2, 0.12, 0.98, '#d23a2a', 4.68, 6.72, -5.0);
  add(new THREE.SphereGeometry(0.19, 8, 6), '#d23a2a', 4.8, 5.62, -5.0, root);
  cyl(0.07, 0.3, '#f4f1ea', 4.8, 5.24, -5.0, root, 6);

  // 테라스
  flat(11.5, 4.6, '#cbb89d', 0, -3.2, 0.018);
  const cheers = [];
  const CHICK = [[-4.4, -3.9, '#e04a3a'], [-1.5, -3.9, '#3a6fd2'], [1.5, -3.9, '#e04a3a'], [4.4, -3.9, '#3a6fd2'], [-2.9, -1.7, '#e04a3a']];
  const T_SHIRT = ['#c94a3a', '#e3b23c', '#6b8f5e', '#8b6bb0', '#d97a9a', '#5d7fa3'];
  function plasticTable(x, z, color) {
    cyl(0.05, 0.72, '#9aa0a6', x, 0.36, z, root, 6);
    cyl(0.5, 0.06, color, x, 0.72, z, root, 12);
    for (const o of [[0.95, 0], [-0.95, 0], [0, 0.95], [0, -0.95]]) {
      cyl(0.045, 0.44, '#9aa0a6', x + o[0], 0.22, z + o[1], root, 6);
      cyl(0.21, 0.06, color, x + o[0], 0.45, z + o[1], root, 10);
    }
  }
  function sitter(x, z, lx, lz, opts) {
    const p = person(opts);
    sitPose(p, 0.45);
    p.g.position.x = x;
    p.g.position.z = z;
    p.g.rotation.y = yawOf(lx - x, lz - z);
    return p;
  }
  CHICK.forEach((tb, i) => {
    const tx = tb[0], tz = tb[1];
    plasticTable(tx, tz, tb[2]);
    cyl(0.15, 0.34, '#f2c230', tx, 0.92, tz, root, 8);
    cyl(0.035, 0.24, '#3f6e3a', tx + 0.28, 0.87, tz - 0.16, root, 5);
    cyl(0.035, 0.24, '#3f6e3a', tx - 0.24, 0.87, tz + 0.2, root, 5);
    const n = 2 + (i % 2);
    for (let k = 0; k < n; k++) {
      const dx = [0.95, -0.95, 0, 0][k], dz = [0, 0, 0.95, -0.95][k];
      const p = sitter(tx + dx, tz + dz, tx, tz, { shirt: T_SHIRT[(i * 3 + k) % T_SHIRT.length], pants: '#3a3f47' });
      if ((i === 1 && k === 0) || (i === 3 && k === 1)) cheers.push(p);
    }
  });

  // 테라스 살림: 냉장고, 맥주 상자, 쌓아둔 의자, 입간판
  box(1.1, 1.9, 0.7, '#e2e6e9', -4.4, 0.95, -5.0);
  box(0.9, 0.6, 0.06, '#b9d4e0', -4.4, 1.45, -4.63);
  crateStack(4.1, -5.0, 4, '#3f7a4a', '#356b40');
  for (let i = 0; i < 3; i++) {
    cyl(0.22, 0.06, '#d9534f', 3.0, 0.48 + i * 0.14, -1.3, root, 10);
    cyl(0.05, 0.12, '#9aa0a6', 3.0, 0.41 + i * 0.14, -1.3, root, 6);
  }
  aFrame(-5.3, -1.3, 0.25, '#2b343c', '#8d6543');

  /* ================= 3) 카페 ================= */
  box(9, 4, 6, '#efe6d2', 12.5, 2, -9.5);
  box(9.3, 0.32, 6.3, '#2f5d4a', 12.5, 4.0, -9.5);
  gableRoof(12.5, 4.16, -8.0, 5.2, 1.15, 2.4, '#2f5d4a');
  parapet(12.5, -9.5, 9.3, 6.3, 4.16, '#d6cfc2', 0.4);
  acUnit(9.4, 4.16, -11.2);

  paintWindow(10.6, 1.7, -6.42, 5.4, 1.85, true);
  box(1.55, 2.35, 0.12, '#2f5d4a', 15.2, 1.18, -6.44);
  box(1.1, 1.95, 0.1, '#33404a', 15.2, 1.15, -6.38);
  box(1.8, 0.12, 0.55, '#b8b0a0', 15.2, 0.06, -6.2);
  for (const cx of [8.15, 16.85]) for (const cz of [-12.35, -6.65]) box(0.26, 4, 0.26, '#2f5d4a', cx, 2, cz);
  awning(10.6, 3.0, -6.52, 5.8, 1.2, '#2f5d4a', '#efe6d2', 8, 0.4);

  // 둥근 매다는 간판
  box(0.08, 0.08, 0.92, '#2f5d4a', 16.4, 3.62, -6.04);
  box(0.05, 0.34, 0.05, '#2f5d4a', 16.4, 3.44, -5.76);
  const cdisc = cyl(0.46, 0.09, '#2f5d4a', 16.4, 3.16, -5.76, root, 18);
  cdisc.rotation.z = Math.PI / 2;
  const cdisc2 = cyl(0.3, 0.11, '#efe6d2', 16.4, 3.16, -5.76, root, 16);
  cdisc2.rotation.z = Math.PI / 2;

  // 나무 데크
  flat(9, 6, '#a77a52', 12.5, -3.5, 0.02);
  for (let z = -6; z <= -1; z += 0.75) line(8.05, z, 16.95, z, { w: 0.03, y: 0.024, color: '#8d6543' });
  box(9, 0.12, 0.18, '#8d6543', 12.5, 0.07, -0.58);
  box(9, 0.12, 0.18, '#8d6543', 12.5, 0.07, -6.42);
  for (const pp of [[9.6, -3.7, '#f4f1ea'], [12.5, -3.7, '#2f5d4a'], [15.6, -3.7, '#f4f1ea']]) {
    cyl(0.06, 2.7, '#8d6543', pp[0], 1.35, pp[1], root, 6);
    box(2.8, 0.1, 2.8, pp[2], pp[0], 2.75, pp[1]);
  }
  function cafeTable(x, z) {
    cyl(0.05, 0.72, '#3c4148', x, 0.36, z, root, 6);
    cyl(0.42, 0.06, '#f4f1ea', x, 0.72, z, root, 14);
    cyl(0.24, 0.05, '#3c4148', x, 0.03, z, root, 10);
  }
  function chair(x, z, color) {
    cyl(0.05, 0.42, '#3c4148', x, 0.21, z, root, 6);
    cyl(0.22, 0.06, color, x, 0.44, z, root, 10);
  }
  const sippers = [];
  const CAFE_T = [[9.6, -5.2], [9.6, -2.2], [12.5, -5.2], [12.5, -2.2], [15.6, -5.2], [15.6, -2.2]];
  CAFE_T.forEach((tb, i) => {
    const tx = tb[0], tz = tb[1];
    cafeTable(tx, tz);
    cyl(0.045, 0.07, '#ffffff', tx + 0.12, 0.79, tz - 0.1, root, 8);
    cyl(0.045, 0.07, '#ffffff', tx - 0.14, 0.79, tz + 0.12, root, 8);
    for (let k = 0; k < 2; k++) {
      const dx = k ? 0.82 : -0.82;
      chair(tx + dx, tz, '#2f5d4a');
      const p = sitter(tx + dx, tz, tx, tz, { shirt: T_SHIRT[(i * 2 + k) % T_SHIRT.length], pants: '#3c4148' });
      if ((i + k) % 3 === 0) sippers.push(p);
    }
  });

  // 창밑 화단 + 올리브 화분 + 난로 + 칠판
  for (const fx of [9.2, 10.9, 12.6]) {
    box(1.3, 0.32, 0.42, '#8d6543', fx, 0.62, -6.24);
    for (let i = 0; i < 4; i++) {
      add(new THREE.SphereGeometry(0.13, 6, 5), ['#d95f5f', '#f6a6c8', '#f2c230', '#efe6d2'][i],
        fx - 0.45 + i * 0.3, 0.84, -6.24, root);
    }
  }
  pottedTree(8.5, -5.9, '#b8b0a0', '#6b8f5e', 1.2);
  pottedTree(16.55, -5.6, '#b8b0a0', '#7ba06a', 1.1);
  cyl(0.42, 0.14, '#8b9196', 16.8, 0.07, -1.25, root, 12);
  cyl(0.09, 2.4, '#b9bec3', 16.8, 1.2, -1.25, root, 8);
  add(new THREE.CylinderGeometry(0.1, 0.42, 0.5, 10), '#8b9196', 16.8, 2.62, -1.25, root, { flatShading: true });
  aFrame(14.0, -1.6, -0.4, '#2b343c', '#8d6543');

  // +x 옆벽: 배수관, 계량기함, 상자 더미
  cyl(0.09, 4.1, '#9aa0a6', 17.16, 2.05, -12.05, root, 6);
  box(0.36, 0.8, 0.6, '#b9bec3', 17.2, 2.6, -8.6);
  box(0.06, 0.5, 0.06, '#8b9196', 17.02, 2.6, -8.6);
  crateStack(17.6, -10.4, 4, '#c9c0ad', '#b8af9c');

  /* ================= 솜사탕 수레 ================= */
  box(1.6, 0.9, 0.9, '#8fc9e8', -4, 0.85, 4);
  box(1.7, 0.09, 1.0, '#e9f5fb', -4, 1.32, 4);
  for (const wx of [-4.75, -3.25]) {
    const w = cyl(0.3, 0.1, '#3a4148', wx, 0.3, 4, root, 12);
    w.rotation.z = Math.PI / 2;
  }
  cyl(0.32, 0.12, '#cfd8dd', -4.35, 1.42, 4, root, 12);
  add(new THREE.CylinderGeometry(0.3, 0.26, 0.42, 12), '#eaf6fb', -4.35, 1.68, 4, root, { transparent: true, opacity: 0.55 });
  const puffGeo = new THREE.SphereGeometry(0.2, 8, 6);
  for (const pf of [[-3.45, 4.28, 1], [-3.2, 3.86, 0], [-3.62, 3.7, 1]]) {
    cyl(0.018, 0.42, '#f4f1ea', pf[0], 1.56, pf[1], root, 5);
    add(puffGeo, pf[2] ? '#f6a6c8' : '#c9a6f6', pf[0], 1.92, pf[1], root,
      { emissive: pf[2] ? '#f6a6c8' : '#c9a6f6', emissiveIntensity: 0.3 });
  }
  cyl(0.05, 2.6, '#d9d2c4', -4.55, 2.1, 4, root, 6);
  for (let i = 0; i < 8; i++) {
    const g = new THREE.CylinderGeometry(0.04, 1.35, 0.75, 4, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4);
    add(g, i % 2 ? '#f6a6c8' : '#f4f1ea', -4.55, 3.05, 4, root);
  }
  const vendor = person({ shirt: '#f2f2f2', pants: '#3a3f47' });
  vendor.g.position.set(-5.2, 0, 3.5);
  vendor.g.rotation.y = yawOf(2.4, 1.4);

  /* ================= 매점(키오스크) ================= */
  box(2.6, 1.05, 1.1, '#c9c0ad', 15.2, 0.52, 6.6);
  box(2.75, 0.1, 1.25, '#8d6543', 15.2, 1.09, 6.6);
  box(0.09, 2.4, 0.09, '#8d6543', 13.95, 1.2, 7.55);
  box(0.09, 2.4, 0.09, '#8d6543', 16.45, 1.2, 7.55);
  box(2.5, 1.25, 0.1, '#b8af9c', 15.2, 1.72, 7.55);
  awning(15.2, 2.7, 6.0, 2.9, 1.5, '#d23a2a', '#f2f2f2', 6, 0.35);
  for (let i = 0; i < 4; i++) {
    box(0.3, 0.24, 0.24, ['#d95f5f', '#5d7fa3', '#e3b23c', '#6b8f5e'][i], 14.3 + i * 0.6, 1.22, 6.6);
  }
  const kioskClerk = person({ shirt: '#5d7fa3', pants: '#3a3f47' });
  kioskClerk.g.position.set(15.2, 0, 7.25);
  kioskClerk.g.rotation.y = yawOf(0, 1);

  /* ================= 가로수 / 화단 / 볼라드 / 벤치 / 가로등 ================= */
  function streetTree(x, z) {
    flat(1.5, 1.5, '#3a3f45', x, z, 0.021);
    flat(1.15, 1.15, '#2b2f33', x, z, 0.024);
    tree(x, z, 0.72, '#3f6e3a');
  }
  streetTree(-16.0, 8.6);
  streetTree(-9.0, 8.6);
  streetTree(3.6, 8.6);
  streetTree(10.4, 8.6);

  function planter(x, z) {
    box(1.5, 0.55, 1.5, '#b8b0a0', x, 0.275, z);
    box(1.62, 0.1, 1.62, '#cfc7b6', x, 0.55, z);
    flat(1.3, 1.3, '#5b4030', x, z, 0.575);
    bush(x, z, 0.95, '#4f7f42');
  }
  planter(-17.0, 6.6); planter(-17.0, -1.0);
  planter(17.2, 2.6); planter(17.2, 7.6);
  tree(-17.0, 6.6, 0.5, '#3f6e3a');
  tree(17.2, 7.6, 0.55, '#477a3d');

  // 볼라드: 보도 경계, 길목은 비운다
  for (let x = -18; x <= 18; x += 3) {
    if (Math.abs(x + 13) < 1.6 || Math.abs(x) < 1.6 || Math.abs(x - 12.5) < 1.6) continue;
    cyl(0.14, 0.9, '#4d545b', x, 0.45, 9.9, root, 8);
    add(new THREE.SphereGeometry(0.14, 8, 5), '#8b9196', x, 0.92, 9.9, root);
  }

  bench(-17.0, 3.0, Math.PI / 2, 3.0);
  bench(6.6, 9.3, Math.PI, 3.0);
  lamp(-18.0, -3.0, 6);
  lamp(12.9, 9.5, 6);

  /* ================= 전구 줄 ================= */
  const STRANDS = [
    [-6.6, -1.0, 6.3, -1.0],
    [-6.6, 3.0, 6.3, 3.0],
    [7.6, -5.9, 17.3, -5.9],
    [7.6, -0.9, 17.3, -0.9],
  ];
  for (let i = 0; i < STRANDS.length; i++) {
    const s = STRANDS[i];
    cyl(0.07, 4.6, '#5a5f66', s[0], 2.3, s[1], root, 8);
    cyl(0.07, 4.6, '#5a5f66', s[2], 2.3, s[3], root, 8);
    box(0.24, 0.1, 0.24, '#3c4148', s[0], 4.6, s[1]);
    box(0.24, 0.1, 0.24, '#3c4148', s[2], 4.6, s[3]);
  }
  const bulbGeo = new THREE.SphereGeometry(0.1, 6, 5);
  function strand(ax, az, bx, bz, sag) {
    const n = Math.max(6, Math.round(Math.hypot(bx - ax, bz - az) / 0.9));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = ax + (bx - ax) * u;
      const z = az + (bz - az) * u;
      const y = 4.55 - sag * (4 * u * (1 - u));
      add(bulbGeo, '#ffd98a', x, y, z, root, { emissive: '#ffd98a', emissiveIntensity: 1.4 });
    }
  }
  for (let i = 0; i < STRANDS.length; i++) {
    const s = STRANDS[i];
    strand(s[0], s[1], s[2], s[3], 0.95);
  }

  /* ================= 행인 풀 ================= */
  const SHIRTS = ['#c94a3a', '#e3b23c', '#6b8f5e', '#8b6bb0', '#d97a9a', '#5d7fa3', '#b5654a', '#4d8f8a', '#d9843c', '#6f7fa8'];
  const SLOTS = [[-3.6, 4.9], [-2.8, 5.15], [-2.0, 5.4], [-1.2, 5.65]];
  const candyGeo = new THREE.SphereGeometry(0.2, 8, 6);
  function makeCandy(p) {
    const g = new THREE.Group();
    g.position.set(0.3, p.hip + 0.1, 0.2);
    cyl(0.02, 0.42, '#f4f1ea', 0, 0.05, 0, g, 5);
    add(candyGeo, '#f6a6c8', 0, 0.3, 0, g, { emissive: '#f6a6c8', emissiveIntensity: 0.3 });
    g.visible = false;
    p.g.add(g);
    return g;
  }

  const strollers = [];
  for (let i = 0; i < 12; i++) {
    const kid = i >= 9;
    const p = person({ shirt: SHIRTS[i % SHIRTS.length], pants: '#3a3f47', h: kid ? 1.15 + (i % 3) * 0.07 : 1.7 + (i % 4) * 0.03 });
    strollers.push({ p, x: 0, z: 0, tx: 0, tz: 0, face: yawOf(0, 1), state: 'walk', slot: 0, wait: 0, candyT: 0, candy: makeCandy(p) });
  }
  const queue = [];
  strollers.forEach((s, i) => {
    if (i < 4) {
      s.state = 'queue'; s.slot = i;
      s.x = SLOTS[i][0]; s.z = SLOTS[i][1];
      queue.push(s);
    } else {
      pickStrollTarget(s);
      s.x = s.tx; s.z = s.tz;
    }
    s.p.g.position.set(s.x, 0, s.z);
    s.p.g.rotation.y = s.face;
  });

  /* ================= 배달 스쿠터 ================= */
  const scooter = scooterBody('#d23a2a');
  const rider = person({ shirt: '#2f6db5', pants: '#2b2f33' });
  scooter.add(rider.g);
  sitPose(rider, 0.72);
  rider.g.position.x = -0.08;
  rider.g.rotation.y = 0;
  rider.armL.rotation.z = 1.35;
  rider.armR.rotation.z = 1.35;

  // 치킨집 앞에 세워둔 스쿠터 두 대
  const park1 = scooterBody('#3a6fc8');
  park1.position.set(5.2, 0, 0.4);
  park1.rotation.y = yawOf(1, 0.4);
  const park2 = scooterBody('#e3b23c');
  park2.position.set(5.4, 0, 1.9);
  park2.rotation.y = yawOf(-1, 0.3);
  const park3 = scooterBody('#8b9196');
  park3.position.set(-6.0, 0, 0.6);
  park3.rotation.y = yawOf(-1, -0.5);

  /* ================= 거리의 소품 인물들 ================= */
  // 풍선 든 아이
  const kid = person({ shirt: '#e3b23c', pants: '#3a3f47', h: 1.15 });
  kid.g.position.set(-11.4, 0, 7.6);
  kid.g.rotation.y = yawOf(1, -1);
  const balloon = new THREE.Group();
  balloon.position.set(0.3, 0, 0.14);
  kid.g.add(balloon);
  cyl(0.012, 1.05, '#f4f1ea', 0, 1.45, 0, balloon, 4);
  add(new THREE.SphereGeometry(0.26, 8, 6), '#d95f5f', 0, 2.16, 0, balloon,
    { emissive: '#d95f5f', emissiveIntensity: 0.25 });

  // 거리 악사
  const musician = person({ shirt: '#8b6bb0', pants: '#3c4148' });
  musician.g.position.set(6.0, 0, 8.6);
  musician.g.rotation.y = yawOf(1, 0.2);
  const guitar = new THREE.Group();
  guitar.position.set(0.26, 0.88, 0.14);
  guitar.rotation.z = 0.4;
  guitar.rotation.x = 0.2;
  musician.g.add(guitar);
  box(0.4, 0.5, 0.12, '#8d6543', 0, 0, 0, guitar);
  box(0.09, 0.42, 0.05, '#5b4030', 0, 0.42, 0, guitar);
  musician.armR.rotation.z = 1.05;

  // 개 + 주인(스톨러 5번을 따라간다)
  const dogOwner = strollers[5];
  const dog = new THREE.Group();
  root.add(dog);
  box(0.5, 0.24, 0.22, '#b08d5f', 0, 0.36, 0, dog);
  add(new THREE.SphereGeometry(0.15, 8, 6), '#b08d5f', 0.26, 0.48, 0, dog);
  add(new THREE.SphereGeometry(0.05, 6, 5), '#2b2f33', 0.38, 0.48, 0.08, dog);
  box(0.09, 0.06, 0.16, '#8a6c45', 0.24, 0.6, 0, dog);
  for (const o of [[0.17, 0.08], [0.17, -0.08], [-0.17, 0.08], [-0.17, -0.08]]) {
    box(0.06, 0.26, 0.06, '#a07e52', o[0], 0.13, o[1], dog);
  }
  box(0.16, 0.05, 0.05, '#a07e52', -0.3, 0.44, 0, dog);
  box(0.85, 0.03, 0.03, '#3a3f47', -0.5, 0.52, 0, dog);

  // 화단 위 고양이
  box(0.3, 0.2, 0.18, '#3a3f47', 17.55, 0.66, 1.99);
  add(new THREE.SphereGeometry(0.12, 8, 6), '#3a3f47', 17.55, 0.82, 2.02, root);
  add(new THREE.SphereGeometry(0.045, 6, 5), '#3a3f47', 17.55, 0.93, 1.95, root);
  box(0.06, 0.14, 0.05, '#3a3f47', 17.44, 0.78, 1.99);
  box(0.05, 0.16, 0.05, '#3a3f47', 17.66, 0.74, 1.92);

  /* ================= 상태 ================= */
  const PATH = { cx: 6.5, cz: 6.2, a: 6.0, b: 1.4 };
  let scootU = Math.PI * 0.15;
  let queueTimer = 3.5;

  function moveTo(s, dt) {
    const dx = s.tx - s.x, dz = s.tz - s.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) return 0;
    const sp = Math.min(1.4, 0.7 + d * 0.6);
    s.x += dx / d * sp * dt;
    s.z += dz / d * sp * dt;
    s.face = yawOf(dx, dz);
    return sp;
  }

  function serveQueue() {
    if (!queue.length) return;
    const first = queue.shift();
    for (let i = 0; i < queue.length; i++) queue[i].slot = i;
    first.state = 'walk';
    first.candy.visible = true;
    first.candyT = 0;
    pickStrollTarget(first);
    let best = null;
    for (let i = 0; i < strollers.length; i++) {
      const o = strollers[i];
      if (o.state !== 'walk' || o.candyT < 6) continue;
      if (!best || o.candyT > best.candyT) best = o;
    }
    if (best) {
      best.state = 'queue';
      best.slot = queue.length;
      best.candy.visible = false;
      queue.push(best);
    }
  }

  function updateScooter(dt) {
    const sx = PATH.a * Math.sin(scootU);
    const cz = PATH.b * Math.cos(scootU);
    const r = Math.hypot(sx, cz);
    scootU += dt * 4 / Math.max(1.2, r);
    if (scootU > Math.PI * 2) scootU -= Math.PI * 2;
    scooter.position.set(PATH.cx + PATH.a * Math.cos(scootU), 0, PATH.cz + PATH.b * Math.sin(scootU));
    scooter.rotation.y = yawOf(-PATH.a * Math.sin(scootU), PATH.b * Math.cos(scootU));
  }

  function updateSitters(t) {
    for (let i = 0; i < cheers.length; i++) {
      const p = cheers[i];
      const k = Math.max(0, Math.sin(t * 0.55 + i * 2.3));
      p.armL.rotation.z = 0.4 + k * k * 1.5;
      p.armR.rotation.z = 0.4 + k * k * 0.3;
    }
    for (let i = 0; i < sippers.length; i++) {
      const p = sippers[i];
      const k = Math.max(0, Math.sin(t * 0.42 + i * 1.9));
      p.armL.rotation.z = 0.4 + k * 1.15;
    }
  }

  return {
    update(dt, t) {
      queueTimer -= dt;
      if (queueTimer <= 0) { serveQueue(); queueTimer = 5; }

      for (let i = 0; i < strollers.length; i++) {
        const s = strollers[i];
        const p = s.p;
        let sp = 0;
        if (s.state === 'queue') {
          const slot = SLOTS[s.slot < 0 ? 0 : (s.slot > 3 ? 3 : s.slot)];
          s.tx = slot[0]; s.tz = slot[1];
          sp = moveTo(s, dt);
          s.face = yawOf(0, -1);
        } else if (s.state === 'window') {
          s.wait -= dt;
          s.face = yawOf(0, -1);
          if (s.wait <= 0) pickStrollTarget(s);
        } else {
          s.candyT += dt;
          if (s.candy.visible && s.candyT > 26) s.candy.visible = false;
          sp = moveTo(s, dt);
          const dx = s.tx - s.x, dz = s.tz - s.z;
          if (dx * dx + dz * dz < 0.5) {
            if (Math.random() < 0.3) { s.state = 'window'; s.wait = 2 + Math.random() * 2.5; }
            else pickStrollTarget(s);
          }
        }
        walkPose(p, sp, dt);
        if (s.candy.visible) p.armL.rotation.z = 0.95;
        p.g.position.set(s.x, p.bob, s.z);
        let dy = s.face - p.g.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        p.g.rotation.y += dy * Math.min(1, dt * 6);
      }

      updateScooter(dt);
      updateSitters(t);

      // 개는 주인 옆을 따라 걷는다
      const of = dogOwner.p.g.rotation.y;
      const fx = Math.cos(of), fz = -Math.sin(of);
      const ox = dogOwner.p.g.position.x, oz = dogOwner.p.g.position.z;
      dog.position.set(ox - fx * 0.85 - fz * 0.62, 0, oz - fz * 0.85 + fx * 0.62);
      dog.rotation.y = of;

      // 풍선 위아래
      balloon.position.y = Math.sin(t * 1.7) * 0.07;

      // 악사 스트로크
      musician.armR.rotation.z = 1.0 + Math.sin(t * 5.5) * 0.18;
    },
  };
}
