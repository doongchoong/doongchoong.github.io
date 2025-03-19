---
title: "Python소스설치"
date: 2021-08-14T15:47:59+09:00
draft: false
toc : true
tocBorder : true
---

# Python 소스 설치

보안이 엄격한 회사에서는 물리적으로 서버망이 분리되어 있을 수도 있다.
가벼운 목적에서 스크립트 언어를 설치하려고 해도 제약사항이 참 많다.
특히 설치 패키지가 지원하지 않는 유닉스류 등을 사용하게 되면
소스 설치가 필요하다. 하지만 생각보다 어렵지 않고 쉬운편이다.


## 1. 설치순서

[설치소스는 여기서 받는다.](https://www.python.org/downloads/source/)

1. configure 를 통해서 환경에 맞게 옵션을 주어 실행
2. Makefile이 생성됨. 
3. Makefile을 살펴보면서 다시 빌드환경 점검
4. make, make install 


## 2. 고려할 사항들

### 2.1 64비트 시스템

64비트로 같이 맞추는게 좋다. AIX 류라면

> ``` export OBJECT_MODE=64 ```  

그리고 상용 컴파일러를 쓰게 되면 64비트 별도 옵션을 Makefile에 
적혀 있어야 한다.



### 2.2 Root계정이 아닌 하위계정

파이썬 설치 위치부터 별도로 지정하는 것이 좋을 것이다.
특수 용도의 계정에서 별도로 사용하는 것이니까 말이다.

```sh
./configure  --prefix=/home/xxxuser/opensources
```


### 2.3 상용 컴파일러

파이썬의 configure는 범용적인 옵션이 미리 등록되어 있지만
상용 컴파일러 인지를 못한다. 
회사에서 별도로 사용하는 컴파일러가 있고 옵션도 별개라면
Makefile을 점검해서 각종 옵션을 조정해주어야 한다.


### 2.4 C 익스텐션 

python 설치시 C Extension 개발도 같이 고려하는 경우도 있을 것이다.
그럼 파이썬 .so 파일이 필요하다. 이를 위해서는 
```enable-shared``` 옵션을 준다.

```sh
./configure --enable-shared  --prefix=/home/xxxuser/opensources
```
이렇게 설치하게 되면
위 prefix 위치에 lib 디렉토리에 python3.x.so  등이 생겨나 있을 것이다.
include 디렉토리에는 Python3.x.h 헤더가 있어야 한다.


## 3. 설치후 확인

prefix 의 bin 디렉토리에 바이너리가 있는지 그리고 실행되는지 확인
include 디렉토리에 Python3.9.h 등이 있는지 확인 (enable-shared)
lib 디렉토리에 lPython3.9.so 등이 있는지 확인 (enable-shared)
lib 디렉토리에 python3.9 디렉토리가 있는지 (파이썬의 라이브러리 디렉토리)


