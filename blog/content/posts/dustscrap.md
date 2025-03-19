---
title: "Dustscrap"
date: 2023-02-11T18:36:21+09:00
draft: false
toc : true
tocBorder : true
---

# Dustscrap

미세먼지의 확산을 영상으로 보기 위해서 [어스널스쿨](https://earth.nullschool.net/)
을 시간별로 캡쳐하여 영상으로 만드는 프로그램을 개발 했다.

레포는 [https://github.com/doongchoong/dustscrap](https://github.com/doongchoong/dustscrap)
이다.

![cosc-gif](https://github.com/doongchoong/dustscrap/raw/main/dust.gif?raw=true)


## URL 분석

어스널스쿨은 굉장히 URL 설계가 잘 되어 있다. 
과거 특정 시점의 상황을 보고싶을때
열어보면 URL이 다음과 같이 보인다.

```txt
site: https://earth.nullschool.net/
time: #2023/02/11/0800Z/
mode: particulates/surface/level/anim=off/overlay=pm2.5/
view: orthographic=-229.43,42.28,546
```

시간은 1시간 단위이며 모드는 미세먼지를 PM2.5나 PM10으로 바꿀때 혹은 COSC 등으로 바꿀때마다 해당 정보에 따라 변경되는 값이다. 뷰는 지도를 보는 방식인데 기본값인 Orthographic 모드가 지구본을 보는것과 같은 뷰로 보게 된다.

따라서 영상으로 제작하기 위해 시간을 시간단위로 계속 캡쳐를 하려면 
1. 시간을 생성해서 URL을 생성한다. 
2. 해당 URL을 방문하여 스크린샷을 찍는다. 
3. 위를 반복한다. 


### Time 파싱

URL의 시간은 뭔가 잘 알려진 포맷은 아니므로
부분부분 잘라내어 정식 스트링 포맷으로 변경하고 파싱한다.
이러면 타임 객체를 얻는다.

```go
fromTim, err := time.Parse(time.RFC3339,
    fmt.Sprintf("%s-%s-%sT%s:00:00+00:00",
        conf.From_url[1:5],
        conf.From_url[6:8],
        conf.From_url[9:11],
        conf.From_url[12:14]))
if err != nil {
    return nil, err
}
toTim, err := time.Parse(time.RFC3339,
    fmt.Sprintf("%s-%s-%sT%s:00:00+00:00",
        conf.To_url[1:5],
        conf.To_url[6:8],
        conf.To_url[9:11],
        conf.To_url[12:14]))
```

From-To를 얻은 뒤에는 이 정보를 이용하여
시간객체에 time.Hour 값을 더해 가면서 URL을 연속적으로 생성할 수 있다.

```go
for {
		tt = tt.Add(time.Hour)
		if tt.After(toTim) {
			break
		}
		url = fmt.Sprintf("https://earth.nullschool.net/%s/%s/%s",
			fmt.Sprintf("#%d/%02d/%02d/%02d00Z", tt.Year(), tt.Month(), tt.Day(), tt.Hour()),
			conf.Mode_url,
			conf.Projection_url,
		)
		ret = append(ret, url)
	}
```

### Config 파일

위와 같이 From-To 정보나 모드와 같이 여러 설정을 
파일 형태로 저장해두고 로드하도록 하면 더 편할 것이다. 
따라서 json 포맷으로 아래와 같은 형태 사용하게 하였다.

```json
{
	"from_url" : "#2023/01/05/0100Z",
	"to_url" : "#2023/02/09/0000Z",
	"mode_url" : "particulates/surface/level/anim=off/overlay=pm2.5",
	"projection_url" : "orthographic=-234.04,36.14,1377",
	"wait_seconds": 1,
	"frames_path" : "../frm_pm25",
	"time_stamp": true
}
```

이미지들이 저장될 폴더와 그리고 타임스탬프 찍는 기능 여부도 설정하도록 한다.

wait_seconds 는 이미지를 한번 찍고 나서 대기하는 시간이다. 
이는 Scraping을 할때 점검을 해봐야 할 사항이다. 
이러한 제한을 두지 않는다면 DDos에 준하는 속도로 상대 서버에 부하를 주게 된다.
'예의바른' 스크래핑을 위해서 사람이 행동하는 정도의 속도로 캡쳐하도록 하였다. 

1시간 간격 캡쳐이니 1일에는 24시간  즉 하루를 1초로 지정했을때 24프레임으로
지정할 수 있고 1달 정도 기간을 캡쳐하면 720 프레임 정도 나오고 빨라도 720초 이상 소모하게 된다. 그래서 이미지를 구하는 작업은 꽤 시간을 요하는 작업이다. 




## Scraping

URL을 생성 했다면 이제는 생성한 URL을 방문한 뒤에 렌더링된 화면을 캡쳐하면 된다. 이를 위해 예전에는 셀레니움을 사용했었는데 요즘 잘 업데이트 안되고 있다고 하여 [chromedp](https://github.com/chromedp/chromedp) 라는 라이브러리를 사용했다. 이 라이브러리는 셀레니움과는 다르게 별도 바이너리가 필요 없다. 직접 Chrome Devtool Protocol을 사용한다.


### Chrome 구동

```go
// create context
	ctx, cancel := chromedp.NewContext(
		context.Background(),
		// chromedp.WithDebugf(log.Printf),
	)
	defer cancel()
```
새로운 컨텍스트를 만드는데 아마도 이 시점에서 크롬을 **Headless**로 실행하는 것 같다. 사실 보이지만 않을 뿐이지 크롬 브라우져가 구동되어 있고
이 숨겨진 브라우져와 통신한다.

### Navigate and Waiting

chromedp의 예제를 보면 Run 함수에 여러 Task들을 나열하여 
실행하는 식으로 되어 있다. 
하지만 여기서는 그렇게 하지 않았는데 
어스널스쿨에서 렌더링하는 시간이 필요하기 때문이다.

이동하자마자 바로 스크린샷을 찍으면 어두운 화면만 나오게 된다.
따라서 Status 를 읽고  렌더링이 끝나고 나서 캡쳐하도록 
별도의 Waiting 작업을 추가한다. 

Chromedp의 내장된 Wait* 함수로는 이런류의 작업이 없기 때문에
이런식으로 장황하게 구현하였다.

```go
	// URL 순회
	for _, url := range urls {

		log.Print("Try capture :" + url)

		// url 이동
		if err := chromedp.Run(ctx, chromedp.Navigate(url)); err != nil {
			log.Fatal(err)
		}
		// 렌더링을 기다린다.
		for cnt := 0; cnt < 500; cnt++ {
			var res string
			if err := chromedp.Run(ctx, chromedp.Text(".field", &res, chromedp.ByQuery)); err != nil {
				log.Fatal(err)
			}
			time.Sleep(time.Millisecond)
			if strings.Contains(res, "Download") {
				continue
			}
			if strings.Contains(res, "Rendering") {
				continue
			}
			break
		}

		// 스크린샷을 찍는다.
		var buf []byte

		err := chromedp.Run(ctx, chromedp.FullScreenshot(&buf, 100))
		if err != nil {
			log.Fatal(err)
		}
```


### Timestamp

원하는 것은 본래 이미지에  스트링을 위에다가 그리는 것이다. 
간단하게 처리하려고 해도 찾기가 좀 어려웠다. 
그냥 구글링 끝에 스택오버플로우 있는 내용으로 구현했다.

```go
// input byt: png bytes =>  output byt: png bytes
func AddTimeStamp(byt []byte, x, y, size int, color color.Color, label string) ([]byte, error) {
	img, err := png.Decode(bytes.NewReader(byt))
	if err != nil {
		return nil, err
	}
	font, err := truetype.Parse(goregular.TTF)
	if err != nil {
		return nil, err
	}
	face := truetype.NewFace(font, &truetype.Options{Size: float64(size)})

	w := img.Bounds().Size().X
	h := img.Bounds().Size().Y

	dc := gg.NewContext(w, h)
	dc.DrawImage(img, 0, 0)
	dc.SetFontFace(face)
	r, g, b, _ := color.RGBA()
	dc.SetRGB(
		float64(r)/float64(0xff),
		float64(g)/float64(0xff),
		float64(b)/float64(0xff),
	)
	dc.DrawStringAnchored(label, float64(x), float64(y), 0, 0.5)

	img = dc.Image()

	buf := new(bytes.Buffer)
	err = png.Encode(buf, img)

	return buf.Bytes(), nil
}
```


## 이미지들로 영상 만들기

이미지들을 사용하여 영상을 만들어 내기 위해 [FFmpeg](https://ffmpeg.org/) 사용하여 영상을 만든다.
이때 Window 버젼에선 심각한 문제가 있는데 파일 Glob 패턴을 사용할 수 없다는 점이다. 
그래서 아래와 같은 명령으로 사용해야 한다.

```sh
$ ffmpeg -f image2 -r 24 -i "../frm_pm25/img%04d.png" -q:v 1 output.avi
```
즉 %04d 같은 일련번호 패턴만 먹힌다.

하지만 이미지는 일자+시간 형태로 저장되어 있으므로 
프로그램을 작성해서 이미지 파일명을 임시로 변경했다가 다시 돌려놓는 
작업을 하도록 만들었다.

```go
var err error
	err = RollbackImageSequence(*imgpath)
	if err != nil {
		panic(err)
	}
	err = RenameImageSequence(*imgpath, *start, *end)
	if err != nil {
		panic(err)
	}
	err = GenVideoByFFMPEG(*outputf, *binpath, *imgpath, *quality, *scale)
	if err != nil {
		panic(err)
	}
	err = RollbackImageSequence(*imgpath)
	if err != nil {
		panic(err)
	}
```

### FFmpeg 명령 실행하기

```go
cmd = exec.Command(
    binpath,
    "-f", "image2",
    "-r", "24",
    "-i", filepath.Join(imgpath, file_fmt),
    "-q:v", fmt.Sprintf("%d", quality), //  1 (lossless), 4 (quard
    //"-vf", fmt.Sprintf("scale=-1:%d", scale),
    outputf,
)

cmd.Stdout = os.Stdout
cmd.Stdin = os.Stdin
cmd.Stderr = os.Stderr
fmt.Println("start")
err := cmd.Run()
if err != nil {
    return err
}
```

위 와 같이 GO언어에서 명령을 그대로 실행할 수 있는데 여기에 표준입/출력/에러 까지 설정하게 되면 완벽히 대신 실행하게 되는 상황이다.


## 영상후기

1시간 단위로 캡쳐를 한뒤 1초에 24프레임으로 영상을 만들었으니
1초에 하루가 지나간다. 
이때 마치 심장 박동을 뛰는 것처럼 미세먼지가 늘어났다가 줄어들었다가 
하는 것을 볼수 있다. 

아마도 사람의 활동에 따라 낮시간에는 활발하여 늘어났다가.
밤시간에는 줄어들고 하는 것으로 보인다. 
다만 줄어들때 확실히 줄어들지 않고 밤시간에도 부유하고 있는 것들이 문제이다. 
이런애들은 날이 갈수록 농축되어 점점 진해진다. 
북쪽에서 바람이 불어올때가 되서야 바람에 날려 흩어진다.

그리고 정말로 유체흐름 같은 느낌이 난다. 거대한 스케일에선 
느끼기 힘들겠지만 하루를 1초로 당기니까 속도가 빨라지면서 복잡하고 카오스적인
공기의 흐름으로 보인다.

![temp-gif](https://github.com/doongchoong/dustscrap/blob/main/temp.gif?raw=true)
(북극에서 본 공기 온도)

### 생각할 만한 포인트

이미지를 수집하는 것이 생각보다 시간이 오래 걸린다. 따라서 좀더 이 시간을 빠르게 하려면 설정한 것보다 '덜 예의바른' 스크래핑을 할수 있다. 0.5초에 한번이라던지 혹은 0.25초에 한번이라던지... 

하지만 브라우져에서 렌더링 되는 시간이 있어서 대략 체감되는 딜레이 시간은 2초 정도 걸린다. 이러면 병렬 처리를 생각해볼수 있다. 
병렬처리를 하려면 가장 쉬운 방법으론  from-to 일자를 안 겹치도록 설정해서 
프로그램을 여러개를 동시에 실행시키는 방법이 있다. 

혹은 프로그램 내부에서 병렬로 실행할 수 있는데 이렇게 하려면 꼭 기억해야 할 점이 chromdp는 눈에 보이진 않지만 크롬이 구동되어 동작하고 있다는 점을 알아야 한다. context라고 부르는 객체를 만드는데 이게  크롬의 탭이 하나 더 수행되는 것인지 아니면 브라우져 자체가 여러개 뜨는 것인지 라이브러리 내부를 분석해봐야 알수 있다.


### 응용할 만한 것

일단 영상을 제작하는 정도로 끝났지만 사실 좀더 구현하고자 하는 것이 있다.
미세먼지에 대한 뉴스가 나올때  '자생적' 요인이 50% '외부적' 요인이 50% 라는 뉴스가 나왔다. 아마도 많은 사람들은 이에 동의하지 못하는 듯하다. 

어스널스쿨을 관찰했을때 느끼는 점은 하늘이 뿌옇게 흐려저 체감이 되는 상황은 Cosc 모드의 농도가 진할 때였다. 따라서 개인적으로는 cosc가 외부적인 요인으로 생각이 든다. 이러한 가정하에 정말로 '자생적' 인 요인이 얼마나 발생하는지를 관찰하려면  cosc PM2.5 PM10 등의 농도를 수치화 하고 정규화 한다. 그 뒤에  PM2.5에서 COSC를 차감한 영상을 구하여 확인 할 수 있을 것이다.   



