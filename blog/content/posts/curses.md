---
title: "Curses"
date: 2021-05-29T20:53:40+09:00
draft: false
toc : true
tocBorder : true
---

# Curses

curses란 유닉스 계열 운영체제에서 터미널 환경 제어하는 라이브러리를 말한다.
본인이 [fzc]를 만드는 데 사용하였다.
기본적인 사용법은 간단히 검색을 하면 나오는데 그 외 좀 검색하기 어려웠던 
내용을 적어보고자 한다.


## 검색하기 힘들었던 내용

### 표준출력과 혼용하여 사용하기

Curses는 기본적인 방식으로 로직을 구성하면
표준입출력을 사용하기 때문에 표준출력을 별도의 용도로 사용하기 어렵다.
[fzc]를 만드는데 화면의 내용은 퍼지검색 리스트 표출이지만
파일을 선택하고 나서는 표준출력으로 선택한 파일 내용을 표출해야했기 때문에
필요했다. 이는 많은 검색을 통해
initscr을 호출하는 대신 new term을 구성하는 방식을 사용하면 되는 내용을 찾았다.
[검색한 Stackoverflow 내용](https://stackoverflow.com/questions/8371877/ncurses-and-linux-pipeline)

```c
FILE *f = fopen("/dev/tty", "rb+");
SCREEN *screen = newterm(NULL, f, f);
set_term(screen);

...

endwin();
delscreen(screen);
fclose(f);

```


### Xterm 키 시퀀스

오래전부터 프로그래밍을 해오지 않은 이상, 터미널 발전의 역사를 모른채로 터미널을 접할 것이다.
터미널의 종류는 많았고 그동안 여러가지 종류가 있었지만 현재는 거진 xterm 으로 쓰고 있는 것 같다.
xterm이 사실 어떤 종류라고만 알았지 정확히 뭔지 몰랐다가.
[fzc] 를 만들면서 입력키 처리하면서 조사하다가 대략적인 내용을 알게 되었다.
[ANSI escape code wiki](https://en.wikipedia.org/wiki/ANSI_escape_code)

사실 curses에서 특수입력키 (화살표키, Ins, Home, End 등등) 등을 사용하려면
```keypad(, TRUE);``` 함수를 쓰곤 했는데 
예전버젼의 유닉스 curses에서는 특수키를 입력하면 마치 raw모드로만 입력이 되는 현상이 일어났다.

걍 대놓고 현상만 얘기하자면 keypad를 쓰면 curses에서 정의된 KEY_UP , KEY_DOWN 등을 사용 가능해야했는데 옛날 유닉스에서는 KEY_UP KEY_DOWN을 누르면 ESC키와 조합되는 여러 키가 입력되는 것처럼 보이는 현상이 일었다.
이게 raw 모드였다. 특수키 들은 여러 키가 동시에 입력이 되는 식으로 처리가 된며 이는 xterm 규약에 따라 처리되는 것이다.

Raw 모드로 밖에 사용을 할수 없었다 보니 근본적으로 키 조합이 어떻게 들어오는지 
조사가 필요하였다.
따라서 아래와 같은 프로그램을 짜고 입력 키에 대응해서 어떤 시퀀스가 들어오는지 조사했다.


```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <unistd.h>
#include <ncurses.h>

char g_ascii_code[16];
char* control_codes[] = {
"<NUL>", "<SOH>", "<STX>", "<ETX>", "<EOT>", "<ENQ>", 
"<ACK>", "<BEL>", "<BS>", "<HT>", "<LF>", "<VT>", "<FF>", 
"<CR>", "<SO>", "<SI>", "<DLE>", "<DC1>", "<DC2>", "<DC3>", 
"<DC4>", "<NAK>", "<SYN>", "<ETB>", "<CAN>", "<EM>", "<SUB>", 
"<ESC>", "<FS>", "<GS>", "<RS>", "<US>"
};

char* get_ascii_nm(int c)
{
	if(0 <= c && c < 0x20)
	{
		return control_codes[c];
	}
	else if( 0x20 <= c && c < 0x7f)
	{
		sprintf(g_ascii_code, "'%c'", c);
		return g_ascii_code;
	}
	else if( c >= 0x7f )
	{
		return "<DEL>";
	}
	else
		return "";
}



/*
    Get key-sequence in raw mode
    Pressed arrow up and down key at the same time : 
First:
        <ESC> '[' 'A' <ESC> '[' 'B'
          *  ------>
    - Save all key-sequence in 'kbuf'
    - Seperate a first key-sequence and put it 'seq' array
Seconds:
        <ESC> '[' 'A' <ESC> '[' 'B'
                        *  ------>
    - Seperate a seconds key-sequence and put it 'seq' array
*/
#define KEY_SEQ_SIZE (8)

int raw_keys(int kbuf[], int buflen, int* buf_idx, int* err_cnt, int seq[])
{
    if( kbuf[*buf_idx] == 0)
    {
        int key, cnt=0;
        *buf_idx = 0;
        memset(kbuf, 0x00, sizeof(int) * buflen);
        key = getch();
        while(key == ERR)
        {  /* meaningless ERR key skip , found it old unix */
            cnt++; key = getch();
            *err_cnt = cnt;
            if(cnt > 128)
                usleep(50 * 1000);
        }
        kbuf[0] = key;
        if(key == 0x1b) /* ESC */
        {
            timeout(0); /* non-blocking */
            for(int i= 1 ; i < buflen; i++)
            {
                key = getch();
                if(i == 1 && key == ERR)
                    return 0; /* ESC KEY */
                if(key == ERR)
                    break;
                kbuf[i] = key;
            }
            timeout(-1); /* blocking */
        }		
    }

    int is_esc = 0;
    int seq_idx = 0;
    memset(seq, 0x00, sizeof(int) * KEY_SEQ_SIZE);

    for(int i= *buf_idx; i < buflen && kbuf[i] != 0; i++)
    {
        if(is_esc)
        {
            if( kbuf[i] == 0x1b )  /* ESC :   ESC [ A  (here) ESC  */
                break;
            seq[seq_idx++] = kbuf[i];
            if( kbuf[i] == 0x7e )  /* ~   :   ESC [ 1 5 ~  (here) */
                break;
        }
        else
        {
            seq[seq_idx++] = kbuf[i];
            if( kbuf[i] == 0x1b ) /* ESC :  start escape sequence */
                is_esc = 1;
            else
                break;
        }
    }
	
	if(seq[0] == 0x1b)
		*buf_idx  += seq_idx + 1;
	else
		*buf_idx += 1;
    
    return 1;
}


int main(void)
{
	int kbufs[64] ={0};
	int kbuf_idx = 0;
	int err_cnt = 0;
	int seqs[KEY_SEQ_SIZE] = {0};

	FILE *f = fopen("/dev/tty", "rb+");
	SCREEN *screen = newterm(NULL, f, f);
	set_term(screen);

	start_color();
	init_pair(1, COLOR_CYAN, COLOR_BLACK);

	curs_set(0); /* no cursor */
	noecho();   /* no echo */
	raw();      /*  raw input */

	while(raw_keys(kbufs, 64, &kbuf_idx, &err_cnt, seqs )) /* ESC key exit */
	{
        clear();
        if(seqs[0] == 0x1b)
            if(seqs[1] == 0x5b)
            {
                if(seqs[2] == 0x41)
                    mvaddstr(1, 1, "Press Up-key");
                if(seqs[2] == 0x42)
                    mvaddstr(1, 1, "Press Down-key");    
            }
                
		for(int i=0; i < KEY_SEQ_SIZE; i++)
		{
			mvprintw(2 + i, 1, "key[%d]: %4d %-9x %s", 
					i, seqs[i], seqs[i], get_ascii_nm(seqs[i])
			);
		}
		refresh();
	}

	endwin();
	delscreen(screen);
	fclose(f);

	return 0;
}
```

만일 키를 엄청나게 빠르게 거의 동시에 같은키를 누르면 터미널 프로그램에서는 
여러키를 한번에 잡아서 단번에 입력을 시도한다.  getch() 함수로 
블로킹 대기하도록 기대 했지만 사실 여러키가 한번에 입력되기 때문에 의도한 
getch대로 동작하지 않을 수 있다.

그래서 위의 ```raw_keys``` 함수를 만든것이다.
기본적으로는 ESC 시퀀스를 대비하되 동시키 입력을 대비해서 버퍼에 담아둔뒤에 
차례차례 하나의 키에 대응되는 시퀀스까지만 발라내서 output에 담는 함수이다.

실제로 화살표 키를 입력해보면

```txt
 Press Down-key
 key[0]:   27 1b        <ESC>
 key[1]:   91 5b        '['
 key[2]:   66 42        'B'
 key[3]:    0 0         <NUL>
 key[4]:    0 0         <NUL>
 key[5]:    0 0         <NUL>
 key[6]:    0 0         <NUL>
 key[7]:    0 0         <NUL>
```

F5키 입력시
```txt
 key[0]:   27 1b        <ESC>
 key[1]:   91 5b        '['
 key[2]:   49 31        '1'
 key[3]:   53 35        '5'
 key[4]:  126 7e        '~'
 key[5]:    0 0         <NUL>
 key[6]:    0 0         <NUL>
 key[7]:    0 0         <NUL>
```

즉 xterm이라는 터미널 규약은 화살표 아래키 입력을 받으면
ESC '[' 'B' 문자 세개를 연달아서 입력되는 것이다.
F5키를 입력하면 ESC '[' '5' '~' 이렇게 네개 문자가 연속으로 입력된다.


### 화면이 깜빡일 경우 clear 대신 erase를 사용

curses의 프로그램 구성은 입력을 블로킹으로 대기하다가
입력 내용에 따라서 대응을 하되  
화면을 지우고 그린 뒤에 refresh를 해서 화면을 갱신할 것이다.
이때 지우는 방법을 clear 대신 erase를 사용하면 
깜박이는 현상이 없어지고 좀더 부드러워 진다. 
이는 clear가 내부적으로 ok를 하는 단계가 더 존재하기 때문이라고 한다.


[fzc]: https://github.com/doongchoong/fzc

