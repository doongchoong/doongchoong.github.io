---
title: "Poisson Disk Sampling"
date: 2026-09-05T21:08:40+09:00
draft: false
toc : true
tocBorder : true
---
[AI-written (GPT-6-Astra)]
Canvas로 움직이는 모습을 보여주면서 기술적으로도 살펴볼 만한 주제를 찾다가 Poisson Disk Sampling을 추천받았다.
처음 듣는 이름인데 랜덤으로 점을 뿌리면서도 점 사이의 간격은 유지하는 방식이라고 한다.

그냥 랜덤으로 뿌리는 것과 어떻게 다른지부터 보고, 이 점들을 이용해서 그림도 표현해본다.

## 1. 랜덤 배치

화면에 점을 랜덤으로 뿌리는 것은 간단하다. 가로와 세로 좌표를 각각 난수로 정하면 된다.

```javascript
const x = Math.random() * width;
const y = Math.random() * height;
```

이때 어디에나 같은 확률로 놓인다는 것과, 서로 비슷한 간격으로 놓인다는 것은 다른 얘기다.
옆에 이미 점이 있어도 새 점이 놓일 확률은 똑같다. 그래서 몇 개씩 뭉친 곳도 있고 휑한 곳도 생긴다.
[Mike Bostock의 시각화 글](https://bost.ocks.org/mike/algorithms/#sampling)에서도 이런 배치의 차이를 그림으로 비교하고 있다.

Poisson Disk Sampling은 여기에 **이미 놓인 점과 최소 r만큼 떨어져 있어야 한다**는 조건이 붙는다.
아래는 두 방식을 같은 개수로 비교한 것이다. `시작`을 누르면 점이 늘어나고, `다시 배치`를 누르면 다른 난수로 시작한다.

{{< raw >}}
<div id="pds-compare" class="pds-demo">
  <div class="pds-controls">
    <label>최소 간격 r <input data-role="radius" type="range" min="12" max="40" value="22"> <output data-role="radius-value">22</output></label>
    <button type="button" data-role="play">시작</button>
    <button type="button" data-role="step">한 단계</button>
    <button type="button" data-role="reset">다시 배치</button>
    <label><input type="checkbox" data-role="grid"> 격자</label>
    <label><input type="checkbox" data-role="disks"> r/2 원</label>
  </div>
  <div class="pds-panels">
    <figure><figcaption>일반 난수</figcaption><canvas data-role="random" width="960" height="640" role="img" aria-label="독립적인 난수로 배치한 점">일반 난수 점 배치</canvas></figure>
    <figure><figcaption>Poisson Disk</figcaption><canvas data-role="poisson" width="960" height="640" role="img" aria-label="최소 간격을 유지하며 배치한 점">최소 간격을 유지하는 점 배치</canvas></figure>
  </div>
  <p class="pds-note">파란 점: 배치한 점 · 주황 점: 후보를 만들 수 있는 점<br>오른쪽 테두리 원: 마지막 후보 · 초록: 채택 · 빨강: 탈락</p>
  <p class="pds-status" data-role="status" role="status" aria-live="polite"></p>
</div>
<style>
.pds-demo{margin:1.5rem 0;padding:16px;border:1px solid #b8c5c7;border-radius:10px;background:#f5f8f7;color:#20373d;font:14px/1.6 system-ui,sans-serif;color-scheme:light}
.pds-demo .pds-controls{display:flex;gap:10px 14px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.pds-demo label{display:inline-flex;gap:7px;align-items:center;flex-wrap:wrap}
.pds-demo input[type=range]{width:110px;accent-color:#147d80}
.pds-demo button{font:inherit;border:1px solid #738d92;border-radius:5px;padding:5px 12px;background:#fff;color:#20373d;cursor:pointer}
.pds-demo button:disabled{opacity:.5;cursor:default}
.pds-demo :focus-visible{outline:3px solid #db7b29;outline-offset:3px}
.pds-demo .pds-panels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.pds-demo figure{margin:0;min-width:0}.pds-demo figcaption{font-weight:650;margin-bottom:6px}
.pds-demo canvas{display:block;width:100%;height:auto;background:#fff;border:1px solid #d1dcdd;box-sizing:border-box}
.pds-demo .pds-note{font-size:12px;color:#496169;margin:10px 0 4px}
.pds-demo .pds-status{font-variant-numeric:tabular-nums;margin:5px 0 0;min-height:1.6em}
.pds-demo input[type=file]{max-width:100%;font:inherit}
@media(max-width:600px){.pds-demo .pds-panels{grid-template-columns:1fr}.pds-demo{padding:10px}}
</style>
<script>
(() => {
  function randomSeed(seed) {
    return () => {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  class Sampler {
    constructor(width, height, r, seed = 42) {
      this.width = width; this.height = height; this.r = r;
      this.cell = r / Math.sqrt(2);
      this.cols = Math.ceil(width / this.cell);
      this.rows = Math.ceil(height / this.cell);
      this.grid = new Int32Array(this.cols * this.rows).fill(-1);
      this.points = []; this.active = []; this.random = randomSeed(seed);
      this.checks = 0; this.rounds = 0; this.last = null;
      this.add(this.random() * width, this.random() * height);
    }
    add(x, y) {
      const index = this.points.length;
      this.points.push({x, y, active: true});
      this.active.push(index);
      this.grid[Math.floor(x / this.cell) + Math.floor(y / this.cell) * this.cols] = index;
    }
    valid(x, y) {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
      const gx = Math.floor(x / this.cell), gy = Math.floor(y / this.cell);
      if (this.grid[gx + gy * this.cols] !== -1) return false;
      for (let row = Math.max(0, gy - 2); row <= Math.min(this.rows - 1, gy + 2); row++) {
        for (let col = Math.max(0, gx - 2); col <= Math.min(this.cols - 1, gx + 2); col++) {
          const index = this.grid[col + row * this.cols];
          if (index === -1) continue;
          const p = this.points[index];
          this.checks++;
          if ((x - p.x) ** 2 + (y - p.y) ** 2 < this.r ** 2) return false;
        }
      }
      return true;
    }
    step() {
      if (!this.active.length) return false;
      this.rounds++;
      const slot = Math.floor(this.random() * this.active.length);
      const base = this.points[this.active[slot]];
      this.last = {base, candidates: []};
      for (let attempt = 0; attempt < 30; attempt++) {
        const angle = this.random() * Math.PI * 2;
        const distance = this.r * Math.sqrt(1 + 3 * this.random());
        const x = base.x + Math.cos(angle) * distance;
        const y = base.y + Math.sin(angle) * distance;
        const accepted = this.valid(x, y);
        this.last.candidates.push({x, y, accepted});
        if (accepted) { this.add(x, y); return true; }
      }
      base.active = false;
      this.active[slot] = this.active[this.active.length - 1];
      this.active.pop();
      return true;
    }
  }
  window.PoissonDiskArticle20260905 = {Sampler, randomSeed};
})();

(() => {
  const root = document.getElementById('pds-compare');
  const get = name => root.querySelector(`[data-role="${name}"]`);
  const {Sampler, randomSeed} = window.PoissonDiskArticle20260905;
  const W = 480, H = 320;
  const left = get('random').getContext('2d'), right = get('poisson').getContext('2d');
  let sampler, uniform, random, seed = 41, running = false, frame = 0, lastStatus = 0;
  function dot(ctx, x, y, r, color, stroke = false) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (stroke) { ctx.strokeStyle = color; ctx.stroke(); }
    else { ctx.fillStyle = color; ctx.fill(); }
  }
  function paint(ctx, points, details) {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, W, H); ctx.lineWidth = .7;
    if (details && get('grid').checked) {
      ctx.strokeStyle = '#dce6e6'; ctx.beginPath();
      for (let x = 0; x < W; x += sampler.cell) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y < H; y += sampler.cell) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
    if (get('disks').checked) for (const p of points) dot(ctx, p.x, p.y, sampler.r / 2, '#639aab66', true);
    for (const p of points) dot(ctx, p.x, p.y, 2.5, details && p.active ? '#ae5916' : '#1a7389');
    if (details && sampler.last) {
      const {base, candidates} = sampler.last;
      ctx.setLineDash([4, 3]);
      dot(ctx, base.x, base.y, sampler.r, '#617d83', true);
      dot(ctx, base.x, base.y, 2 * sampler.r, '#617d83', true);
      ctx.setLineDash([]);
      dot(ctx, base.x, base.y, 5, '#344a52', true);
      for (const p of candidates) dot(ctx, p.x, p.y, 3.5, p.accepted ? '#19834d' : '#bd5252', true);
    }
  }
  function draw(force = false) {
    while (uniform.length < sampler.points.length) uniform.push({x: random() * W, y: random() * H});
    paint(left, uniform, false); paint(right, sampler.points, true);
    if (force || performance.now() - lastStatus > 800) {
      get('status').textContent = `양쪽 ${sampler.points.length}개 · 활성 점 ${sampler.active.length}개 · ${sampler.active.length ? (running ? '생성 중' : '대기') : '완료'}`;
      lastStatus = performance.now();
    }
    get('step').disabled = running || !sampler.active.length;
    get('play').disabled = !sampler.active.length;
  }
  function stop() { running = false; cancelAnimationFrame(frame); get('play').textContent = '시작'; }
  function tick() {
    if (!running) return;
    for (let i = 0; i < 18 && sampler.active.length; i++) sampler.step();
    if (!sampler.active.length) stop();
    draw(!running);
    if (running) frame = requestAnimationFrame(tick);
  }
  function reset() {
    stop(); sampler = new Sampler(W, H, +get('radius').value, ++seed);
    uniform = []; random = randomSeed(seed ^ 0xABCDEF);
    get('radius-value').value = sampler.r; draw(true);
  }
  get('play').onclick = () => {
    if (running) { stop(); draw(true); }
    else { running = true; get('play').textContent = '일시정지'; draw(true); frame = requestAnimationFrame(tick); }
  };
  get('step').onclick = () => { sampler.step(); draw(true); };
  get('reset').onclick = reset;
  get('radius').oninput = reset;
  get('grid').onchange = () => draw(true);
  get('disks').onchange = () => draw(true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); draw(true); } });
  reset();
})();
</script>
{{< /raw >}}

일반 난수는 화면 여기저기에 바로 생기는 반면 오른쪽은 먼저 놓인 점 주변에서부터 퍼진다.
오른쪽 주황색 점은 아직 주변에 새 점을 만들어볼 수 있는 점이다. 할 일이 끝난 점은 파란색으로 바뀐다.

`r/2 원`을 켜면 차이가 더 잘 보인다. 각 점을 중심으로 반지름이 r/2인 원을 그린 것이다.
중심끼리 r 이상 떨어져 있으면 이 원들의 내부는 겹치지 않는다. 왼쪽에는 그런 제한이 없다.

다만 오른쪽도 바둑판처럼 간격이 전부 같지는 않다. 너무 가까운 것만 막았기 때문이다.

## 2. Bridson 알고리즘

랜덤으로 좌표를 하나 만들고 기존 점과 너무 가까우면 버려도 위 조건은 지킬 수 있다.
하지만 화면이 차오를수록 버리는 일이 많아진다. 새 점 하나 놓으려고 계속 허공에 던지는 셈이다.

여기서는 Robert Bridson의 [Fast Poisson Disk Sampling in Arbitrary Dimensions](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf) 방식을 사용한다.
논문은 한 페이지이고, 핵심은 기존 점의 주변에서 후보를 만들고 가까운 점만 검사하는 것이다.

### 2.1. 활성 목록

이미 배치된 점 전체와, 아직 주변에 후보를 만들어볼 점의 목록을 따로 둔다. 후자가 `active` 목록이다.

1. 처음 점 하나를 랜덤으로 놓고 active에 넣는다.
2. active에서 기준점 하나를 랜덤으로 고른다.
3. 기준점에서 r~2r 거리인 고리 안에 후보를 만든다.
4. 화면 안에 있고 다른 점들과 r 이상 떨어졌다면 새 점으로 추가한다. 새 점도 active에 들어간다.
5. 최대 30번 시도해도 후보를 채택하지 못하면 기준점을 active에서 뺀다.

새 점을 하나 채택하면 이번 단계는 끝난다. 다음 단계에서는 active에서 기준점을 다시 고른다.
기존 기준점도 목록에 남아 있으므로 나중에 다시 선택될 수 있다.

**active에서 뺀다고 그림에서 지우는 것은 아니다.** 그 점을 기준으로 후보 만드는 일만 끝내는 것이다.
목록이 비면 전체 과정이 끝난다.

위 애니메이션을 멈추고 `한 단계`를 누르면 이 과정을 볼 수 있다.
선택된 기준점 주변의 점선은 r과 2r이고, 테두리만 있는 작은 원은 이번에 검사한 후보들이다.
후보가 화면 밖으로 나간 경우에는 Canvas 영역에서 잘려 보이지 않을 수 있다.

### 2.2. 후보 좌표

각도는 한 바퀴 안에서 랜덤으로 고르면 된다. 거리는 조금 생각할 부분이 있다.

```javascript
const angle = random() * Math.PI * 2;
const distance = r * Math.sqrt(1 + 3 * random());

const x = base.x + Math.cos(angle) * distance;
const y = base.y + Math.sin(angle) * distance;
```

거리를 그냥 `r + random() * r`로 하면 안 될까?
최소 거리 검사는 그대로 동작한다. 다만 고리의 면적에 대해 고르게 뽑는 방식은 아니게 된다.
바깥쪽은 둘레가 길어서 같은 두께라도 면적이 더 넓다. 반지름만 균등하게 뽑으면 안쪽에 상대적으로 몰린다.

반지름 r에서 d까지의 고리 면적은 `π(d² - r²)`이다.
전체 고리 면적 `π((2r)² - r²)`에서 차지하는 비율을 난수 u로 놓고 풀면 된다.

```txt
u = (d² - r²) / (4r² - r²)
d² = r² + 3r²u
d = r × √(1 + 3u)
```

위 코드의 제곱근은 이 때문에 들어간다. 여기서는 2차원 면적을 기준으로 계산한 것이다.

### 2.3. 격자

후보를 만들 때마다 모든 점과 거리를 비교하면 점이 늘수록 할 일이 많아진다.
그런데 멀리 있는 점은 애초에 검사할 필요가 없다.

화면을 작은 정사각형으로 나누고 각 칸에 점의 인덱스를 저장한다.
Bridson 논문의 격자 크기는 2차원에서 `r / √2`다.

```txt
한 변       = r / √2
대각선 길이 = √((r / √2)² + (r / √2)²) = r
```

한 칸의 대각선 길이가 최소 간격과 같다.
좌표를 `floor(x / cellSize)`로 배정하면 각 칸은 한쪽 경계를 포함하지 않는 구간이므로, 같은 칸 안의 두 점은 r만큼 떨어질 수 없다.
따라서 한 칸에는 점 하나만 저장하면 된다.

후보가 들어갈 칸을 찾고, 이 칸을 중심으로 가로세로 두 칸씩 더 본다. 총 5×5 영역이다.
바로 옆 칸만 보는 3×3으로는 부족하다. 칸 크기가 r보다 작아서 두 칸 떨어진 칸에도 가까운 점이 있을 수 있다.

실제 거리 판정은 제곱근 없이 비교한다.

```javascript
const dx = candidate.x - point.x;
const dy = candidate.y - point.y;

if (dx * dx + dy * dy < r * r) {
  return false;
}
```

위 비교 화면에서 `격자`를 켜면 점과 칸의 관계가 보인다.
격자가 있다고 점을 칸의 중심에 맞추는 것은 아니다. 좌표는 그대로 두고, 찾기 편하도록 어디에 들어 있는지만 기록한다.

### 2.4. 종료

단계 하나는 새 점을 추가하거나 기존 점 하나를 비활성으로 바꾼다.
최종 점이 N개라면 첫 점 이후 추가는 N-1번, 비활성 전환은 N번이므로 총 2N-1단계다.
후보 수와 차원을 고정하면 단계당 검사량이 제한되어 점 생성 과정은 O(N)이 된다. 이는 [논문의 분석](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf)과 같다.

물론 격자 배열을 처음 만드는 비용과 화면을 매번 다시 그리는 비용은 별도로 있다.
애니메이션의 프레임 속도를 그대로 알고리즘 성능으로 보면 안 된다.

그리고 30번 실패했다는 것은 그 주변에 놓을 자리가 절대로 없다는 증명은 아니다.
이 구현은 정해진 횟수만 시도하고 넘어간다. 최소 간격은 지키지만 화면에 가능한 한 많은 점을 꽉 채웠다고 보장하지는 않는다.

## 3. 점묘화

점 배치가 만들어졌으니 다른 데에도 써먹을 수 있다.
이미지에서 점이 놓인 좌표의 밝기를 읽고, 어두운 곳에는 큰 점을, 밝은 곳에는 작은 점을 그리면 된다.

아래 기본 그림은 Canvas로 만든 구다. `그리기`를 누르면 점들이 생기면서 명암이 드러난다.
직접 이미지 파일을 선택해도 되고, 완성되면 PNG로 저장할 수 있다. 원본은 비율을 유지하여 영역 안에 맞춘다.

{{< raw >}}
<div id="pds-stipple" class="pds-demo">
  <div class="pds-controls">
    <label>점 간격 <input data-role="radius" type="range" min="4" max="14" value="7"> <output data-role="radius-value">7</output></label>
    <button type="button" data-role="render">그리기</button>
    <button type="button" data-role="pause" disabled>일시정지</button>
    <button type="button" data-role="default">기본 그림</button>
    <button type="button" data-role="save" disabled>PNG 저장</button>
    <label>이미지 선택 <input data-role="file" type="file" accept="image/*"></label>
  </div>
  <div class="pds-panels">
    <figure><figcaption>원본</figcaption><canvas data-role="source" width="480" height="320" role="img" aria-label="점묘화에 사용할 원본 이미지">원본 이미지</canvas></figure>
    <figure><figcaption>점묘화</figcaption><canvas data-role="result" width="960" height="640" role="img" aria-label="Poisson Disk 배치에 명암을 적용한 점묘화">명암에 따라 점 크기를 바꾼 그림</canvas></figure>
  </div>
  <p class="pds-note">이미지는 브라우저 안에서 처리한다. 점 간격을 줄이면 더 많은 점으로 그린다.</p>
  <p class="pds-status" data-role="status" role="status" aria-live="polite">그리기를 누르면 시작한다.</p>
</div>
<script>
(() => {
  // 위 비교 예제의 Sampler와 pds-demo 스타일을 재사용한다.
  const {Sampler} = window.PoissonDiskArticle20260905;
  const root = document.getElementById('pds-stipple');
  const get = name => root.querySelector(`[data-role="${name}"]`);
  const W = 480, H = 320, source = get('source'), result = get('result');
  const src = source.getContext('2d', {willReadFrequently: true}), ctx = result.getContext('2d');
  let sampler = null, pixels, painted = 0, frame = 0, running = false, loadID = 0;
  function clearResult() {
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  }
  function stop() { cancelAnimationFrame(frame); running = false; }
  function invalidate() {
    stop(); sampler = null; clearResult();
    get('pause').disabled = true; get('pause').textContent = '일시정지'; get('save').disabled = true;
    get('status').textContent = '그리기를 누르면 시작한다.';
  }
  function defaultImage() {
    const data = src.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x - 240) / 118, ny = (y - 155) / 118;
      const rr = nx * nx + ny * ny;
      let value = 245;
      if (rr <= 1) {
        const nz = Math.sqrt(1 - rr);
        const light = Math.max(0, -.45 * nx - .55 * ny + .704 * nz);
        value = Math.round(20 + 215 * light);
      }
      const i = (x + y * W) * 4;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
      data.data[i + 3] = 255;
    }
    src.putImageData(data, 0, 0); invalidate();
  }
  function paintNew() {
    ctx.fillStyle = '#152124';
    for (; painted < sampler.points.length; painted++) {
      const p = sampler.points[painted];
      const index = (Math.floor(p.x) + Math.floor(p.y) * W) * 4;
      const L = (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255;
      const radius = sampler.r * .48 * Math.sqrt(Math.max(0, 1 - L));
      if (radius <= .05) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
    }
  }
  function tick() {
    if (!running) return;
    for (let i = 0; i < 100 && sampler.active.length; i++) sampler.step();
    paintNew();
    if (sampler.active.length) frame = requestAnimationFrame(tick);
    else {
      stop(); get('pause').disabled = true; get('save').disabled = false;
      get('status').textContent = `완료 · ${sampler.points.length}개 위치에 명암 적용`;
    }
  }
  function render() {
    stop(); clearResult(); painted = 0;
    sampler = new Sampler(W, H, +get('radius').value, 20260905);
    pixels = src.getImageData(0, 0, W, H).data;
    get('save').disabled = true; get('pause').disabled = false; get('pause').textContent = '일시정지';
    get('status').textContent = '점을 배치하며 그리는 중'; running = true; frame = requestAnimationFrame(tick);
  }
  get('render').onclick = render;
  get('pause').onclick = () => {
    if (running) { stop(); get('pause').textContent = '계속'; get('status').textContent = '일시정지'; }
    else if (sampler && sampler.active.length) {
      running = true; get('pause').textContent = '일시정지'; get('status').textContent = '점을 배치하며 그리는 중'; frame = requestAnimationFrame(tick);
    }
  };
  get('radius').oninput = () => { get('radius-value').value = get('radius').value; invalidate(); };
  get('default').onclick = () => { loadID++; get('file').value = ''; defaultImage(); };
  get('file').onchange = async () => {
    const file = get('file').files[0];
    if (!file) return;
    const id = ++loadID; invalidate();
    get('status').textContent = '이미지를 읽는 중';
    const url = URL.createObjectURL(file), img = new Image();
    try {
      img.src = url; await img.decode();
      if (id !== loadID) return;
      const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      src.fillStyle = '#fff'; src.fillRect(0, 0, W, H);
      src.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      invalidate();
    } catch (error) {
      if (id === loadID) get('status').textContent = '이미지를 읽지 못했다. 다른 이미지 파일을 선택해 주세요.';
    } finally { URL.revokeObjectURL(url); }
  };
  get('save').onclick = () => {
    result.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'poisson-stipple.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) { stop(); get('pause').textContent = '계속'; get('status').textContent = '일시정지'; }
  });
  defaultImage();
})();
</script>
{{< /raw >}}

### 3.1. 점 크기

이번에는 점의 위치를 정하는 최소 간격은 고정한다. 이미지에 따라 바뀌는 것은 그 위치에 그리는 원의 크기다.

```javascript
// R, G, B는 이미지에서 읽은 0~255 값이다.
const brightness = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
const darkness = 1 - brightness;
const radius = minimumDistance * 0.48 * Math.sqrt(darkness);
```

원의 넓이는 반지름의 제곱에 비례한다.
어두운 정도에 비례해서 검은 면적을 늘리려면 반지름에는 제곱근을 적용하는 것이 자연스럽다.
최대 반지름은 최소 간격의 절반보다 조금 작게 잡았다. 그래서 가장 큰 점끼리도 겹치지 않는다.

위 밝기 계산은 이미지의 RGB 값을 가중합한 간단한 근사다. 원본의 명암을 정확히 복원하는 처리는 아니다.
완전히 어두운 곳에도 점 사이로 흰 틈이 남고, 아주 작은 무늬는 점이 그 위치에 놓이지 않으면 사라질 수 있다.

`점 간격`을 줄여 다시 그리면 위치를 더 촘촘하게 읽는다.
화면에 표시되는 개수는 배치한 위치의 수다. 흰 부분은 원의 크기가 0에 가까워서 실제로 눈에 보이는 점의 수와는 다를 수 있다.

### 3.2. 간격과 크기

멀리서 보면 어두운 쪽에 점이 더 빽빽하게 놓인 것처럼 보인다.
하지만 같은 seed와 간격으로 그리면 이미지가 바뀌어도 점의 좌표는 같다. 원만 커진 것이다.

정말로 어두운 곳에 점을 더 많이 놓으려면 최소 간격 자체를 위치에 따라 바꿔야 한다.
그때는 거리 검사도 다시 생각해야 한다.
작은 간격을 원하는 점과 큰 간격을 원하는 점이 이웃하면 어느 쪽 기준을 따라야 할까?

예를 들어 두 점이 요구하는 간격 중 큰 값을 기준으로 삼을 수 있다.
다만 그렇게 바꾸면 지금의 고정된 5×5 탐색을 그대로 가져갈 수는 없다. 칸 크기와 필요한 탐색 범위를 함께 정해야 한다.
이쪽은 점 크기만 바꾸는 것보다 한 단계 더 들어가는 주제다.

## 4. 생각

여기서는 점의 위치를 만든 뒤 그림을 얹었다.
같은 위치에 나무나 바위를 놓으면 간격을 유지하는 배치로도 쓸 수 있을 것이다.
다만 물체 크기가 제각각이면 점의 최소 거리만으로 겹침이 해결되지는 않는다.

점묘화도 원의 크기를 고정하고 간격만으로 명암을 표현하면 지금과는 다른 느낌이 날 것 같다.
검은 점 하나하나는 같은데 모인 정도로 그림이 보이는 것이다.
그쪽까지 가려면 먼저 서로 다른 간격을 어떻게 다룰지 정해야겠다.
