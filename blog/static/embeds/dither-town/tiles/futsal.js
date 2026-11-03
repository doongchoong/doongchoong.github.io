// 풋살장. 30 × 16 m 인조잔디에서 5 대 5 경기.
export const meta = { id: 'futsal', name: '풋살장' };

export function build(kit) {
  const { THREE, box, cyl, flat, disc, line, arc, add, tree, bench, fence, lamp, person, walkPose, sitPose, yawOf } = kit;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- 바닥 ---------- */
  flat(33, 19, '#3a5f3f', 0, 0, 0.01);                                   // 고무 런오프
  for (let i = 0; i < 10; i++) flat(3, 16, i % 2 ? '#4a9a52' : '#3f8f4a', -13.5 + 3 * i, 0, 0.015);  // 잔디 줄무늬

  /* ---------- 라인 ---------- */
  const HL = 15, HW = 8;
  line(-HL, -HW, HL, -HW); line(-HL, HW, HL, HW);
  line(-HL, -HW, -HL, HW); line(HL, -HW, HL, HW);
  line(0, -HW, 0, HW);                                                   // 하프라인
  arc(0, 0, 3, 0, Math.PI * 2);                                          // 센터 서클
  disc(0.14, '#f4f4ef', 0, 0, 0.031);

  // 페널티 에어리어: 골포스트에서 반지름 6 m 쿼터서클 두 개 + 짧은 직선
  for (const s of [-1, 1]) {
    const gx = s * HL;
    if (s > 0) {
      arc(gx, 1.5, 6, Math.PI, Math.PI * 1.5);
      arc(gx, -1.5, 6, Math.PI * 0.5, Math.PI);
    } else {
      arc(gx, 1.5, 6, -Math.PI * 0.5, 0);
      arc(gx, -1.5, 6, 0, Math.PI * 0.5);
    }
    line(s * 9, 1.5, s * 9, -1.5);
    disc(0.13, '#f4f4ef', s * 9, 0, 0.031);                              // 6 m 페널티 마크
  }

  /* ---------- 골대 ---------- */
  const netMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide,
  });
  function goal(s) {
    const gx = s * HL, D = 1.4;
    for (const z of [-1.5, 1.5]) cyl(0.07, 2, '#f7f7f2', gx, 1, z);
    const bar = cyl(0.07, 3.14, '#f7f7f2', gx, 2, 0);
    bar.rotation.x = Math.PI / 2;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), netMat);
    back.rotation.y = Math.PI / 2;
    back.position.set(gx + s * D, 1, 0);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(D, 3), netMat);
    top.rotation.x = -Math.PI / 2;
    top.position.set(gx + s * D / 2, 2, 0);
    kit.root.add(back, top);
    for (const z of [-1.5, 1.5]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(D, 2), netMat);
      side.position.set(gx + s * D / 2, 1, z);
      kit.root.add(side);
    }
  }
  goal(1); goal(-1);

  /* ---------- 둘레 시설 ---------- */
  fence(-16.8, -10.5, 16.8, -10.5, 4);
  fence(-16.8, -10.5, -16.8, 9.8, 4);
  box(33.6, 0.9, 0.12, '#3f6f8f', 0, 0.45, 9.6);                         // 근처 낮은 보드

  for (const [x, z] of [[-18.4, -11.7], [18.4, -11.7], [-18.4, 9.9], [18.4, 9.9]]) lamp(x, z);
  bench(-5, -11.5); bench(5, -11.5);
  tree(-18, -12.5, 1.0); tree(18, -12.5, 0.9); tree(18.2, 9.0, 0.7);

  /* ---------- 선수 10명: 0팀 +x 공격, 1팀 -x 공격 ---------- */
  const OFF = [-6, -1, -1, 5];        // 공격 방향 기준 x 오프셋
  const LANE = [0, 5, -5, 1.5];       // 좌우 위치
  const dirOf = (t) => (t === 0 ? 1 : -1);

  const players = [];
  for (let t = 0; t < 2; t++) {
    const s = dirOf(t);
    for (let i = 0; i < 5; i++) {
      const gk = i === 0;
      const idx = i - 1;
      const shirt = gk ? (t === 0 ? '#4aa3d8' : '#8b5bb0') : (t === 0 ? '#e8d44d' : '#c8463a');
      const pants = gk ? '#2b2b2e' : (t === 0 ? '#2b2b2e' : '#f2f2f2');
      const p = person({ shirt, pants, h: 1.76 + Math.random() * 0.16 });
      p.team = t; p.gk = gk; p.idx = idx;
      p.x = gk ? s * -14.3 : s * OFF[idx];
      p.z = gk ? 0 : LANE[idx];
      p.vx = 0; p.vz = 0; p.seed = Math.random() * 100;
      p.g.position.set(p.x, 0, p.z);
      players.push(p);
    }
  }
  const ball = add(new THREE.SphereGeometry(0.11, 10, 8), '#f4f4f0', 0, 0.11, 0);

  /* ---------- 관중 ---------- */
  const sitters = [];
  [[-6.2, -11.5], [-5.2, -11.5], [4.4, -11.5], [5.4, -11.5]].forEach(([x, z], i) => {
    const p = person({ shirt: ['#c94a3a', '#e3b23c', '#6b8f5e', '#8b6bb0'][i], pants: '#3a3f47' });
    p.g.position.set(x, 0, z);
    sitPose(p, 0.48);
    p.g.rotation.y = yawOf(0, 1);
    sitters.push(p);
  });

  /* ---------- 경기 흐름 ---------- */
  const game = {
    poss: 0, carrier: 1, phase: 'dribble', timer: 2.5,
    t: 0, dur: 1, chip: 0.3, target: -1,
    from: new THREE.Vector3(), to: new THREE.Vector3(),
  };
  ball.position.set(players[1].x + 0.5, 0.11, players[1].z);

  function updateGame(dt, t) {
    const carrier = players[game.carrier];

    /* 이동 목표 */
    for (const p of players) {
      const s = dirOf(p.team);
      let tx, tz;
      if (p.gk) {
        tx = s * -14.3;                                   // 자기 골 라인 부근
        tz = clamp(ball.position.z, -1.8, 1.8);
      } else if (p === carrier && game.phase === 'dribble') {
        tx = clamp(ball.position.x + s * 3.2, -13.6, 13.6);   // 상대 골로 돌파
        tz = Math.sin(t * 0.9 + p.seed) * 4.5;                // 지그재그
      } else {
        const push = game.poss === p.team ? 4.5 : -1.5;
        const bx = ball.position.x * s;
        tx = clamp(s * (OFF[p.idx] + push + clamp(bx * 0.25, -3, 3)) + Math.sin(t * 0.6 + p.seed * 1.3) * 0.7, -13.6, 13.6);
        tz = clamp(LANE[p.idx] + clamp(ball.position.z * 0.3, -3, 3) + Math.cos(t * 0.7 + p.seed) * 0.8, -7.2, 7.2);
      }

      const dx = tx - p.x, dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      const maxSp = p.gk ? 4.2 : 5;
      const sp = Math.min(maxSp, d * 2.2);
      const wx = d > 0.01 ? (dx / d) * sp : 0;
      const wz = d > 0.01 ? (dz / d) * sp : 0;
      const k = Math.min(1, dt * 4);
      p.vx += (wx - p.vx) * k;
      p.vz += (wz - p.vz) * k;
      p.x = clamp(p.x + p.vx * dt, -14.5, 14.5);
      p.z = clamp(p.z + p.vz * dt, -8.4, 8.4);

      const speed = Math.hypot(p.vx, p.vz);
      const face = speed > 0.4 ? yawOf(p.vx, p.vz) : yawOf(ball.position.x - p.x, ball.position.z - p.z);
      let dy = face - p.g.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.g.rotation.y += dy * Math.min(1, dt * 8);
      walkPose(p, speed, dt);
      p.g.position.set(p.x, p.bob, p.z);
    }

    /* 공 상태 */
    if (game.phase === 'dribble') {
      const yaw = carrier.g.rotation.y;
      ball.position.set(carrier.x + Math.cos(yaw) * 0.5, 0.11, carrier.z - Math.sin(yaw) * 0.5);
      game.timer -= dt;
      if (game.timer <= 0) {
        const s = dirOf(carrier.team);
        const gd = Math.hypot(ball.position.x - s * HL, ball.position.z);
        if (gd < 9) {
          // 슛
          game.phase = 'shot'; game.t = 0;
          game.from.copy(ball.position);
          game.chip = 0.22;
          const kp = players.find((p) => p.gk && p.team !== carrier.team);
          if (Math.random() < 0.55) {
            game.to.set(s * 15.9, 0.11, (Math.random() - 0.5) * 1.8);          // 골
          } else if (Math.random() < 0.55) {
            game.to.set(kp.x, 0.11, clamp(kp.z + (Math.random() - 0.5) * 1.4, -2.6, 2.6));  // 골키퍼 선방
          } else {
            game.to.set(s * 15.9, 0.11, (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 2.4));  // 옆으로
          }
          game.dur = clamp(game.from.distanceTo(game.to) / 16, 0.25, 1.2);
        } else {
          // 패스
          const mates = players.filter((p) => p.team === carrier.team && !p.gk && p !== carrier);
          const m = mates[(Math.random() * mates.length) | 0];
          game.phase = 'pass'; game.t = 0;
          game.target = players.indexOf(m);
          game.from.copy(ball.position);
          game.to.set(m.x, 0.11, m.z);
          game.chip = 0.35;
          game.dur = clamp(game.from.distanceTo(game.to) / 10, 0.25, 1.1);
        }
      }
    } else if (game.phase === 'pass') {
      const m = players[game.target];
      game.to.set(m.x, 0.11, m.z);
      game.t += dt;
      const u = Math.min(1, game.t / game.dur);
      ball.position.lerpVectors(game.from, game.to, u);
      ball.position.y = 0.11 + Math.sin(u * Math.PI) * game.chip;
      if (u >= 1) {
        game.carrier = game.target;
        game.phase = 'dribble';
        game.timer = 1.2 + Math.random() * 1.8;
      }
    } else if (game.phase === 'shot') {
      game.t += dt;
      const u = Math.min(1, game.t / game.dur);
      ball.position.lerpVectors(game.from, game.to, u);
      ball.position.y = 0.11 + Math.sin(u * Math.PI) * game.chip;
      if (u >= 1) {
        // 공수 교대: 새 공격 팀의 골키퍼 또는 가장 가까운 선수가 잡는다
        game.poss = 1 - game.poss;
        let best = players[0], bd = Infinity;
        for (const p of players) {
          if (p.team !== game.poss) continue;
          const d = Math.hypot(p.x - ball.position.x, p.z - ball.position.z) - (p.gk ? 3.5 : 0);
          if (d < bd) { bd = d; best = p; }
        }
        game.carrier = players.indexOf(best);
        game.phase = 'dribble';
        game.timer = 1.5 + Math.random();
      }
    }
  }

  return {
    update(dt, t) {
      updateGame(dt, t);
      sitters.forEach((p, i) => {
        p.head.position.y = p.headY + Math.sin(t * 1.2 + i * 1.7) * 0.02;
      });
    },
  };
}
