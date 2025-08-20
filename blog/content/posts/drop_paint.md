---
title: "Drop_paint"
date: 2025-08-20T22:56:20+09:00
draft: false
toc : true
tocBorder : true
---

페인트와 같이 점성이 높은 액체 방울을 떨어뜨렸을때
형성되는 무늬모양을 시뮬레이션 하는 내용이 있다. 
[https://people.csail.mit.edu/jaffer/Marbling/Dropping-Paint](https://people.csail.mit.edu/jaffer/Marbling/Dropping-Paint)

먼저 떨어트린 방울이 원을 형성하다가 그 다음 방울에 의해 조금 밀려나며
모양이 조금씩 변해가며 생성되는 무늬를 수학적으로 풀어낸 것이다.

[만들어본 시뮬레이션 웹 페이지](https://doongchoong.github.io/toys/drop_paint.html)

## 1. 공식

$$
C + (P - C) \cdot sqrt \left( 1 + \frac{r^2}{ \|\| P - C \|\|^2 } \right)
$$

원래 있던 방울 P 가 새로운 C 방울이 떨어졌을때 대한 내용이다. 
이 방울은 중심을 가지고 있고 방울을 표현하는 벡터들의 집합이다. 
코딩으로는 외곽선을 형성하는 벡터들의 집합이고 이들 각각에 대해서 계산하는 것이다. 
원의 정밀도에 따라 100step으로 쪼개서 외곽선을 형성한다면 방울 하나에 100개의 벡터가 존재한다.


```javascript
  // 무늬 만들기
  marble(newone){
    // 공식: C + (P - C) * sqrt(1 + r^2 / ||(P - C)||^2 )
    for(let v of this.vertices){
      let c = newone.center;
      let r = newone.r;
      let p = { // 벡터 빼기
        x: v.x - c.x,
        y: v.y - c.y,
      };
      let mag_square = p.x * p.x + p.y * p.y;
      let sqrt = Math.sqrt(1 + r*r / mag_square);
      p.x = p.x * sqrt + c.x;
      p.y = p.y * sqrt + c.y;

      // assign p in v
      v.x = p.x;
      v.y = p.y;
    }
  }
```

* `||P - C||`는 Magnitude로 P와 C간 거리를 나타낸다. $\sqrt{(p_x-c_x)^2 + (p_y-c_y)^2}$ 
* 위를 어차피 제곱을 하게 되므로 굳이 sqrt한뒤 다시 제곱할 필요가 없다. 
* 새로운 방울을 입력받아서 현재 방울의 벡터들에 대해 공식을 통해 위치를 재조정하는 것


## 2. 시뮬레이션

{{< raw >}}


<canvas id="ca" width="400" height="300"></canvas>
<div id="info">
  <div id="buttons">
    <button id="resetBtn">🔄 Reset</button>
    <button id="stopBtn">⏸️ Stop</button>
  </div>
  <div id="status">
    Drop 색상: <span id="colorText"></span>
    <span id="colorBox">|_|</span> |
    개수: <span id="count">0</span>
  </div>
</div>

<script>
const canvas=document.getElementById('ca');
const ctx=canvas.getContext('2d');

// 컨트롤들
const colorText = document.getElementById("colorText");
const colorBox = document.getElementById("colorBox");
const countSpan = document.getElementById("count");
const resetBtn = document.getElementById("resetBtn");
const stopBtn = document.getElementById("stopBtn");

const palette = [
      "#FF6B6B", // 레드톤
      "#FFD93D", // 옐로우톤
      "#6BCB77", // 그린톤
      "#4D96FF", // 블루톤
      "#9D4EDD"  // 퍼플톤
];

function random_int(max){
  return Math.floor(Math.random() * max);
}

function randomColor() {
  return palette[random_int(palette.length)];
}

const circleSegments = 100;

class Paint {
  constructor(x, y, r, color){
    this.center = {x: x, y: y};
    this.r = r; 

    // 원을 구성하는 점들을 생성함.
    this.vertices = [];
    for(let i =0; i < circleSegments; i++){
      let angle = i * (Math.PI * 2 / circleSegments );
      let v = {
        x: Math.cos(angle) * this.r + this.center.x,
        y: Math.sin(angle) * this.r + this.center.y,
      };
      this.vertices.push(v);
    }
    this.color = color;
  }

  // 무늬 만들기
  marble(newone){
    // 공식: C + (P - C) * sqrt(1 + r^2 / ||(P - C)||^2 )
    for(let v of this.vertices){
      let c = newone.center;
      let r = newone.r;
      let p = { // 벡터 빼기
        x: v.x - c.x,
        y: v.y - c.y,
      };
      let mag_square = p.x * p.x + p.y * p.y;
      let sqrt = Math.sqrt(1 + r*r / mag_square);
      p.x = p.x * sqrt + c.x;
      p.y = p.y * sqrt + c.y;

      // assign p in v
      v.x = p.x;
      v.y = p.y;
    }
  }

  // context에 draw 
  draw(ctx){
    ctx.beginPath();
    for(let [i, p] of this.vertices.entries()){
      if(i == 0){
        ctx.moveTo(p.x, p.y);
      }else{
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

class Drop {
  constructor(canvas, max = 200){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drops = [];
    this.max = max;
  }

  drop_paint(color){
    // 초과하면 아무것도 하지 않음
    if( this.drops.length >= this.max ){
      return ;
    }

    let x = random_int(this.canvas.width);
    let y = random_int(this.canvas.height);
    let r = random_int(30) + 7;

    let newone = new Paint(x, y, r, color);

    for(let oldone of this.drops){
      oldone.marble(newone);
    }
    this.drops.push(newone);
  }

  draw(){
    // 초과하면 아무것도 하지 않음
    if( this.drops.length >= this.max ){
      return ;
    }
    // 모든 drop을 그림
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for(let drop of this.drops){
      drop.draw(this.ctx);
    }    
  }

  clear(){
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drops = [];
  }

  is_max(){
    return (this.max <= this.drops.length);
  }
}


let drop = new Drop(canvas);

let count = 0;
let lastTime = 0;
let pause = false;

function loop(timestamp) {
  if (timestamp - lastTime >= 200) { // 1000ms = 1초
    if(pause){
      //pass
    }else{
      let color = randomColor();
      drop.drop_paint(color);
      drop.draw();
      count = drop.drops.length;

      // update UI
      if( drop.is_max() == false) {
        countSpan.textContent = count;
        colorText.textContent = color;
        colorBox.style.backgroundColor = color;  
      }else{
        pause = true;
        stopBtn.textContent = '▶️ Play';
      }
    }
    // update time
    lastTime = timestamp;
  }

  requestAnimationFrame(loop);
}

function resetCanvas() {
  drop.clear();
}

function stopDrawing() {
  if(pause){
    pause = false;
    stopBtn.textContent = '⏸️ Stop';
  }else{
    pause = true;
    stopBtn.textContent = '▶️ Play';
  }

}

resetBtn.addEventListener("click", resetCanvas);
stopBtn.addEventListener("click", stopDrawing);

// start
requestAnimationFrame(loop);

</script>


{{< /raw >}}

-------

어느 정도 방울들이 화면을 채웠을때  떨어지는 방울에 의해 변화하는 양상이 
상당히 진짜 같은 느낌을 준다.

## 3. 그 외

* Tine이란 것이 있다. 저 페인트방울 위로 stroke를 했을때 생성되는 모양을 얘기한다.
* Vortex 도 있다. 전체적으로 자체 회전이 걸릴때 소용돌이 모양처럼 형성되는 내용이다.

