---
title: "Cut_Water"
date: 2013-07-21T00:10:41+09:00
draft: false
toc : false
tocBorder : true
---


사랑싸움은 칼로 물베기


{{< raw >}}
<canvas id="cut_water_canvas" width="660" height="480"></canvas>
<script>
cut_water = {
	init: function(canvasElem){
		this.canvas = canvasElem;
		this.ctx = canvasElem.getContext('2d');
		this.w = canvasElem.width;
		this.h = canvasElem.height;

		this.points = [];

		// set sensitiviy
		this.sensitivity = 1.2;

		this.mouseX = 0;
		this.mouseY = 0;

		var xstep = 6;
		var ystep = 12;

		console.log(this.w + ", " +this.h)

		var heart_str = new Array(23);

		heart_str[0 ] = "        ...e$e.$...e$                 ...e$e.$...e        ";
		heart_str[1 ] = "     !$6lkasd!$6lkasd!$6l          !$6lkasd!$6lkasd!      ";
		heart_str[2 ] = "   ;,a1wert;,a1wert;,a1wert     ;,a1wert;,a1wert;,a1we    ";
		heart_str[3 ] = " .asxzcvb.asxzcvb.asxzcvb.as   .asxzcvb.asxzcvb.asxzcvb.  ";
		heart_str[4 ] = "1qaswedfqas1wedfqas1wedfqas1wedfqas1wedfqas1edfqas1ewdfqa ";
		heart_str[5 ] = ":lkjhgfdlkj:hgfdlkj:hgfdlkj:hgfdlkj:hgfdlkj:gfdhlkj:gfdhlk";
		heart_str[6 ] = "3edcvfr4edc3vfr4edc3vfr4edc3vfr4edc3vfr4edc3fr4vedc3fr4ved";
		heart_str[7 ] = "1234ewqa2341ewqa2341ewqa2341ewqa2341ewqa2341wqa2341weqa234";
		heart_str[8 ] = "o[piuytr[piouytr[piouytr[piouytr[piouytr[pioytru[pioytru[p";
		heart_str[9 ] = "z/xcvbnm/xczvbnm/xczvbnm/xczvbnm/xczvbnm/xczbnmv/xczbnmv/x";
		heart_str[10] = " `1qazxs`1qazxs`1wqazs`1wqazxs`1qazwxs1qa`zws1qa`zwsx1qa` ";
		heart_str[11] = "  mznxbcvfmznxbcvfmzxbcnvfzxbmcnfzxvbmnfzcxvbmnfzcxvbmnf  ";
		heart_str[12] = "   %t^y&ujm%t^y&ujm%^y&tuj%^ym&tu%^yj&tum%^yj&tum%^yj&t   ";
		heart_str[13] = "     )oiuytre)oiuytr)oieuyr)otieur)oyieutr)oyieutr)oyi    ";
		heart_str[14] = "      z.xcvgy7z.xcvg7z.yxcg7zv.yxc7zv.ygxc7zv.ygxc7z      ";
		heart_str[15] = "        q[wertyuq[weryuq[wertyuq[wetyurq[wetyurq[w        ";
		heart_str[16] = "           a;sdfghja;sdfghja;sdfghja;sdfghja;sdf          ";
		heart_str[17] = "              qmprootiqmprootimprootqimproot              ";
		heart_str[18] = "                 mtu1qaz@mtu1qa@mtuz1qa@m                 ";
		heart_str[19] = "                    !qwe$rty!qwe$rty!q                    ";
		heart_str[20] = "                       -p=oiuyt-p=o                       ";
		heart_str[21] = "                           asdfg                          ";
		heart_str[22] = "                             l                            ";

		// set points heart shape
		var colors = ['#A3A692','#F2C288','#F2AD85','#F2887E','#F25757','#F25757'];


		for(var i=0; i < heart_str.length; i++){
			
			var str = heart_str[i];

			for(var j=0; j < str.length; j++){

				var x = (this.w/2 - xstep*str.length/2) + xstep * j;
				var y = (this.h/2 - ystep*heart_str.length/2) + ystep * i;

				if(str.substr(j,1) != " "){
					this.points.push({
						ox: x,
						oy: y,
						x: x,
						y: y,
						color: colors[parseInt(Math.random() * colors.length)]
					});
				}

			}
		}

		this.canvas.addEventListener('mousemove', this.mouse_move, false);
	},
	mouse_move: function(e){
		cut_water.mouseX = e.offsetX || e.pageX - cut_water.canvas.parentNode.offsetLeft;
		cut_water.mouseY = e.offsetY || e.pageY - cut_water.canvas.parentNode.offsetTop;

	},
	update_points: function(){
		for(var i=0; i < this.points.length; i++){
			var pnt = this.points[i];
			var theta = Math.atan2(pnt.y - this.mouseY, pnt.x - this.mouseX			);
			var amtX = this.mouseX - pnt.x;
			var amtY = this.mouseY - pnt.y;
			var distance = Math.min( this.sensitivity * 100 / 
			      Math.sqrt(amtX*amtX + amtY*amtY) , 130);

			pnt.x += Math.cos(theta) * distance 
				+ (pnt.ox - pnt.x)*0.05;
			pnt.y += Math.sin(theta) * distance 
				+ (pnt.oy - pnt.y)*0.05;

		}

	},
	draw_points: function(){
		for(var i=0; i < this.points.length; i++){
			var pnt = this.points[i];
			this.draw_point(pnt.x, pnt.y, pnt.color);
		}
	},
	draw_point: function(x,y, color){
		this.ctx.fillStyle = color;
		this.ctx.beginPath();
		//this.ctx.arc(x, y, 3, 0, Math.PI*2, true);
		this.ctx.rect(x,y,4,8);
		this.ctx.closePath();
		this.ctx.fill();		
	},
	draw: function(){
		this.canvas.width = this.canvas.width;
		this.draw_points();
		this.update_points();
	}

};
var cut_water_canvas= document.getElementById('cut_water_canvas');
cut_water.init(cut_water_canvas);
setInterval(function(){
	cut_water.draw();
}, 1000/60);
</script>
{{< /raw >}}