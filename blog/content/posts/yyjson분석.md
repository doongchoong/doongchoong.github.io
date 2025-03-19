---
title: "yyjson분석"
date: 2021-05-02T17:44:40+09:00
draft: false
toc : true
tocBorder : true
---

# yyjson 분석

[yyjson](https://github.com/ibireme/yyjson)은
현존하는 JSON 파서중 가장 빠르다고 알려져 있는 라이브러리이다.
이 소스코드를 살펴보면서 유용한 것들과 공부할 만한 것 들을 메모한다.


## 단 두개 파일

yyjson.c , yyjson.h 단 두개 파일만 제공하여
각 프로젝트에 쉽게 빌드할 수 있도록 하였다.


## CPU 최적화

json 과 같은 텍스트 분석이 필요로 하는 것은
많은 선후 상태 의존성을 필요로 한다. 따라서 병렬로 수행하기 힘들며
수많은 분기가 존재하여 머신의 성능을 이끌어내기 어려운 
분야 중 하나. 따라서 yyjson이 어떤 최적화들을 하였는지
유용한 트릭들을 확인하도록 한다.


### 1. Loop unrolling

루프로 줄여쓸수 있는 코드를 오히려 늘여씀으로서
반복을 판단하는 조건판단의 수를 줄이는 기법 
[Duff's Device](https://en.wikipedia.org/wiki/Duff%27s_device)
로 알려져 있는 기법이다. 
yyjson에서는 이를 repeat 매크로로 풀어낸다.

```c
/* Macros used for loop unrolling and other purpose. */
#define repeat2(x)  { x x }
#define repeat3(x)  { x x x }
#define repeat4(x)  { x x x x }
#define repeat8(x)  { x x x x x x x x }
#define repeat16(x) { x x x x x x x x x x x x x x x x }

#define repeat4_incr(x)  { x(0) x(1) x(2) x(3) }

#define repeat8_incr(x)  { x(0) x(1) x(2) x(3) x(4) x(5) x(6) x(7) }

#define repeat16_incr(x) { x(0) x(1) x(2) x(3) x(4) x(5) x(6) x(7) \
                           x(8) x(9) x(10) x(11) x(12) x(13) x(14) x(15) }

#define repeat_in_1_18(x) { x(1) x(2) x(3) x(4) x(5) x(6) x(7) \
                            x(8) x(9) x(10) x(11) x(12) x(13) x(14) x(15) \
                            x(16) x(17) x(18) }
```

이는 소스코드에선 하나의 코드를 쓰지만 repeat 매크로를 사용하여
자동으로 반복되도록 확장하는 일종의 snippets 이다.

### 2. Likely, Unlikely

likely, unlikely 매크로는 리눅스 커널 소스코드에서 사용했다고 알려져있는데
이는 Branch 가 발생되는 부분에서 힌트를 주는 것이다. 
true 가 많이 발생할 경우는 likely , false가 많이 발생할 경우는
unlikely 등으로 사용한다. 

```c
/* likely */
#ifndef yyjson_likely
#   if yyjson_has_builtin(__builtin_expect) || YYJSON_GCC_VER >= 4
#       define yyjson_likely(expr) __builtin_expect(!!(expr), 1)
#   else
#       define yyjson_likely(expr) (expr)
#   endif
#endif

/* unlikely */
#ifndef yyjson_unlikely
#   if yyjson_has_builtin(__builtin_expect) || YYJSON_GCC_VER >= 4
#       define yyjson_unlikely(expr) __builtin_expect(!!(expr), 0)
#   else
#       define yyjson_unlikely(expr) (expr)
#   endif
#endif
```

사실 위 매크로중 중요한 것은 ```__builtin_expect(!!(expr), 0)``` 이것이다. 
1이면 likely , 0이면 unlikely이다. 이를 지원하는 컴파일러에 여부에 따라 
위처럼 묶어준뒤 .c 파일에서 

```c
/* Macros used to provide branch prediction information for compiler. */
#undef  likely
#define likely(x)       yyjson_likely(x)
#undef  unlikely
#define unlikely(x)     yyjson_unlikely(x)
```

이렇게 축약하여 사용한다. 지원하지 않는 컴파일러라면 성능이 급격히 떨어지게 되므로
될 수 있는 한 해당 기능을 지원하는 컴파일러를 쓰는 것이 좋다. 위 코드처럼
GCC 4 버젼이상, 그리고 개인적으로 검색해본 결과 
[LLVM도 지원](https://llvm.org/docs/BranchWeightMetadata.html)
한다.


위 두 매크로를 정의한 뒤에 어휘분석에서 발생하는 모든 if문에서 
likely , unlikely를 적당히 버무려 사용하면 된다.


### 3. Asm volatile

```c
    
skip_ascii_end:
    
    /*
     GCC may store src[i] in a register at each line of expr_jump(i) above.
     These instructions are useless and will degrade performance.
     This inline asm is a hint for gcc: "the memory has been modified,
     do not cache it".
     */
#if YYJSON_IS_REAL_GCC
    __asm volatile("":"=m"(*src)::);
#endif
    if (likely(*src == '"')) {
        val->tag = ((u64)(src - cur) << YYJSON_TAG_BIT) | YYJSON_TYPE_STR;
        val->uni.str = (const char *)cur;
        *src = '\0';
        *end = src + 1;
        return true;
    }
```

매우 난해한 코드이다. 인라인 어셈블리로 주석을 잘 읽어보자.


## Goto 문

lexer를 제작할때는 상태머신(FSM)을 작성해서 구현하는 경우가 많은데
이때 goto를 사용할 수 있다.
일반적인 goto 문은 로직을 어지럽게 하며 최적화하기도 힘들지만
이런 상태머신을 구현할 때는 오히려 좋은 케이스라고 할 수 있다.

```c
static_inline bool read_string(u8 *cur,
                               u8 **end,
                               yyjson_val *val,
                               const char **msg) {

// ... 수많은 코드 ...

skip_ascii:
    /* Most strings have no escaped characters, so we can jump them quickly. */
    
skip_ascii_begin:
    /*
     We want to make loop unrolling, as shown in the following code. Some
     compiler may not generate instructions as expected, so we rewrite it with
     explicit goto statements. We hope the compiler can generate instructions
     like this: https://godbolt.org/z/8vjsYq
     
         while (true) repeat16({
            if (likely(!(char_is_ascii_stop(*src)))) src++;
            else break;
         });
     */
#define expr_jump(i) \
    if (likely(!char_is_ascii_stop(src[i]))) {} \
    else goto skip_ascii_stop##i;
    
#define expr_stop(i) \
    skip_ascii_stop##i: \
    src += i; \
    goto skip_ascii_end;
    
    repeat16_incr(expr_jump);
    src += 16;
    goto skip_ascii_begin;
    repeat16_incr(expr_stop);
    
#undef expr_jump
#undef expr_stop
    
skip_ascii_end:


// ... 수많은 코드 ...

}
```

`skip_ascii`, `skip_ascii_begin`, `skip_ascii_end`
등을 라벨을 사용하여 goto문으로 상태이동을 표현하였다.

이때 재밌는 점은 위에서 설명한 loop unrolling, likely 매크로
등이 쓰인다는 점이다. loop Unrolling 매크로가 풀릴때 코드는 대략 
아래 모양으로 만들어진다.


```c

skip_ascii_begin:

// repeat16_incr(expr_jump); // 이게 풀리면
if (likely(!char_is_ascii_stop(src[0]))) {}
    else goto skip_ascii_stop0;
if (likely(!char_is_ascii_stop(src[1]))) {}
    else goto skip_ascii_stop1;
if (likely(!char_is_ascii_stop(src[2]))) {}
    else goto skip_ascii_stop2;
if (likely(!char_is_ascii_stop(src[3]))) {}
    else goto skip_ascii_stop3;
....
if (likely(!char_is_ascii_stop(src[15]))) {}
    else goto skip_ascii_stop15;

src += 16;
goto skip_ascii_begin;


skip_ascii_stop0: 
src += 0; 
goto skip_ascii_end;

skip_ascii_stop1: 
src += 1; 
goto skip_ascii_end;
	
// ... 수많은 코드 ...

```

무려 if문이 16번이나 연속 되므로 분기가 많아 느릴것 같아보이지만
if문 안에는 전부 likely매크로가 달려 있어 CPU에 true 힌트를 준다.
즉 힌트를 받은대로 전부 true로 예측하며 빠르게 진행된다.


## Bytes 매치

```c
/** 16/32/64-bit vector union, used for unaligned memory access on modern CPU */
typedef union v16_uni { v16 v; u16 u; } v16_uni;
typedef union v32_uni { v32 v; u32 u; } v32_uni;
typedef union v64_uni { v64 v; u64 u; } v64_uni;

static_inline bool byte_match_4(void *buf, const char *pat) {
    v32_uni u1, u2;
    u1.v = *(v32 *)pat;
    u2.v = *(v32 *)buf;
    return u1.u == u2.u;
}

```

json 에서  'true', 'null' 등의 토큰은 사실 바이트단위로
4번이나 비교할 필요가 없다. 4바이트이므로 그냥 바로 통째로 
4바이트 비교를 하면 된다.


## Character 테이블 

1바이트문자는 0~255 범위의 값을 가지므로
256개의 테이블을 미리 만들어둔뒤 개별 문자가 지닌 분류 해놓으면
빠르게 개별 char 의 범위를 조건문에서 체크할 필요없이 
바로 비교 가능하다.

```c
if( '{' == ch || '[' == ch ) {
	// char type Container
}

switch(ch)
{
	case '\n':
	case '\r':
	case '\0':
		// char type line END
		break;
}
```

위 소스는 분기 및 비교가 많다.


```c
/** Whitespace character: ' ', '\\t', '\\n', '\\r'. */
static const char_type CHAR_TYPE_SPACE      = 1 << 0;

/** Number character: '-', [0-9]. */
static const char_type CHAR_TYPE_NUMBER     = 1 << 1;

/** JSON Escaped character: '"', '\', [0x00-0x1F]. */
static const char_type CHAR_TYPE_ESC_ASCII  = 1 << 2;

/** Non-ASCII character: [0x80-0xFF]. */
static const char_type CHAR_TYPE_NON_ASCII  = 1 << 3;

/** JSON container character: '{', '['. */
static const char_type CHAR_TYPE_CONTAINER  = 1 << 4;

/** Comment character: '/'. */
static const char_type CHAR_TYPE_COMMENT    = 1 << 5;

/** Line end character '\\n', '\\r', '\0'. */
static const char_type CHAR_TYPE_LINE_END   = 1 << 6;

/** Character type table (generate with misc/make_tables.c) */
static const char_type char_table[256] = {
    0x44, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
    0x04, 0x05, 0x45, 0x04, 0x04, 0x45, 0x04, 0x04,
    0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04,
//...
//... 256 개의 사전 정의된 types
};

/** Match a character with specified type. */
static_inline bool char_is_type(u8 c, char_type type) {
    return (char_table[c] & type) != 0;
}

/** Match a whitespace: ' ', '\\t', '\\n', '\\r'. */
static_inline bool char_is_space(u8 c) {
    return char_is_type(c, CHAR_TYPE_SPACE);
}

/** Match a whitespace or comment: ' ', '\\t', '\\n', '\\r', '/'. */
static_inline bool char_is_space_or_comment(u8 c) {
    return char_is_type(c, CHAR_TYPE_SPACE | CHAR_TYPE_COMMENT);
}

```

위 코드처럼 사전정의된 테이블을 가지고 문자의 종류 판단을 하게 된다.
비트Mask를 활용한 것도 유용하다.

