/* CRT 터미널: 대화를 옛날 CRT 화면에서 재생한다.
 * 원본: 이 파일 (blog/static/static/js/crt-terminal.js). 데모는 blog/static/embeds/crt-terminal.html
 * 사용: CRT.mount(el, [{role:'user'|'ai'|'sys', text}]) 또는 <div class="crt"><div class="crt-src">…</div></div>
 * chatlog 숏코드에서는 static/js/chatlog.js가 필요할 때 이 파일을 불러온다. */
(function(){
'use strict';
if (window.__crtTerm) return; window.__crtTerm = true;
window.CRT_SPINNERS = null; // (아래에서 채움)

// col: 인광 색, k: 화면 휘어짐, tau: 잔상 시간(초), vfd: 형광표시관 모드(주사선 대신 메쉬, 평평한 유리)
var THEMES = {
  amber:{col:[1.0,0.62,0.10],k:0.20,tau:0.11,vfd:0},
  green:{col:[0.25,1.0,0.42],k:0.20,tau:0.14,vfd:0},
  white:{col:[0.80,0.87,1.0],k:0.20,tau:0.09,vfd:0},
  vfd:  {col:[0.32,0.86,1.0],k:0.05,tau:0.04,vfd:1}
};
// data-theme이 없으면 data-title로 추정
function guessTheme(title){
  if(/claude|anthropic/i.test(title))return 'amber';
  if(/gpt|openai|codex|o\d-/i.test(title))return 'vfd';
  return 'green';
}
var FONT = '"GalmuriMono11","GalmuriMono9","D2Coding",ui-monospace,monospace';
/* thinking 스피너: iv(ms)마다 f(경과ms, 프레임번호) → [[텍스트, 밝기], ...] */
function fr(str,k){var a=Array.from(str);return a[k%a.length];}
function hsh(a,b){var x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x);}
var SPINNERS = {
  classic: {iv:90,  f:function(t,k){return [[fr('|/-\\',k),1],[' thinking',.5]];}},
  braille: {iv:80,  f:function(t,k){return [[fr('⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏',k),1],[' thinking',.5]];}},
  orbit:   {iv:100, f:function(t,k){return [[fr('⣾⣽⣻⢿⡿⣟⣯⣷',k),1],[' thinking',.5]];}},
  moon:    {iv:130, f:function(t,k){return [[fr('◐◓◑◒',k),1],[' thinking',.5]];}},
  wave:    {iv:70,  f:function(t,k){var w='▁▂▃▄▅▆▇█▇▆▅▄▃▂';return [[fr(w,k)+fr(w,k+3)+fr(w,k+6),.7],[' thinking',.5]];}},
  dots:    {iv:380, f:function(t,k){return [['thinking'+'...'.slice(0,k%4),.55]];}},
  bounce:  {iv:70,  f:function(t,k){var n=6,p=k%(n*2);if(p>=n)p=n*2-p-1;
             return [['[',.5],[' '.repeat(p)+'==='+' '.repeat(n-1-p),1],[']',.5],[' thinking',.5]];}},
  // 밝은 하이라이트가 글자 위를 훑고 지나감
  shimmer: {iv:50,  f:function(t,k){var txt='Thinking…',a=Array.from(txt),pos=((t/55)%(a.length+8))-4,out=[[fr('·+*+',Math.floor(t/150))+' ',.9]];
             a.forEach(function(c,i){var d=i-pos;out.push([c,.32+.68*Math.exp(-d*d/2.5)]);});return out;}},
  // 무작위 글자가 THINKING으로 풀렸다가 다시 흩어짐
  scramble:{iv:50,  f:function(t,k){var tg='THINKING',g='!<>-_\\/[]{}=+*^?#%&@',c=t%1800,s='';
             for(var i=0;i<tg.length;i++){var on=c>150+i*90&&c<1500-(tg.length-i)*40;
               s+=on?tg[i]:g[Math.floor(hsh(k,i)*g.length)];}
             return [[s,.8]];}},
  elapsed: {iv:100, f:function(t,k){return [[fr('⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏',k),1],[' thinking ',.5],[(t/1000).toFixed(1)+'s',.75]];}},
  cursor:  null   // 스피너 없이 커서만 깜빡임
};
window.CRT_SPINNERS = SPINNERS;
var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

/* ---------------- 셰이더 ---------------- */
var VS = '#version 300 es\nin vec2 aP;void main(){gl_Position=vec4(aP,0.,1.);}';

// 인광 잔상: 새 프레임과 (감쇠된) 이전 프레임 중 밝은 쪽
var FS_PERSIST = '#version 300 es\nprecision highp float;\n' +
'uniform sampler2D uCur;uniform sampler2D uPrev;uniform vec2 uRes;uniform float uDecay;out vec4 o;\n' +
'void main(){vec2 uv=gl_FragCoord.xy/uRes;float c=texture(uCur,uv).r;' +
'float p=texture(uPrev,uv).r*uDecay-0.004;o=vec4(vec3(max(c,p)),1.);}';

var FS_CRT = '#version 300 es\nprecision highp float;\n' +
'uniform sampler2D uTex;uniform vec2 uOut;uniform vec2 uSrc;uniform float uTime;uniform vec3 uCol;uniform float uMotion;uniform float uDpr;uniform float uK;uniform float uVfd;out vec4 o;\n' +
'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n' +
// 배럴 왜곡 (가장자리에 베젤이 살짝 보이도록 1.02배)
'vec2 warp(vec2 q){vec2 c=q-.5;float k=uK;return .5+c*(1.+k*dot(c,c))*1.02/(1.+k*.25);}\n' +
'vec3 row(float r,float ux,float ca){float v=(r+.5)/uSrc.y;' +
'return vec3(texture(uTex,vec2(ux+ca,v)).r,texture(uTex,vec2(ux,v)).r,texture(uTex,vec2(ux-ca,v)).r);}\n' +
// 밝을수록 빔이 굵어지는 가우시안 빔 프로파일
'vec3 beam(vec3 l,float d){vec3 w=mix(vec3(.30),vec3(.56),l);return exp(-d*d/(2.*w*w));}\n' +
'void main(){\n' +
' vec2 q=gl_FragCoord.xy/uOut; vec2 uv=warp(q);\n' +
' uv.x+=(hash(vec2(floor(uv.y*uSrc.y),floor(uTime*24.)))-.5)*.0007*uMotion;\n' +
' float u=uv.x*uSrc.x; float fu=fract(u); u=floor(u)+.5+clamp((fu-.5)*2.,-.5,.5); float ux=u/uSrc.x;\n' +
' vec3 L;\n' +
' if(uVfd>.5){\n' +
// VFD: 픽셀 그대로 또렷하게 + 앞유리의 가는 메쉬 그리드
'  float l=texture(uTex,vec2(ux,(floor(uv.y*uSrc.y)+.5)/uSrc.y)).r;\n' +
'  vec2 g=fract(gl_FragCoord.xy/(uDpr*3.));\n' +
'  float mesh=.80+.20*sqrt(min(sin(g.x*3.1416),sin(g.y*3.1416)));\n' +
'  L=vec3(l*mesh*1.3);\n' +
' }else{\n' +
'  float ca=(uv.x-.5)*1.3/uSrc.x;\n' +
'  float fy=uv.y*uSrc.y-.5; float r0=floor(fy); float t=fy-r0;\n' +
'  vec3 a=row(r0,ux,ca), b=row(r0+1.,ux,ca);\n' +
'  L=(a*beam(a,t)+b*beam(b,1.-t))*1.35;\n' +
' }\n' +
' float lb=log2(max(uSrc.y/360.,.5));\n' +
' float bl=textureLod(uTex,uv,1.5+lb).r*.35+textureLod(uTex,uv,3.+lb).r*.45+textureLod(uTex,uv,4.5+lb).r*.55;\n' +
' vec3 col=uCol*L + uCol*bl*(.55+.2*uVfd) + vec3(pow(L.g,3.))*.28;\n' +
' col+=uCol*.022;\n' +
' float by=1.-fract(uTime*.085)*1.3; col+=uCol*exp(-pow((uv.y-by)*9.,2.))*.035*uMotion;\n' +
' col*=1.+uMotion*(.012*sin(uTime*120.)+.025*(hash(vec2(floor(uTime*20.),3.))-.5));\n' +
' col+=(hash(gl_FragCoord.xy+fract(uTime*7.)*391.)-.5)*.045*(uMotion*.7+.3);\n' +
' float m=mod(gl_FragCoord.x/uDpr,3.);\n' +
' col*=mix(vec3(1.),vec3(m<1.?1.:.8,(m>=1.&&m<2.)?1.:.8,m>=2.?1.:.8),.55*(1.-uVfd));\n' +
' vec2 vv=uv*(1.-uv.yx); col*=pow(clamp(vv.x*vv.y*16.,0.,1.),.25);\n' +
' vec2 e=smoothstep(vec2(0.),vec2(.004),uv)*smoothstep(vec2(0.),vec2(.004),1.-uv);\n' +
' vec2 dout=max(max(-uv,uv-1.),0.);\n' +
' vec3 bez=vec3(.026,.026,.029)+uCol*textureLod(uTex,clamp(uv,0.,1.),5.+lb).r*.28*exp(-length(dout)*55.);\n' +
' o=vec4(clamp(mix(bez,col,e.x*e.y),0.,1.),1.);\n' +
'}';

function mkGL(canvas){
  var gl = canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false});
  if (!gl) return null;
  function sh(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  function prog(fs){var p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,VS));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));
    gl.bindAttribLocation(p,0,'aP');gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
    var u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
    for(var i=0;i<n;i++){var nm=gl.getActiveUniform(p,i).name;u[nm]=gl.getUniformLocation(p,nm);}
    return {p:p,u:u};}
  function tex(mip){var t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mip?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
  var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  return { gl:gl, persist:prog(FS_PERSIST), crt:prog(FS_CRT), cur:tex(false), acc:[tex(true),tex(true)],
           fbo:[gl.createFramebuffer(),gl.createFramebuffer()], src:0 };
}

function dedent(s){
  var ls=s.replace(/\r/g,'').split('\n');
  while(ls.length&&!ls[0].trim())ls.shift();
  while(ls.length&&!ls[ls.length-1].trim())ls.pop();
  var ind=Infinity;
  ls.forEach(function(l){if(l.trim())ind=Math.min(ind,l.match(/^[ \t]*/)[0].length);});
  if(ind===Infinity)ind=0;
  return ls.map(function(l){return l.slice(ind);}).join('\n');
}

/* 한글 음절을 입력 중간 단계로 쪼갬: 한 → ㅎ, 하, 한 */
function hangulSteps(ch){
  var c=ch.charCodeAt(0)-0xAC00;
  if(c<0||c>11171)return [ch];
  var L=Math.floor(c/588),V=Math.floor((c%588)/28),T=c%28;
  var s=[CHO[L],String.fromCharCode(0xAC00+L*588+V*28)];
  if(T)s.push(ch);
  return s;
}

function Term(el,script){
  var self=this;
  this.el=el;
  var src=el.querySelector('.crt-src');
  this.script=script||[].slice.call(src?src.children:[]).map(function(n){
    return {role:(n.getAttribute('data-role')||'ai'),text:dedent(n.textContent)};
  }).filter(function(s){return s.text;});
  this.title=el.getAttribute('data-title')||'TERMINAL';
  this.theme=THEMES[el.getAttribute('data-theme')]||THEMES[guessTheme(this.title)];
  this.color=this.theme.col;
  this.scroll=0;this.maxScroll=0;this.total=0;this.wacc=0;
  this.speed=parseFloat(el.getAttribute('data-speed'))||1;
  this.fontPx=parseFloat(el.getAttribute('data-font-size'))||11;
  var sn=el.getAttribute('data-spinner')||'braille';
  this.spinner=sn in SPINNERS?SPINNERS[sn]:SPINNERS.braille;
  this.keepThought=el.getAttribute('data-thought')==='keep';           // 생각 끝난 뒤 '● thought for 1.4s' 남김
  this.thinkMs=parseFloat(el.getAttribute('data-think'))||1150;        // 평균 생각 시간(ms)
  this.loopMs=parseFloat(el.getAttribute('data-loop'))||0;             // 끝나고 n ms 뒤 자동 반복
  this.reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.entries=[];this.mcache=new Map();this.runId=0;this.tokens=0;this.status='IDLE';
  this.dirty=true;this.lastMut=0;this.done=false;this.started=false;this.visible=false;

  this.txt=document.createElement('canvas');
  this.ctx=this.txt.getContext('2d');
  this.out=document.createElement('canvas');
  this.out.setAttribute('aria-hidden','true');
  el.appendChild(this.out);
  try{this.g=mkGL(this.out);}catch(e){console.warn('[crt] WebGL2 실패, 2D로 대체',e);this.g=null;}
  if(!this.g){ // WebGL2 없으면 색만 입힌 2D 캔버스
    el.removeChild(this.out);this.out=this.txt;
    this.txt.setAttribute('aria-hidden','true');this.txt.style.imageRendering='pixelated';
    el.appendChild(this.txt);
  }
  el.classList.add('crt-on');
  if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','0');
  el.setAttribute('role','button');
  el.setAttribute('aria-label','대화 재생: 클릭하면 건너뛰기 또는 다시 재생, 휠·방향키로 스크롤');

  this._frame=function(t){self.frame(t);};
  function act(){
    if(!self.started)return;
    if(self.done)self.play();
    else{self.skip=true;if(self._wake)self._wake();}
  }
  el.addEventListener('click',act);

  /* 스크롤백: 휠/터치/키보드. 끝에 닿으면 페이지 스크롤로 넘겨줌 */
  function stepPx(){return Math.round(self.fontPx*1.4)*(self.px||1);}
  function consume(dy){ // dy>0: 아래로(최신 쪽)
    var dir=dy>0?-1:1;                    // scroll은 맨 아래에서부터 올라간 줄 수
    if(dir>0&&self.scroll>=self.maxScroll)return false;
    if(dir<0&&self.scroll<=0)return false;
    self.wacc+=dy;var st=stepPx(),moved=false;
    while(Math.abs(self.wacc)>=st){
      var d=self.wacc>0?-1:1;self.wacc-=self.wacc>0?st:-st;
      var ns=Math.max(0,Math.min(self.maxScroll,self.scroll+d));
      if(ns!==self.scroll){self.scroll=ns;moved=true;}
    }
    if(moved)self.dirty=true;
    return true;
  }
  el.addEventListener('wheel',function(e){
    var dy=e.deltaY*(e.deltaMode===1?stepPx():e.deltaMode===2?stepPx()*10:1);
    if(consume(dy))e.preventDefault();
  },{passive:false});
  var ty=null;
  el.addEventListener('touchstart',function(e){ty=e.touches[0].clientY;},{passive:true});
  el.addEventListener('touchmove',function(e){
    if(ty===null)return;var y=e.touches[0].clientY;
    if(consume(ty-y))e.preventDefault();
    ty=y;
  },{passive:false});
  el.addEventListener('touchend',function(){ty=null;});
  el.addEventListener('keydown',function(e){
    var rows=self.rows||10,map={ArrowUp:-1,ArrowDown:1,PageUp:-rows,PageDown:rows};
    if(e.key in map){if(consume(map[e.key]*stepPx()))e.preventDefault();}
    else if(e.key==='End'){self.scroll=0;self.dirty=true;e.preventDefault();}
    else if(e.key==='Home'){self.scroll=self.maxScroll;self.dirty=true;e.preventDefault();}
  });
  el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}});
  if(window.ResizeObserver)new ResizeObserver(function(){self.resize();}).observe(el);
  else window.addEventListener('resize',function(){self.resize();});
  this.resize();
}

Term.prototype.resize=function(){
  var r=this.el.getBoundingClientRect();
  if(!r.width||!r.height)return;
  var dpr=Math.min(window.devicePixelRatio||1,2);
  var px=parseFloat(this.el.getAttribute('data-pixel'))||Math.max(1,Math.min(2,r.width/480));
  this.px=px;
  var tw=Math.round(r.width/px),th=Math.round(r.height/px);
  if(tw===this.tw&&th===this.th&&dpr===this.dpr)return;
  this.tw=tw;this.th=th;this.dpr=dpr;
  this.txt.width=tw;this.txt.height=th;
  this.mcache.clear();
  if(this.g){
    this.ow=Math.round(r.width*dpr);this.oh=Math.round(r.height*dpr);
    this.out.width=this.ow;this.out.height=this.oh;
    var gl=this.g.gl;
    for(var i=0;i<2;i++){
      gl.bindTexture(gl.TEXTURE_2D,this.g.acc[i]);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,tw,th,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.g.fbo[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.g.acc[i],0);
      gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  this.dirty=true;
  if(this.visible)this.loop();
};

Term.prototype.mw=function(s){
  var w=this.mcache.get(s);
  if(w===undefined){w=this.ctx.measureText(s).width;this.mcache.set(s,w);}
  return w;
};

Term.prototype.wrap=function(text,maxW){
  var out=[],self=this;
  text.split('\n').forEach(function(para){
    var toks=para.match(/\S+|\s+/g)||[''],line='',w=0;
    toks.forEach(function(tk){
      var tw=self.mw(tk);
      if(w+tw<=maxW){line+=tk;w+=tw;return;}
      if(/^\s+$/.test(tk)){out.push(line);line='';w=0;return;}
      if(tw<=maxW){out.push(line.replace(/\s+$/,''));line=tk;w=tw;return;}
      Array.from(tk).forEach(function(ch){
        var cw=self.mw(ch);
        if(w+cw>maxW&&line){out.push(line);line='';w=0;}
        line+=ch;w+=cw;
      });
    });
    out.push(line);
  });
  return out;
};

Term.prototype.ink=function(v){
  if(this.g){var g=Math.round(v*255);return 'rgb('+g+','+g+','+g+')';}
  var c=this.color;
  return 'rgb('+Math.round(c[0]*v*255)+','+Math.round(c[1]*v*255)+','+Math.round(c[2]*v*255)+')';
};

Term.prototype.draw=function(){
  var ctx=this.ctx,W=this.tw,H=this.th,fs=this.fontPx,lh=Math.round(fs*1.4),self=this;
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  ctx.font=fs+'px '+FONT;ctx.textBaseline='top';
  var padX=Math.round(W*0.075),padY=Math.round(H*0.09),maxW=W-padX*2;
  var LUM={user:0.74,ai:1.0,sys:0.55};

  var lines=[],cursor=null,n=this.entries.length;
  this.entries.forEach(function(e,i){
    if(i>0&&!e.idle)lines.push(null);
    var pre=e.role==='user'?'> ':'',preW=self.mw(pre),lum=LUM[e.role]||1;
    if(e.thinking){
      if(self.spinner){lines.push({segs:self.spinSegs||[]});return;}
      lines.push({pre:'',text:'',x:0,lum:1});
      if(i===n-1&&self.curOn)cursor={line:lines.length-1,x:padX};
      return;
    }
    if(e.thought)lines.push({pre:'',text:e.thought,x:0,lum:0.38});
    var wr=self.wrap(e.text,maxW-preW);
    wr.forEach(function(s,j){lines.push({pre:j?'':pre,text:s,x:preW,lum:lum});});
    if(i===n-1&&self.curOn){
      var last=lines[lines.length-1];
      cursor={line:lines.length-1,x:padX+preW+self.mw(last.text)};
    }
  });

  var rows=Math.max(1,Math.floor((H-padY*2)/lh));
  // 위로 올려 보는 중에 새 줄이 생기면 보던 위치를 그대로 유지
  if(this.scroll>0&&lines.length>this.total)this.scroll+=lines.length-this.total;
  this.total=lines.length;this.rows=rows;
  this.maxScroll=Math.max(0,lines.length-rows);
  this.scroll=Math.max(0,Math.min(this.maxScroll,this.scroll));
  var start=this.maxScroll-this.scroll;
  for(var i=start;i<Math.min(lines.length,start+rows);i++){
    var L=lines[i];if(!L)continue;
    var y=padY+(i-start)*lh;
    if(L.segs){
      var sx=padX;
      for(var q=0;q<L.segs.length;q++){ctx.fillStyle=this.ink(L.segs[q][1]);ctx.fillText(L.segs[q][0],Math.round(sx),y);sx+=this.mw(L.segs[q][0]);}
      continue;
    }
    ctx.fillStyle=this.ink(L.lum);
    if(L.pre)ctx.fillText(L.pre,padX,y);
    ctx.fillText(L.text,Math.round(padX+L.x),y);
  }
  if(this.maxScroll>0){ // 스크롤바
    var trackY=padY,trackH=rows*lh,bx=W-Math.round(padX*0.45);
    var th2=Math.max(6,Math.round(trackH*rows/lines.length));
    var ty2=trackY+Math.round((trackH-th2)*(start/this.maxScroll));
    ctx.fillStyle=this.ink(0.12);ctx.fillRect(bx,trackY,2,trackH);
    ctx.fillStyle=this.ink(this.scroll>0?0.7:0.35);ctx.fillRect(bx-1,ty2,4,th2);
  }
  if(cursor&&cursor.line>=start&&cursor.line<start+rows){
    ctx.fillStyle=this.ink(0.95);
    ctx.fillRect(Math.round(cursor.x),padY+(cursor.line-start)*lh,Math.round(this.mw('M')),fs+1);
  }

  // 상태 표시줄
  ctx.fillStyle=this.ink(0.36);
  var ty=Math.round(padY*0.42)-2,by=H-Math.round(padY*0.42)-fs+2;
  ctx.textAlign='left';
  ctx.fillText(this.title.toUpperCase(),padX,ty);
  ctx.fillText('TOK '+String(this.tokens).padStart(4,'0'),padX,by);
  ctx.textAlign='right';
  ctx.fillText((this.status==='STREAMING'&&this.curOn?'● ':'')+this.status,W-padX,ty);
  var hint='';
  if(this.scroll>0)hint='SCROLL -'+this.scroll+'  [END]';
  else if(this.started)hint=(this.maxScroll>0?'WHEEL: SCROLL  ':'')+(this.done?'CLICK: REPLAY':'CLICK: SKIP');
  ctx.fillText(hint,W-padX,by);
  ctx.textAlign='left';
};

Term.prototype.render=function(time,dt){
  var g=this.g,gl=g.gl,s=g.src,d=1-s;
  var tau=this.reduce?0.02:this.theme.tau;
  // 1) 잔상 패스
  gl.bindFramebuffer(gl.FRAMEBUFFER,g.fbo[d]);
  gl.viewport(0,0,this.tw,this.th);
  gl.useProgram(g.persist.p);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,g.cur);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,g.acc[s]);
  gl.uniform1i(g.persist.u.uCur,0);gl.uniform1i(g.persist.u.uPrev,1);
  gl.uniform2f(g.persist.u.uRes,this.tw,this.th);
  gl.uniform1f(g.persist.u.uDecay,Math.exp(-dt/tau));
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindTexture(gl.TEXTURE_2D,g.acc[d]);gl.generateMipmap(gl.TEXTURE_2D);
  // 2) CRT 패스
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,this.ow,this.oh);
  gl.useProgram(g.crt.p);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,g.acc[d]);
  var u=g.crt.u;
  gl.uniform1i(u.uTex,0);
  gl.uniform2f(u.uOut,this.ow,this.oh);gl.uniform2f(u.uSrc,this.tw,this.th);
  gl.uniform1f(u.uTime,time%1000);gl.uniform3fv(u.uCol,this.color);
  gl.uniform1f(u.uMotion,this.reduce?0:1);gl.uniform1f(u.uDpr,this.dpr);
  gl.uniform1f(u.uK,this.theme.k);gl.uniform1f(u.uVfd,this.theme.vfd);
  gl.drawArrays(gl.TRIANGLES,0,3);
  g.src=d;
};

Term.prototype.upload=function(){
  var gl=this.g.gl;
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.g.cur);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.txt);
};

Term.prototype.loop=function(){if(!this.raf)this.raf=requestAnimationFrame(this._frame);};

Term.prototype.frame=function(now){
  this.raf=0;
  if(!this.visible||!this.tw)return;
  this.raf=requestAnimationFrame(this._frame);
  var dt=Math.min(0.1,(now-(this.lt||now))/1000);this.lt=now;
  var sk='';
  if(this.thinkEntry&&this.spinner){
    var el=now-this.thinkEntry.t0,k=Math.floor(el/this.spinner.iv);
    if(k!==this.spinK){this.spinK=k;this.spinSegs=this.spinner.f(el,k);}
    sk=k;
  }
  var cur=(now-this.lastMut<450)||Math.floor(now/530)%2===0;
  var key=sk+'|'+cur;
  if(this.dirty||key!==this.key){
    this.key=key;this.dirty=false;this.curOn=cur;
    this.draw();if(this.g)this.upload();
  }
  if(this.g)this.render(now/1000,dt);
};

Term.prototype.mut=function(){this.dirty=true;this.lastMut=performance.now();};

Term.prototype.sleep=function(ms,id){
  var self=this;
  if(this.skip||id!==this.runId)return Promise.resolve();
  return new Promise(function(r){self._wake=r;setTimeout(r,ms/self.speed);});
};

Term.prototype.typeHuman=async function(e,text,id){
  var cs=Array.from(text),base='';
  for(var i=0;i<cs.length;i++){
    if(id!==this.runId)return;
    if(this.skip){e.text=text;this.mut();return;}
    var steps=hangulSteps(cs[i]);
    for(var k=0;k<steps.length;k++){
      e.text=base+steps[k];this.mut();
      await this.sleep(k<steps.length-1?16+Math.random()*22:30+Math.random()*55,id);
      if(this.skip)break;
    }
    base+=cs[i];
    if(cs[i]===' ')await this.sleep(30,id);
    if(Math.random()<0.03)await this.sleep(200+Math.random()*300,id);
  }
  e.text=text;this.mut();
};

Term.prototype.stream=async function(e,text,id){
  var cs=Array.from(text),i=0;
  while(i<cs.length){
    if(id!==this.runId)return;
    if(this.skip){this.tokens+=Math.ceil((cs.length-i)/2.5);e.text=text;this.mut();return;}
    var hangul=/[ㄱ-힣]/.test(cs[i]);
    var n=hangul?1+(Math.random()<0.45?1:0):2+Math.floor(Math.random()*4);
    var chunk=cs.slice(i,i+n).join('');
    var nl=chunk.indexOf('\n');if(nl>=0)chunk=chunk.slice(0,nl+1);
    e.text+=chunk;i+=Array.from(chunk).length;this.tokens++;this.mut();
    var last=chunk[chunk.length-1],d=22+Math.random()*40;
    if(/[.!?。]/.test(last))d+=90+Math.random()*140;
    else if(/[,，:]/.test(last))d+=40+Math.random()*60;
    if(last==='\n')d+=140+Math.random()*120;
    if(Math.random()<0.025)d+=250+Math.random()*450;   // 네트워크가 잠깐 멈춘 듯한 정체
    if(Math.random()<0.18)d=4;                         // 토큰이 몰려서 도착
    await this.sleep(d,id);
  }
};

Term.prototype.play=async function(){
  var id=++this.runId;
  this.entries=[];this.thinkEntry=null;this.scroll=0;this.total=0;this.done=false;this.skip=!!this.reduce;this.tokens=0;this.status='CONNECTING';this.mut();
  await this.sleep(600,id);
  for(var k=0;k<this.script.length;k++){
    if(id!==this.runId)return;
    var s=this.script[k];
    if(s.role==='user'){
      var u={role:'user',text:''};this.entries.push(u);this.status='INPUT';this.mut();
      await this.sleep(300,id);await this.typeHuman(u,s.text,id);await this.sleep(400,id);
    }else if(s.role==='sys'){
      this.entries.push({role:'sys',text:s.text});this.mut();await this.sleep(300,id);
    }else{
      var dur=this.thinkMs*(0.6+Math.random()*0.8);
      var a={role:'ai',text:'',thinking:true,t0:performance.now()};
      this.entries.push(a);this.thinkEntry=a;this.spinK=-1;this.status='THINKING';this.mut();
      await this.sleep(dur,id);
      a.thinking=false;this.thinkEntry=null;this.status='STREAMING';
      if(this.keepThought)a.thought='\u25CF thought for '+(dur/this.speed/1000).toFixed(1)+'s';
      await this.stream(a,s.text,id);await this.sleep(450,id);
    }
  }
  if(id!==this.runId)return;
  this.entries.push({role:'user',text:'',idle:true});
  this.done=true;this.status='READY';this.mut();
  if(this.loopMs){var self=this;setTimeout(function(){if(id===self.runId&&self.done)self.play();},this.loopMs);}
};

var GALMURI='https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/galmuri.css';
var all=[],io=null,fontReady=null;
function observe(el){
  if(!io)io=new IntersectionObserver(function(es){
    es.forEach(function(en){
      var t=en.target.__crt;if(!t)return;
      t.visible=en.isIntersecting;
      if(t.visible){
        if(!t.started&&en.intersectionRatio>=0.35){t.started=true;t.play();}
        t.loop();
      }
    });
  },{threshold:[0,0.35,0.6]});
  io.observe(el);
}
function fonts(){
  if(fontReady)return fontReady;
  if(!document.querySelector('link[href*="galmuri"]')){
    var l=document.createElement('link');l.rel='stylesheet';l.href=GALMURI;document.head.appendChild(l);
  }
  var fl=document.fonts&&document.fonts.load?document.fonts.load('11px "GalmuriMono11"','가A').catch(function(){}):Promise.resolve();
  if(document.fonts&&document.fonts.addEventListener)
    document.fonts.addEventListener('loadingdone',function(){
      all.forEach(function(t){t.mcache.clear();t.dirty=true;});
    });
  fontReady=Promise.race([fl,new Promise(function(r){setTimeout(r,2500);})]);
  return fontReady;
}
function mount(el,script){
  return fonts().then(function(){
    if(!el.__crt){el.__crt=new Term(el,script);all.push(el.__crt);observe(el);}
    return el.__crt;
  });
}
window.CRT={mount:mount,themes:THEMES,spinners:SPINNERS};

function boot(){
  // 원문(.crt-src)을 품은 것만 자동으로. 나머지는 CRT.mount로 대본을 넘겨받는다.
  [].slice.call(document.querySelectorAll('.crt:not(.crt-on)')).forEach(function(el){
    if(el.querySelector('.crt-src'))mount(el);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
