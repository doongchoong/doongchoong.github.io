---
title: "블로그에GPT대화넣기"
date: 2025-07-26T00:36:49+09:00
draft: true
toc : true
tocBorder : true
---

# 블로그에GPT대화넣기

블로그를 정비하면서 문득 GPT와 대화한 내용을 저장하고 싶다는 생각이 들었다. 
그래서 적용하는 과정을 GPT와 대화하면서 시행착오 끝에 적용하는 과정을 
기록한다.

## 1. 물어보기

{{< chatlog >}}
**User**
내가 hugo 블로그를 쓰고 있는데 너와의 대화를 블로그에 남기고 싶어

**🤖 ChatGPT:**  
좋아, Hugo 블로그에 너와 나의 대화를 남기려면 몇 가지 방식이 있어. 예쁘게 포맷팅된 대화 형태로 남기고 싶다면 **마크다운(Markdown)** 과 함께 **CSS** 또는 **Hugo의 shortcode**를 활용하는 게 좋아.

---

### ✅ 1. 대화 내용 마크다운 예시

````markdown
## 🤖 ChatGPT와의 대화 기록

**🙋 사용자:** Hugo 블로그를 쓰고 있는데 너와의 대화를 블로그에 남기고 싶어  
**🤖 ChatGPT:** 좋아, Hugo 블로그에 너와 나의 대화를 남기려면 몇 가지 방식이 있어. 예쁘게 포맷팅된 대화 형태로 남기고 싶다면 **마크다운(Markdown)** 과 함께 **CSS** 또는 **Hugo의 shortcode**를 활용하는 게 좋아.
````

---

### ✅ 2. 말풍선 형태로 꾸미기

```html
<style>
.chat {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.user-msg, .bot-msg {
  max-width: 80%;
  padding: 0.7em 1em;
  border-radius: 1em;
}
.user-msg {
  align-self: flex-end;
  background: #d0f0fd;
}
.bot-msg {
  align-self: flex-start;
  background: #f0f0f0;
}
</style>

<div class="chat">
  <div class="user-msg">Hugo 블로그를 쓰고 있는데 너와의 대화를 블로그에 남기고 싶어</div>
  <div class="bot-msg">좋아, Hugo 블로그에 너와 나의 대화를 남기려면...</div>
</div>
```

> 💡 Goldmark에서 HTML을 허용하려면 `config.toml`에 다음을 추가해야 해:

```toml
[markup]
  [markup.goldmark]
    [markup.goldmark.renderer]
      unsafe = true
```
{{< /chatlog >}}

대략 보기좋게 잘 꾸미고자 한다면 마크다운 형태로 저장하고
이를 css를 통해 꾸미는데 이를 hugo의 숏코드를 사용하자는 얘기인 듯 하다.

### 1.1. 숏코드

{{< chatlog >}}
**User**
hugo 블로그에 너와의 대화내용을 적용할때 shortcode를 어떻게 작성해야 할까

**🤖 ChatGPT:**  
좋은 질문이야! Hugo 블로그에 GPT 대화를 더 깔끔하게, 반복적으로 적용하려면 **Shortcode**를 사용하는 게 아주 좋아. 사용자 메시지와 GPT 메시지를 각각 `user.html`과 `gpt.html` 같은 Shortcode로 만들어두면, 마치 블로그 포스트에 마크업처럼 쉽게 쓸 수 있어.

---

## ✅ 1. Shortcode 파일 만들기

Hugo 프로젝트에서 다음 위치에 파일을 만들어:

```
layouts/shortcodes/user.html
layouts/shortcodes/gpt.html
```

### `user.html`
```html
<div class="chat user">
  <strong>🙋 사용자:</strong> {{ .Inner | markdownify }}
</div>
```

### `gpt.html`
```html
<div class="chat gpt">
  <strong>🤖 ChatGPT:</strong> {{ .Inner | markdownify }}
</div>
```

---

## ✅ 2. CSS 스타일 추가 (말풍선 스타일)

(생략)

---

## ✅ 3. 포스트에서 사용하기

이제 블로그 마크다운에서 대화를 이렇게 입력하면 돼:

```markdown
{ {< user >} }
내가 hugo 블로그를 쓰고 있는데 너와의 대화를 블로그에 남기고 싶어
{ {< /user >} }

{ {< gpt >} }
좋아, Hugo 블로그에 너와 나의 대화를 남기려면 몇 가지 방식이 있어...
{ {< /gpt >} }
```



---

## 💡 보너스: blockquote처럼 보이게 하고 싶다면?

Shortcode 내부를 `<blockquote>`로 감싸거나, tailwind 등을 활용한 디자인도 가능해.

---


{{< /chatlog >}}


대략 어떻게 해야할지 감이 잡혔다. 
GPT는 대단한게 진짜 완전 뜬금없는 주제로 아무렇게나 물어봐도 구체적인 방향으로
이끌어준다. 대단하다. 👍

1. hugo의 숏코드를 만들어서 대화내용 자체를 div 태그안에 생성되도록 몰아넣는다.
2. css 로 적당히 꾸며 준다.

**[주의]**
숏코드 자체를 마크다운으로 출력해보는 예시가 있는데 
이것은 escape가 안된다. 왜냐하면 숏코드가 마크다운 렌더링보다 먼저 처리되기 때문



### 1.2. 내 질문을 클래스 분리하기

GPT가 만들어준 숏코드와 스타일을 잘 적용 했으나 
불만족스러운 부분은  내 질문이 그냥 텍스트로 한줄 딸랑 나온다는 점이였다. 
별개의 말풍선으로 빼고 싶었다. 

{{< chatlog >}}
**User**
hugo 블로그에 숏코드를 통해 GPT대화내용을 마크다운 형태로 입력할 건데 user 부분만 말풍선 효과를 주려면 이미 렌더링 된 내용을 가지고 치환해야하나?

**🤖 ChatGPT:**  
좋은 질문이야. Hugo 블로그에서 shortcode를 사용해서 GPT 대화 내용을 렌더링한 뒤, 특정 부분(예: User만)을 말풍선 스타일로 꾸미고 싶다면, 어떻게 처리하느냐에 따라 달라져. 아래에서 두 가지 접근 방식을 소개할게:

## ✅ 1. Shortcode 단계에서 말풍선 적용 (권장 방식)
(생략)

-----

## ❌ 2. 렌더링 이후 치환 (비권장)

만약 이미 HTML로 렌더링된 뒤에 특정 클래스를 넣거나 스타일을 바꾸고 싶다면:
* custom JS로 후처리하거나
* Hugo의 .Content 를 replace 필터로 가공해야 함
→ 하지만 이는 복잡하고 유지보수에 안 좋음.

(생략)

---- 

**User**
그런데 한번의 마크다운 입력으로 같은 대화내용을 한 div에 넣고 싶은데 숏코드를 따로 하면 div 가 분리되잖아 어쩔수 없는거 아니야?

**ChatGPT:**  
맞아, 아주 중요한 포인트 짚었어.  
**Hugo에서 여러 `shortcode`를 사용하면 각각이 독립적으로 HTML `<div>` 블록으로 렌더링**되기 때문에,  
**하나의 마크다운 파일에서 연속된 대화 내용을 하나의 `<div>`로 묶기는 어렵다**는 제약이 있어.

---

## ✅ 해결 방법: **하나의 shortcode 안에서 전체 대화를 구성**


{{< /chatlog >}}


내가 원하는 것은 

1. 대화내용을 그대로 마크다운 형태로 추출 `**User**` 와 지피티의 대답이 표기됨
2. 이때 마크다운은 그대로 렌더링 하지만 `**User**` 부분만 특별히 말풍선으로 표기

어쩔수가 없다. 마크다운 렌더링 후 치환하는 방식으로 결정했다.
GPT 선생은 맘에 들지 않는 눈치

## 2. 적용

이 부분은 내가 작성한게 아니고 100% GPT가 만든것이다. 

### 2.1. 숏코드

```html
{{ $content := .Inner | markdownify }}

{{/* 이제 HTML 안에서 <strong>User</strong> 찾기 */}}
{{ $pattern := `<strong>User</strong>\.?\s*([^<]*)` }}
{{ $replace := `<div class="user-bubble"><strong>User</strong>. $1</div>` }}

{{ $final := replaceRE $pattern $replace $content }}

<div class="chatlog">
  {{ $final | safeHTML }}
</div>
```


### 2.2. CSS 


```css
/* 1. 글꼴 */
.chatlog {
  font-family: 'Inter', 'Roboto', 'Noto Sans KR', sans-serif;
  font-size: 0.98rem;
  line-height: 1.75;
  color: #333;
  border: 1px solid ;
  border-radius: 10px;
  max-width: 580px;
  margin: 0 auto;
        padding: 20px 20px;
}

/* 2. 표(table) */
.chatlog table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
  font-size: 0.95rem;
}

.chatlog th,
.chatlog td {
  border: 1px solid #ddd;
  padding: 0.75rem;
  text-align: left;
}

.chatlog thead {
  background-color: #f0f0f5;
  font-weight: 600;
}

.chatlog tbody tr:nth-child(even) {
  background-color: #fafafa;
}

/* 3. 코드 블록 (pre & code) */
.chatlog pre {
  background-color: #f5f5f7;
  padding: 1rem;
  overflow-x: auto;
  border-radius: 6px;
  font-size: 0.92rem;
  line-height: 1.6;
  margin: 1.5rem 0;
}

.chatlog code {
  font-family: 'Courier New', monospace;
  color: #2c3e50;
}

/* 인라인 코드 */
.chatlog p code {
  background-color: #eef1f5;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-size: 0.95em;
}
.user-bubble {
  background-color: #cdcdcd;
  border-radius: 16px 16px 0 16px; /* 오른쪽 말풍선 느낌 */
  padding: 0.8em 1.2em;
  margin: 0.5em 0 0.5em auto; /* 오른쪽 정렬 */
  max-width: 80%;
  display: inline-block;
  position: relative;
}

.user-bubble::before {
  content: "";
  position: absolute;
  left: -10px;
  top: 10px;
  border: 6px solid transparent;
  border-right-color: #cdcdcd;
}

.gpt-line {
  margin: 0.5em 0;
}
```


## 3. 후기

GPT는 내가 필요한 간단한 수준의 css는 뚝딱 만들어준다. 
대략적으로만 알고 있었는데 이젠 나한테 굳이 필요없으면 
아예 연구할 생각없이 이용만 해도 될것 같다. 
그리고 막연한 상태에서 방향성을 잡아주는데 매우 큰 도움이 된다.
접근 방식을 굉장히 빨리 세울 수 있다.

요즘엔 유료를 쓰면서 자동으로 무엇인가 시키기도 하며 
잘 사용하는 사람들이 많던데 의외로 개발자인 내가 
늦는 느낌이다.. 

일단 더 친해져야지.

