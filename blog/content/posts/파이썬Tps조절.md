---
title: "파이썬Tps조절"
date: 2026-01-09T20:21:16+09:00
draft: false
toc : true
tocBorder : true
---

회사에서 파이썬을 여러가지 용도로 활용하고 있는데
대규모 부하테스트 전 실험적으로 돌려보는 용도로도 사용한다.
좀더 고도화해서 사용하고자 하는 과정을 기록한다.

## 1. 가장 기본 tps 조절

```py
def tps_test(tps):
    interval = 1.0 / tps

    for i in range(5000):
        _call_my_job(i)
        time.sleep(interval)
```

1초 기준으로 역산하여 sleep할 시간을 구한다. 
하지만 이렇게 만들면 drifting 
즉 함수호출이나 시스템 콜등이 누적되며 조금씩의 오차가 누적된다. 


## 2. Drift제거 버젼

제네레이터로 바꾼다. 기본개념은 기본 인터벌이 적용된 다음 '기대'시간과 현재 시간의 차이만큼
sleep하는 것.

대신 양수일때 sleep하고 음수라면 (이미 '기대'시간이 지난 상황) 즉각 호출한다.

```py
import time
import itertools

def tps_throttle(iterable, tps, total):
    interval = 1.0 / tps
    it = itertools.cycle(iterable)

    next_tick = time.perf_counter()

    for _ in range(total):
        now = time.perf_counter()
        sleep_time = next_tick - now

        if sleep_time > 0:
            time.sleep(sleep_time)

        yield next(it)

        next_tick += interval


# 제네레이터 사용
dat = range(1000)
for itm in (dat, tps=200, total=100000):
    _call_my_job(itm)

```

제네레이터를 사용한 for문은 tps가 조정되서 정확하게 호출된다. 
여기까지는 내가 작성하여 사용했던 버젼인데
이제 더 정확한 tps를 만들수 있나? 라는 궁금증이 생겼다.


## 3. 정밀도를 더 높인 버젼

일단 GPT에게 한번 물어보았다.

{{< chatlog >}}
**User**
굉장히 미세한 구간에서 약간 일찍 sleep을 끝내고 busy-waiting해도 되나?

**🤖 ChatGPT:**  
짧은 답부터 말하면 **“된다, 그리고 그게 정석이다”**야.
다만 **어디까지 허용하느냐**가 중요해.

---
## 결론 한 줄

> **아주 미세한 구간(수백 μs 이하)에서만 sleep을 일찍 깨고 busy-wait 하는 건
> 정확도를 올리는 올바른 방법이다.**

이건 “편법”이 아니라 **타이머 정확도 보정 기법**이야.

---

## 왜 이런 게 필요하냐면

### `time.sleep()`의 현실

* `sleep(0.002)` → **정확히 2ms 보장 ❌**
* 실제로는:

  * 2.1ms
  * 2.8ms
  * 가끔 4ms

즉, **sleep은 항상 늦게 깬다**
→ TPS에서는 이 “늦음”이 문제

---

## 그래서 쓰는 패턴이 이거야

### 개념

1. **멀리 있을 때** → sleep
2. **아주 가까워지면** → busy-wait

---

## 정석 구조 (500 TPS에 딱 맞음)

```python
import time
import itertools

def tps_throttle(iterable, tps, total):
    interval = 1.0 / tps
    it = itertools.cycle(iterable)

    SPIN_THRESHOLD = 0.0005  # 0.5ms
    next_tick = time.perf_counter()

    for _ in range(total):
        while True:
            now = time.perf_counter()
            remaining = next_tick - now

            if remaining <= 0:
                break

            if remaining > SPIN_THRESHOLD:
                time.sleep(remaining - SPIN_THRESHOLD)
            else:
                # 마지막 수백 μs만 spin
                pass

        yield next(it)
        next_tick += interval
```

## 어느 정도가 “안전한” spin 구간인가?

실무 기준 표로 줄게.

| 환경            | SPIN_THRESHOLD |
| ------------- | -------------- |
| macOS / Linux | 0.3 ~ 0.7 ms   |
| Windows       | 0.8 ~ 1.5 ms   |
| 서버 (전용 코어)    | 0.1 ~ 0.3 ms   |

👉 처음엔 **0.5ms**로 두고 측정하는 게 베스트

{{< /chatlog >}}


그래 너무 좋다. threshold가 워낙 작은 값이라 spin은 굉장히 짧게 돌게 된다.
굉장히 정확한 타이밍으로 tps가 쪼개져 호출될 것이다.

## 4. Adaptive TPS

문득 이런생각이 들었다. sync 방식 콜링하는 서비스를 측정하면 기대하는 tps를 높게 적어도
실질 tps가 굉장히 느릴텐데. 이런 경우 동적으로 tps가 줄어들어 적절한 tps로 변화하는 방법은 없을까 생각했다. 
물론 async 콜링같이 굉장히 빠른 케이스는 그대로 기대tps를 사용하도록 한다.

{{< chatlog >}}
**User**
대부분 tps_throttle을 쓰는 대상은 async로 시스템콜만 하는 거라서 빠른데, 간혹 내가 아닌 다른사람이 blocking 서비스를 호출할수도 있어 그러면 기대하는 tps보다 훨씬 낮은 실제 tps가 나올텐데 이런 경우를 대비해서 adaptive하게 조절 하는 방법이 있을까?

**🤖 ChatGPT:**  
이건 **“TPS 발생기 + 느린 소비자”가 섞일 때 반드시 생기는 문제**고,
해결책은 **타이밍 기법이 아니라 “제어(컨트롤)” 문제**야.

결론부터 말하면:

> **가능하다.**
> 다만 **“TPS를 보장”하는 게 아니라
> “시스템이 감당 가능한 TPS로 자동 수렴”** 하게 만드는 방식이다.


---
### ✅ 현실적인 목표

> “시스템이 막히면 TPS를 낮추되,
> 회복되면 다시 올리자”

이게 바로 **Adaptive Throttling**

### AIMD (Additive Increase / Multiplicative Decrease)

TCP 혼잡제어랑 같은 방식이야.

* 잘 돌아가면 → TPS **천천히 증가**
* 막히면 → TPS **확 줄임**

---

## 최소한의 Adaptive tps_throttle 구현

### 핵심 아이디어

* 목표 TPS는 `target_tps`
* 실제 TPS는 `current_tps`
* consumer가 느려지면 `current_tps ↓`

```py
...
    # --- latency 관측 ---
    if last_yield is not None:
        actual_interval = t - last_yield

        # 기대보다 느리면 과부하 판단
        if actual_interval > interval * 1.5:
            current_tps *= 0.7   # multiplicative decrease
        else:
            current_tps += 1     # additive increase

        current_tps = max(1, min(current_tps, target_tps))
        interval = 1 / current_tps

    last_yield = t
    next_tick += interval
```

**User**
회복을 계속 하나? tps를 조금씩 올리다가 1.5배 넘으면 갑자기 70% 감쇠되잖아 수렴하게 해야지

**🤖 ChatGPT:**  
맞아. **지금 구조 그대로면 “왔다 갔다(oscillation)” 할 수 있어.**
네가 정확히 짚은 포인트는 **제어 이론 문제**고, 해결 키워드는 딱 두 개야:

> **① 노이즈 제거(평활화)**
> **② 수렴 조건 명시**

아래를 순서대로 보면 “왜 흔들리고 → 어떻게 수렴시키는지”가 한 번에 보일 거야.

---

## 1️⃣ 왜 지금 로직은 흔들리나 (문제의 본질)

현재 로직 요약하면:

* 정상 → TPS +1
* 느림 감지 → TPS × 0.7

이건 전형적인 **거친 AIMD**야.

문제는:

* latency는 **항상 노이즈가 있음**
* 단발성 blocking에도 즉시 ×0.7
* 회복은 선형, 감쇠는 급격

결과:

```
올라감 → 한번 튐 → 급락 → 다시 올라감 → 또 튐 …
```

👉 **수렴점 근처에서 계속 진동**

---

## 2️⃣ 수렴을 만들려면 반드시 필요한 2가지

### ✅ (A) 관측값을 평활화해야 한다 (EWMA)

단일 샘플로 판단 ❌
**이동 평균**으로 판단 ✅

```python
ewma = α * sample + (1-α) * ewma
```

* α = 0.1 ~ 0.3 (보통)
* blocking “패턴”만 반응
* 스파이크 무시

---

## 3️⃣ 수렴형 Adaptive 제어의 정석 구조

개념적으로 이렇게 된다:

```
measured_interval (EWMA)
        ↓
error = measured - target
        ↓
작은 오차 → 유지
큰 오차 지속 → 감소
오차 거의 없음 지속 → 증가
```

이건 사실상 **1차 PI 컨트롤러의 단순형**이야.

---

## 4️⃣ 네 throttle에 맞는 “수렴형” 로직 (실전용)

### 핵심 정책

* 기준: `measured_interval / ideal_interval`
* EWMA로 판단
* dead-zone(무반응 구간) 존재
* 변화량 제한

---

### ⭐ 수렴형 adaptive + spin 최종 예제

```python
import time
import itertools

def adaptive_tps_throttle(
    iterable,
    target_tps,
    total,
    spin_threshold=0.0005,
):
    it = itertools.cycle(iterable)

    current_tps = target_tps
    interval = 1.0 / current_tps

    next_tick = time.perf_counter()
    last_yield = None

    # --- control parameters ---
    ewma_interval = None
    ALPHA = 0.2          # smoothing
    DEADZONE = 1.1       # ±10%는 무시
    DEC_RATE = 0.9       # 감소 시 10%
    INC_STEP = 1.0       # 증가 시 +1 tps

    for _ in range(total):
        # --- precise wait ---
        while True:
            now = time.perf_counter()
            remaining = next_tick - now
            if remaining <= 0:
                break
            if remaining > spin_threshold:
                time.sleep(remaining - spin_threshold)

        yield next(it)
        now = time.perf_counter()

        # --- measure ---
        if last_yield is not None:
            measured = now - last_yield
            if ewma_interval is None:
                ewma_interval = measured
            else:
                ewma_interval = (
                    ALPHA * measured + (1 - ALPHA) * ewma_interval
                )

            ratio = ewma_interval / interval

            # --- adaptive control (수렴 핵심) ---
            if ratio > DEADZONE:
                current_tps *= DEC_RATE
            elif ratio < 0.95:
                current_tps += INC_STEP

            current_tps = max(1, min(current_tps, target_tps))
            interval = 1.0 / current_tps

        last_yield = now
        next_tick += interval
```

{{< /chatlog >}}

이렇게 하면 기존에 async 콜링하는 경우 500tps에 육박해도 문제없이 정확한 타이밍에 call되고
간혹 느리고 편차가 큰 서비스를 콜링하여 실질tps가 가늠이 안잡힐때는 adaptive가 작동하며 
수렴될 것이다.


## 5. 생각

최근 ai들의 성능이 25년 하반기에 급격하게 좋아지며 대부분의 개발자 코딩능력을 넘어선 것 같다.
이제는 여러 ai들을 조합해서 멀티 에이전트로 돌린다고 한다. 
26년도 목표는 훨씬 친해지는 것이 목표
