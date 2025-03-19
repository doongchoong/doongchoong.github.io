---
title: "Use_hugo"
date: 2021-05-02T15:18:39+09:00
draft: false
toc : true
tocBorder : true
---

# 휴고 사용하기

[Gohugo](https://gohugo.io/) 는 정적 웹페이지를 생성하는 툴이다.
이를 이용하여 Github에 블로그를 구축하는 것을 보고 
이 블로그도 hugo로 만들어보기로 하였다.

## 설치하기

Hugo Installing 을 참조하여 설치한다.
바이너리를 받아서 설치후 환경변수에 등록하면 된다.
혹은 Chocolately 를 사용 패키지 설치한다.

```sh

$ choco search hugo

```

## 사이트 생성하기

사이트(블로그)를 구성하고자 하는 폴더에 가서 아래 명령을 수행한다.

```sh

$ hugo new site blog

```
나는 블로그를 만들고자 했기때문에 blog 폴더에 각종
폴더 및 파일들이 생성된다.

```txt

archetypes
content
data
layouts
public
resources
server
static
themes
config.toml
syntax.css

```

content 는 md파일이 모여있는 곳으로 
웹페이지로 렌더링 된다. 글을 쓸때 여기에 md파일을 작성하게 
될 것이다.
themes 폴더는  테마를 받아서 디자인을 꾸밀수 있다.


## 테마 받기

[휴고테마링크](https://themes.gohugo.io/) 에 가서
맘에 드는 테마를 고른뒤에 받아서 설치한다.
대부분 테마는 github 리파지토리이다. 따라서
아래 명령처럼 git clone을 사용하여 받으면 된다.

```sh

$ cd themes
$ git clone https://github.com/......

```


## 포스트 쓰기

Markdown 파일로 포스트를 작성한다. 
파일을 직접 만들어도 되지만 hugo의 정보도 같이 생성하기
위해 아래 명령어로 추가해도 된다.

```sh

$ hugo new post/first-post.md

```

## 로컬에서 확인하기

정적웹페이지들을 github등으로 올리기 전에
어떻게 보이는지 확인할 수 있다. 

```sh

$ hugo -D server

```

`-D`옵션은 특히 Draft 모드인 글까지도 볼 수 있다.




