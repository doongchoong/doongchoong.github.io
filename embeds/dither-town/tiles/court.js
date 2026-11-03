// 농구장. 코트는 FIBA 규격 28 × 15 m.
export const meta = { id: 'court', name: '농구장' };

export function build(kit) {
  const { THREE, box, cyl, flat, line, arc, add, tree, bench, fence, lamp, person, walkPose, sitPose, yawOf } = kit;

  flat(32, 18, '#3f7f62', 0, 0, 0.01);                // 코트 바깥 여유 공간
  flat(32, 1.8, '#b8b2a5', 0, -10.1, 0.012);          // 벤치 앞 포장

  const HL = 14, HW = 7.5;
  const HOOP_X = HL - 1.575;
  flat(28, 15, '#2f6fa3', 0, 0, 0.02);
  for (const s of [-1, 1]) flat(5.8, 4.9, '#b9503a', s * (HL - 2.9), 0, 0.025);

  line(-HL, -HW, HL, -HW); line(-HL, HW, HL, HW);
  line(-HL, -HW, -HL, HW); line(HL, -HW, HL, HW);
  line(0, -HW, 0, HW);
  arc(0, 0, 1.8, 0, Math.PI * 2);
  const ALPHA = Math.asin(6.6 / 6.75);
  for (const s of [-1, 1]) {
    const hx = s * HOOP_X, ft = s * (HL - 5.8);
    line(s * HL, -2.45, ft, -2.45); line(s * HL, 2.45, ft, 2.45); line(ft, -2.45, ft, 2.45);
    arc(ft, 0, 1.8, 0, Math.PI * 2);
    const xEnd = hx - s * 6.75 * Math.cos(ALPHA);
    line(s * HL, -6.6, xEnd, -6.6); line(s * HL, 6.6, xEnd, 6.6);
    if (s > 0) arc(hx, 0, 6.75, Math.PI - ALPHA, Math.PI + ALPHA);
    else arc(hx, 0, 6.75, -ALPHA, ALPHA);
  }

  // 골대
  for (const s of [-1, 1]) {
    cyl(0.09, 3.5, '#3c4148', s * (HL + 1.0), 1.75, 0);
    box(1.9, 0.08, 0.08, '#3c4148', s * (HL + 0.05), 3.35, 0);
    box(0.05, 1.05, 1.8, '#f2f4f5', s * (HL - 1.2), 3.4, 0);
    box(0.06, 0.45, 0.59, '#c94a2a', s * (HL - 1.23), 3.27, 0);
    const rim = add(new THREE.TorusGeometry(0.23, 0.025, 6, 20), '#e05a24', s * HOOP_X, 3.05, 0);
    rim.rotation.x = Math.PI / 2;
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.14, 0.42, 10, 2, true),
      new THREE.MeshStandardMaterial({ color: '#ffffff', wireframe: true }));
    net.position.set(s * HOOP_X, 2.84, 0);
    kit.root.add(net);
  }

  fence(-16.5, -11.3, 16.5, -11.3);
  fence(-16.5, -11.3, -16.5, 9);
  for (const [x, z] of [[-16.8, -11.8], [16.8, -11.8], [-16.8, 9.6], [16.8, 9.6]]) lamp(x, z);
  bench(-6, -10.4); bench(6, -10.4);
  tree(-17.7, -12, 1.1); tree(17.6, -12, 1.0); tree(-17.8, 9.4, 0.8); tree(17.9, 9.6, 0.9);

  /* 선수 10명: 0~4 흰 팀(+x 공격), 5~9 남색 팀(-x 공격) */
  const players = [];
  for (let i = 0; i < 10; i++) {
    const team = i < 5 ? 0 : 1;
    const p = person({ shirt: team ? '#1f2f5c' : '#f4f1ea', pants: team ? '#1f2f5c' : '#e8e4da', h: 1.85 + Math.random() * 0.2 });
    p.team = team;
    p.x = (Math.random() - 0.5) * 20; p.z = (Math.random() - 0.5) * 10;
    p.vx = 0; p.vz = 0; p.jump = 0;
    p.seed = Math.random() * 100;
    players.push(p);
  }
  const ball = add(new THREE.SphereGeometry(0.13, 10, 8), '#e0742b', 0, 0.13, 0);

  const sitters = [];
  [[-7.2, -10.35], [-6.1, -10.35], [-4.6, -10.35], [5.0, -10.35], [6.8, -10.35]].forEach(([x, z], i) => {
    const p = person({ shirt: ['#c94a3a', '#e3b23c', '#6b8f5e', '#8b6bb0', '#d97a9a'][i], pants: '#3a3f47' });
    p.g.position.set(x, 0, z);
    sitPose(p, 0.48);
    p.g.rotation.y = yawOf(0, 1);
    sitters.push(p);
  });
  const watchers = [];
  [[-12.5, -11.9], [-11.8, -12.1], [11, -12.0]].forEach(([x, z], i) => {
    const p = person({ shirt: ['#5d7fa3', '#b5654a', '#d9d4c7'][i] });
    p.g.position.set(x, 0, z);
    watchers.push(p);
  });

  /* 경기 흐름 */
  const game = { poss: 0, handler: 0, phase: 'hold', timer: 2, t: 0, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), peak: 1, target: -1, made: true };
  const hoopX = () => (game.poss === 0 ? 1 : -1) * HOOP_X;
  const SPOTS = [[7.2, 0], [5.3, 4.8], [5.3, -4.8], [0.9, 6.3], [1.9, -2.4]];
  function spotOf(p, idx, t) {
    const hx = hoopX(), s = Math.sign(hx);
    const [dx, dz] = SPOTS[idx % 5];
    return [hx - s * dx + Math.sin(t * 0.7 + p.seed) * 1.1, dz + Math.cos(t * 0.6 + p.seed * 1.7) * 1.1];
  }
  function handPos(p, out) {
    const yaw = p.g.rotation.y;
    return out.set(p.x + Math.cos(yaw) * 0.35 - Math.sin(yaw) * 0.25, 0, p.z - Math.sin(yaw) * 0.35 - Math.cos(yaw) * 0.25);
  }
  const tmp = new THREE.Vector3();

  function updateGame(dt, t) {
    const hx = hoopX();
    const offense = players.filter((p) => p.team === game.poss);
    const defense = players.filter((p) => p.team !== game.poss);
    const handler = players[game.handler];

    offense.forEach((p, i) => {
      let [tx, tz] = spotOf(p, i, t);
      if (p === handler && game.phase === 'hold') {
        const k = Math.min(1, Math.max(0, 1 - game.timer / 2.5));
        tx += (hx - tx) * k * 0.35; tz *= 1 - k * 0.3;
      }
      p.tx = tx; p.tz = tz;
    });
    defense.forEach((p, i) => {
      const o = offense[i];
      const dx = hx - o.x, dz = -o.z, d = Math.hypot(dx, dz) || 1;
      p.tx = o.x + dx / d * 1.3; p.tz = o.z + dz / d * 1.3;
    });

    for (const p of players) {
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.min(5.5, d * 1.6);
      const wx = d > 0.01 ? dx / d * sp : 0, wz = d > 0.01 ? dz / d * sp : 0;
      const k = Math.min(1, dt * 3.5);
      p.vx += (wx - p.vx) * k; p.vz += (wz - p.vz) * k;
      p.x += p.vx * dt; p.z += p.vz * dt;
      const speed = Math.hypot(p.vx, p.vz);
      const face = speed > 0.4 ? yawOf(p.vx, p.vz) : yawOf(hx - p.x, -p.z);
      let dy = face - p.g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.g.rotation.y += dy * Math.min(1, dt * 8);
      walkPose(p, speed, dt);
      p.jump = Math.max(0, p.jump - dt);
      const j = p.jump > 0 ? Math.sin((p.jump / 0.55) * Math.PI) * 0.45 : 0;
      p.g.position.set(p.x, p.bob + j, p.z);
    }

    if (game.phase === 'hold') {
      handPos(handler, tmp);
      ball.position.set(tmp.x, 0.13 + Math.abs(Math.sin(t * 7.5)) * 0.8, tmp.z);
      game.timer -= dt;
      if (game.timer <= 0 && Math.abs(handler.x - hx) < 10) {
        const near = Math.hypot(handler.x - hx, handler.z) < 7.6;
        if (near && Math.random() < 0.5) {
          game.phase = 'shot'; game.t = 0; game.dur = 1.05; game.peak = 2.4;
          game.from.set(handler.x, 2.3, handler.z);
          game.made = Math.random() < 0.6;
          game.to.set(hx + (game.made ? 0 : (Math.random() - 0.5) * 0.5), 3.1, game.made ? 0 : (Math.random() - 0.5) * 0.5);
          handler.jump = 0.55;
        } else {
          const mates = offense.filter((p) => p !== handler);
          const r = mates[(Math.random() * mates.length) | 0];
          game.target = players.indexOf(r);
          game.phase = 'pass'; game.t = 0;
          handPos(handler, game.from); game.from.y = 1.2;
          game.dur = 0.25 + Math.hypot(r.x - handler.x, r.z - handler.z) / 13;
          game.peak = 0.3;
        }
      }
    } else if (game.phase === 'pass') {
      game.t += dt;
      handPos(players[game.target], game.to); game.to.y = 1.2;
      const u = Math.min(1, game.t / game.dur);
      ball.position.lerpVectors(game.from, game.to, u);
      ball.position.y += Math.sin(u * Math.PI) * game.peak;
      if (u >= 1) { game.handler = game.target; game.phase = 'hold'; game.timer = 0.8 + Math.random() * 1.8; }
    } else if (game.phase === 'shot') {
      game.t += dt;
      const u = Math.min(1, game.t / game.dur);
      ball.position.lerpVectors(game.from, game.to, u);
      ball.position.y += Math.sin(u * Math.PI) * game.peak;
      if (u >= 1) {
        game.phase = 'drop'; game.t = 0;
        game.from.copy(ball.position);
        const s = Math.sign(hx);
        game.to.set(game.made ? hx : hx - s * (1.5 + Math.random() * 2), 0.13, game.made ? 0 : (Math.random() - 0.5) * 5);
      }
    } else if (game.phase === 'drop') {
      game.t += dt;
      const u = Math.min(1, game.t / 0.6);
      ball.position.lerpVectors(game.from, game.to, u);
      ball.position.y = game.made ? 3.05 - (3.05 - 0.13) * u * u : 0.13 + (game.from.y - 0.13) * (1 - u) + Math.sin(u * Math.PI) * 0.8;
      if (u >= 1) {
        // 공수 교대: 새 공격 팀에서 공에 가장 가까운 선수가 잡는다
        game.poss = 1 - game.poss;
        let best = null, bd = Infinity;
        for (const p of players) {
          if (p.team !== game.poss) continue;
          const d = Math.hypot(p.x - ball.position.x, p.z - ball.position.z);
          if (d < bd) { bd = d; best = p; }
        }
        game.handler = players.indexOf(best);
        game.phase = 'hold'; game.timer = 1.5 + Math.random();
      }
    }
  }

  return {
    update(dt, t) {
      updateGame(dt, t);
      sitters.forEach((p, i) => {
        p.head.position.y = p.headY + Math.sin(t * 1.3 + i) * 0.02;
        p.armL.rotation.z = 0.4 + Math.max(0, Math.sin(t * 0.9 + i * 2)) * 0.3;
      });
      for (const p of watchers) {
        const bx = ball.position.x - p.g.position.x, bz = ball.position.z - p.g.position.z;
        p.g.rotation.y = yawOf(bx, bz) * 0.3 + yawOf(0, 1) * 0.7;
      }
    },
  };
}
