---
title: "Gaussian_Random"
date: 2013-08-06T23:55:58+09:00
draft: false
toc : false
tocBorder : true
---

{{< raw >}}
<canvas id="normal_dist_canvas" width="660" height="480"></canvas>
	<script type="text/javascript">
		var normal_dist_canvas = document.getElementById('normal_dist_canvas');
		var normal_dist_ctx = normal_dist_canvas.getContext('2d');

		function box_muller_generator(){
			var x1 = Math.random();
			var x2 = Math.random();

			var u1 = Math.sqrt(-2 * Math.log(x1)) 
					* Math.cos( Math.PI * x2);
			var u2 = Math.sqrt(-2 * Math.log(x1)) 
					* Math.sin( Math.PI * x2);
			return u1;
		}

		function normal_dist_draw_line(x1,y1, x2,y2){
			normal_dist_ctx.beginPath();
			normal_dist_ctx.moveTo(x1,y1);
			normal_dist_ctx.lineTo(x2, y2);
			normal_dist_ctx.strokeStyle = '#000000';
			normal_dist_ctx.stroke();
			normal_dist_ctx.closePath();	
		}

		function normal_dist_draw_txt(txt, x, y){
			normal_dist_ctx.textBaseline = 'top';
			normal_dist_ctx.textAlign = 'center';
			normal_dist_ctx.fillText(txt, x, y);
		}
		// initialize
		var normal_dist_slice = new Array(60);
		for(var i=0; i < normal_dist_slice.length; i++){
			normal_dist_slice[i] = 0;
		}
		var normal_dist_cnt = 0;



		setInterval(function(){
			
			// gen numbers
			for(var i=0; i < 25; i++){
				var rnd = box_muller_generator();

				var bottom = -3;
				var top    = 3;
				var step = (top - bottom) / normal_dist_slice.length;

				for(var j=0; j < normal_dist_slice.length; j++){
					var from = step * j     + bottom;
					var to   = step * (j+1) + bottom;
					if(rnd >= from && rnd < to){
						normal_dist_slice[j]++;
					}
				}

			}

			// draw
			normal_dist_canvas.width = normal_dist_canvas.width;

			for(var i=0; i < normal_dist_slice.length-1; i++){
				var width = normal_dist_canvas.width;
				var height= normal_dist_canvas.height;

				var x = width * 0.1;
				var y = height* 0.9;

				normal_dist_draw_line(
					x + (width*0.8/normal_dist_slice.length)*i    , y - normal_dist_slice[i],
					x + (width*0.8/normal_dist_slice.length)*(i+1), y - normal_dist_slice[i+1]
				);
				normal_dist_draw_line(
					x + (width*0.8/normal_dist_slice.length)*i    , y - normal_dist_slice[i],
					x + (width*0.8/normal_dist_slice.length)*(i), y 
				);


			}




			normal_dist_draw_txt('-3', width*0.1, height*0.9);
			normal_dist_draw_txt('0', width*0.5, height*0.9);
			normal_dist_draw_txt('3', width*0.885, height*0.9);





			normal_dist_cnt++;


			// clear
			if(normal_dist_cnt == 240){
				
				
				// clear
				for(var i=0; i < normal_dist_slice.length; i++){
					normal_dist_slice[i] = 0;
				}
				normal_dist_cnt = 0;
			}

		}, 1000/60);

	</script>
{{< /raw >}}

이전 블로그 내용 백업

위 예제는 가우시안 랜덤을 보여준다. 랜덤 숫자를 생성할시 대부분의 언어에서는 (0-1] 사이의 랜덤한 숫자를 뽑을수 있다. 하지만 이런 랜덤함수는 linear 한 분포의 랜덤값을 뿌리게 된다. 

Box-muller transform 을 이용하면 정규분포를 따르는 랜덤값을 생성 가능하다. 


```javascript
	function box_muller_generator(){
		var x1 = Math.random();
		var x2 = Math.random();

		var u1 = Math.sqrt(-2 * Math.log(x1)) 
				* Math.cos(2 * Math.PI * x2);
		var u2 = Math.sqrt(-2 * Math.log(x1)) 
				* Math.sin(2 * Math.PI * x2);
		return u1;
	}
```