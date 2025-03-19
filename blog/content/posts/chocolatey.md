---
title: "Chocolatey"
date: 2021-05-02T23:30:18+09:00
draft: false
toc : true
tocBorder : true
---

# Chocolatey 사용

윈도우에서 [chocolatey](https://chocolatey.org/) 우분투의 apt, 아치의 pacman 와 같이 패키지를 관리해주는 시스템이다. 

## 패키지 검색
```sh
$ choco search git

Chocolatey v0.10.15
git 2.31.1 [Approved]
...
179 packages found.
```

## 패키지 설치
```sh
$ choco install joplin

Installing the following packages:
joplin
By installing you accept licenses for the packages.
joplin v1.7.11 already installed.
 Use --force to reinstall, specify a version to install, or try upgrade.

Chocolatey installed 0/1 packages.
 See the log for details (C:\ProgramData\chocolatey\logs\chocolatey.log).

Warnings:
 - joplin - joplin v1.7.11 already installed.
 Use --force to reinstall, specify a version to install, or try upgrade.
```

## 패키지 정보보기

```sh
$ choco info googlechrome

Installing the following packages:
joplin
By installing you accept licenses for the packages.
joplin v1.7.11 already installed.
 Use --force to reinstall, specify a version to install, or try upgrade.

Chocolatey installed 0/1 packages.
 See the log for details (C:\ProgramData\chocolatey\logs\chocolatey.log).

Warnings:
 - joplin - joplin v1.7.11 already installed.
 Use --force to reinstall, specify a version to install, or try upgrade.
```


## 그 외 명령들

```sh
$ choco uninstall 패키지  삭제

설치된 패키지 검색
$ choco search -l   

Chocolatey v0.10.15
chocolatey 0.10.15
cmake 3.20.1
cmake.install 3.20.1
hugo 0.82.1
joplin 1.7.11
5 packages installed.

$ choco upgrade 패키지
```