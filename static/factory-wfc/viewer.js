import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {EffectComposer} from './vendor/EffectComposer.js';
import {RenderPass} from './vendor/RenderPass.js';
import {BokehPass} from './vendor/BokehPass.js';
import {OutputPass} from './vendor/OutputPass.js';
import {generateLayout,validateAssetPorts,ASSET_IDS} from './layout.js';

const template = document.createElement('template');
template.innerHTML = `<style>
:host{display:block;contain:content;width:100%;font:14px system-ui,sans-serif;color:#e6eee7;--accent:#d2e79c}*{box-sizing:border-box}.frame{border-radius:10px;overflow:hidden;border:1px solid #42525b;background:#202c34}.stage{height:var(--factory-height,520px);min-height:300px;position:relative;background:#b1bec1}.stage canvas{display:block;width:100%;height:100%;touch-action:pan-y}.badge{position:absolute;top:16px;left:18px;color:#31444d;font:12px monospace;pointer-events:none}.loading{position:absolute;inset:0;display:grid;place-items:center;background:#b1bec1dd;color:#263e48;padding:24px;text-align:center}.loading[hidden]{display:none}form{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 14px;margin:0}label{font:12px monospace;color:#bdccd0}input,button{font:inherit;border-radius:5px;height:36px;border:1px solid #4b5c65}input{width:150px;min-width:70px;flex:1;background:#18232a;color:#eef3e8;padding:0 10px}button{background:var(--accent);color:#263522;padding:0 13px;cursor:pointer;font-weight:600}button.secondary{background:#30404a;color:#dce7e3}button:disabled{opacity:.5;cursor:wait}:focus-visible{outline:2px solid #769d37;outline-offset:3px}.status{padding:0 14px 12px;font-size:12px;line-height:1.5;color:#adbec4} @media(max-width:480px){.stage{height:var(--factory-height,410px)}form{gap:6px}button{padding:0 9px;font-size:12px}}
</style><div class="frame"><div class="stage"><canvas aria-label="공장 배치. 드래그 회전, 확대 축소, Shift 드래그 이동" tabindex="0"></canvas><div class="badge">WFC / 30 × 24 m / 1F</div><div class="loading" role="status">공장 모델을 불러오는 중…</div></div><form><label for="seed">SEED</label><input id="seed" maxlength="48" aria-label="공장 배치 시드" required><button type="submit" disabled>배치 생성</button><button class="secondary" type="button" data-random disabled>다른 시드</button></form><div class="status" aria-live="polite">드래그 회전 · 스크롤 확대 · 시드를 바꿔도 시점 유지</div></div>`;
export class FactoryWFC extends HTMLElement {
 connectedCallback(){if(this._started)return;this._started=true;this.attachShadow({mode:'open'}).append(template.content.cloneNode(true));this.ready=mount(this).then(api=>(this._api=api,api)).catch(error=>{this.shadowRoot.querySelector('.loading').textContent='불러오기 실패: '+error.message;throw error;});this.ready.catch(console.error);}
 disconnectedCallback(){this._api?.pause();}
 async generate(seed){return (await this.ready).generate(seed);}
 async getView(){return (await this.ready).getView();}
 async setView(view){return (await this.ready).setView(view);}
}
if(!customElements.get('factory-wfc'))customElements.define('factory-wfc',FactoryWFC);
async function mount(host){
 const root=host.shadowRoot,viewport=root.querySelector('.stage'),canvas=root.querySelector('canvas'),form=root.querySelector('form'),seedInput=root.querySelector('input'),buttons=[...root.querySelectorAll('button')],loading=root.querySelector('.loading'),status=root.querySelector('.status');
 const url=path=>new URL(path,import.meta.url);
 const manifest=await fetch(url('asset-manifest.json')).then(r=>{if(!r.ok)throw Error('모델 명세 HTTP '+r.status);return r.json();});
 let renderer,camera,controls,scene,library,layout,building,walls,grid,composer,bokeh,sun;
 let mixers=[],ownedGeometry=[],ownedMaterials=[],ownedTextures=[];const shellMaterials={};let busy=false,visible=true;
 const vector=(name,fallback)=>{const a=(host.getAttribute(name)||'').split(',').map(Number);return a.length===3&&a.every(Number.isFinite)?a:fallback;};
 const initial={position:vector('camera',[24,13,29]),target:vector('target',[0,1,0]),focus:vector('focus',[0,1,0]),dof:Math.min(100,Math.max(0,Number(host.getAttribute('dof')??65)))};
 const focusPoint=new THREE.Vector3().fromArray(initial.focus),direction=new THREE.Vector3();
function box(parent,material,x,y,z,w,h,d){const geometry=new THREE.BoxGeometry(w,h,d),uv=geometry.attributes.uv,p=geometry.attributes.position,n=geometry.attributes.normal;
 if(material.map){for(let i=0;i<uv.count;i++){const px=p.getX(i)+x,py=p.getY(i)+y,pz=p.getZ(i)+z;if(Math.abs(n.getY(i))>.5)uv.setXY(i,px/4.2,pz/4.2);else if(Math.abs(n.getX(i))>.5)uv.setXY(i,pz/4.2,py/4.2);else uv.setXY(i,px/4.2,py/4.2)}}
 const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);ownedGeometry.push(geometry);return mesh;
}
function textLabel(parent,text,x,y,z,w,h,floor=false){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='#d7dfce';ctx.font='bold 92px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,80,1000);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});const geometry=new THREE.PlaneGeometry(w,h);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);if(floor)mesh.rotation.x=-Math.PI/2;parent.add(mesh);ownedTextures.push(texture);ownedMaterials.push(material);ownedGeometry.push(geometry)}
function clearBuilding(){for(const {mixer,root}of mixers){mixer.stopAllAction();mixer.uncacheRoot(root)}mixers=[];if(building)scene.remove(building);ownedGeometry.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());ownedGeometry=[];ownedMaterials=[];ownedTextures=[]}
function build(result){clearBuilding();layout=result;building=new THREE.Group();scene.add(building);const W=result.width*3,D=result.depth*3,entry=(result.entryX-(result.width-1)/2)*3;
 box(building,shellMaterials.edge,0,-.23,0,W+.6,.42,D+.6);box(building,shellMaterials.floor,0,-.035,0,W,.07,D);
 walls=new THREE.Group();building.add(walls);walls.visible=true;
 box(walls,shellMaterials.wall,0,1.55,-D/2-.09,W+.18,3.1,.18);box(walls,shellMaterials.wall,-W/2-.09,1,0,.18,2,D);
 for(let x=-W/2+.15;x<W/2;x+=3){box(walls,shellMaterials.steel,x,1.64,-D/2+.05,.12,3.28,.12);box(walls,shellMaterials.glass,x+1.25,2.27,-D/2+.02,2.06,.59,.025)}
 box(walls,shellMaterials.steel,0,3.16,-D/2+.02,W+.4,.18,.23);
 for(const z of [-D/2+.12,0,D/2-.12]){box(walls,shellMaterials.steel,-W/2+.04,1.08,z,.15,2.16,.15);box(walls,shellMaterials.yellow,-W/2+.035,.5,z,.17,.7,.17)}
 box(walls,shellMaterials.wall,W/2+.06,.24,0,.12,.48,D);for(const [a,b]of [[-W/2,entry-1.6],[entry+1.6,W/2]])if(b>a)box(walls,shellMaterials.wall,(a+b)/2,.12,D/2+.06,b-a,.24,.12);
 textLabel(walls,'WORKSHOP / 01',0,2.91,-D/2+.03,4.1,.39);
 for(const z of [-D/2+4,D/2-4]){box(walls,shellMaterials.steel,0,3.48,z,W+.2,.16,.16);for(const x of [-W/2+.04,W/2-.04])box(walls,shellMaterials.steel,x,1.74,z,.16,3.48,.16);}
 // Outline all connected pedestrian lanes; adjoining aisle cells have no divider.
 for(const cell of result.cells.filter(c=>c.id==='aisle'))for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
  const neighbour=result.cells.find(c=>c.x===cell.x+dx&&c.z===cell.z+dz);
  if(neighbour?.id==='aisle'||(!neighbour&&cell.x===result.entryX&&dz===1))continue;
  box(building,shellMaterials.yellow,cell.position[0]+dx*1.43,.009,cell.position[2]+dz*1.43,dx?.065:2.88,.015,dz?.065:2.88);
 }
 for(let z=D/2-2.5;z<D/2-.5;z+=1.25)box(building,shellMaterials.marking,entry,.011,z,.045,.015,.45);
 textLabel(building,'ENTRY',entry,.024,D/2-.62,1.42,.25,true);
 const points=[];for(let x=-W/2;x<=W/2;x+=3)points.push(x,.022,-D/2,x,.022,D/2);for(let z=-D/2;z<=D/2;z+=3)points.push(-W/2,.022,z,W/2,.022,z);
 const gridGeo=new THREE.BufferGeometry();gridGeo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));const gridMat=new THREE.LineBasicMaterial({color:0xd2e79c,transparent:true,opacity:.65});grid=new THREE.LineSegments(gridGeo,gridMat);grid.visible=false;building.add(grid);ownedGeometry.push(gridGeo);ownedMaterials.push(gridMat);
 for(const cell of result.cells){if(cell.id==='aisle')continue;const index=ASSET_IDS.indexOf(cell.id);const visual=library.scenes[index].clone(true);const placement=new THREE.Group();placement.name=cell.id+'-'+cell.x+'-'+cell.z;placement.position.fromArray(cell.position);placement.rotation.y=cell.rotationY;placement.add(visual);building.add(placement);
  visual.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  if(cell.id==='robot-cell'){
   // Transfer shelf connects the cell's open +X working side to the belt edge.
   box(placement,shellMaterials.steel,1.375,.80,0,.95,.08,.65);
   for(const side of [-1,1])box(placement,shellMaterials.yellow,1.375,.865,side*.31,.95,.045,.035);
   box(placement,shellMaterials.steel,1.45,.39,0,.065,.78,.5);
   const mixer=new THREE.AnimationMixer(visual);for(const clip of library.animations)mixer.clipAction(clip).play();mixers.push({mixer,root:visual})}
 }
 const links=validateAssetPorts(result,manifest);
 return {seed:result.seed,width:W,depth:D,floors:1,assets:result.cells.filter(c=>c.id!=='aisle').length,connectedPortPairs:links};
}
function addEnvironment(){const studio=new THREE.Scene();studio.background=new THREE.Color(0x6c767b);for(const [x,y,z,w,h,d,p]of [[0,8,0,16,.1,9,3],[-7,3,0,.1,9,12,2],[7,2,-4,.1,7,9,1.2]]){const panel=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(p)}));panel.position.set(x,y,z);studio.add(panel)}const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(studio,.04).texture;scene.environmentIntensity=.35;pmrem.dispose();studio.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose()}})}

 scene=new THREE.Scene();scene.background=new THREE.Color(0xb1bec1);
 camera=new THREE.PerspectiveCamera(35,1,.1,220);camera.position.fromArray(initial.position);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
 controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.target.fromArray(initial.target);controls.maxPolarAngle=1.5;controls.minDistance=8;controls.maxDistance=140;controls.update();
 // Let a single-finger gesture scroll the article; two-finger gestures operate the scene.
 controls.touches.ONE=null;canvas.style.touchAction='pan-y';
 scene.add(new THREE.HemisphereLight(0xe8f2ff,0x56574c,.95));sun=new THREE.DirectionalLight(0xffedce,3.6);sun.position.set(-22,27,19);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:.1,far:100});sun.shadow.normalBias=.018;sun.shadow.bias=-.00008;scene.add(sun);addEnvironment();
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xb1bec1,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.46;ground.receiveShadow=true;scene.add(ground);
 composer=new EffectComposer(renderer);composer.renderTarget1.samples=4;composer.renderTarget2.samples=4;composer.addPass(new RenderPass(scene,camera));bokeh=new BokehPass(scene,camera,{focus:38,aperture:.00065,maxblur:.0078});composer.addPass(bokeh);composer.addPass(new OutputPass());
 function resize(){const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);renderer.setSize(w,h,false);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);resize();
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});intersection.observe(host);
 const [gltf,texture]=await Promise.all([fetch(url('models/factory-kit.glb')).then(r=>{if(!r.ok)throw Error('모델 HTTP '+r.status);return r.arrayBuffer();}).then(b=>new GLTFLoader().parseAsync(b,'')),new THREE.TextureLoader().loadAsync(url('textures/concrete-dirty.png').href)]);library=gltf;
 if(library.scenes.length!==ASSET_IDS.length)throw Error('모델 라이브러리 불일치');
 library.scenes.forEach(r=>r.traverse(o=>{if(o.isMesh&&o.material.map)o.material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}));
 texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 shellMaterials.floor=new THREE.MeshStandardMaterial({color:0xe0e2d6,map:texture,roughness:.97});shellMaterials.wall=new THREE.MeshStandardMaterial({color:0xe4e6dc,map:texture,roughness:.96});shellMaterials.edge=new THREE.MeshStandardMaterial({color:0x637078,roughness:.86});shellMaterials.steel=new THREE.MeshStandardMaterial({color:0x4b5a62,metalness:.45,roughness:.58});shellMaterials.glass=new THREE.MeshStandardMaterial({color:0x6b8e95,metalness:.22,roughness:.3});shellMaterials.yellow=new THREE.MeshStandardMaterial({color:0xe2bb45,roughness:.86});shellMaterials.marking=new THREE.MeshStandardMaterial({color:0xd9ded0,roughness:1});
 let strength=Number.isFinite(initial.dof)?initial.dof:65;
 function updateFocus(){camera.getWorldDirection(direction);bokeh.uniforms.focus.value=Math.max(.2,focusPoint.clone().sub(camera.position).dot(direction));bokeh.uniforms.aperture.value=.001*strength/100;bokeh.uniforms.maxblur.value=.012*strength/100;bokeh.enabled=strength>0;}
 function getView(){return {position:camera.position.toArray(),target:controls.target.toArray(),focus:focusPoint.toArray(),dof:strength};}
 function setView(view){for(const k of ['position','target','focus'])if(view[k]&&(!Array.isArray(view[k])||view[k].length!==3||!view[k].every(Number.isFinite)))throw Error('잘못된 좌표: '+k);if(view.dof!==undefined&&!Number.isFinite(view.dof))throw Error('잘못된 심도');if(view.position)camera.position.fromArray(view.position);if(view.target)controls.target.fromArray(view.target);if(view.focus)focusPoint.fromArray(view.focus);if(view.dof!==undefined)strength=Math.min(100,Math.max(0,view.dof));controls.update();updateFocus();return getView();}
 async function generate(seed){if(busy)return;const value=String(seed).trim();if(!value||value.length>48)throw Error('시드는 1~48자로 입력하세요.');busy=true;buttons.forEach(b=>b.disabled=true);try{
  // Generation replaces geometry only: no camera/target/focus writes here or in build().
  const result=generateLayout(value,10);validateAssetPorts(result,manifest);const summary=build(result);seedInput.value=value;loading.hidden=true;status.textContent=`${value} · 설비 ${summary.assets}개 · 로봇 ${result.robots}개 · 시점 유지`;host.dispatchEvent(new CustomEvent('factory-generated',{detail:summary,bubbles:true}));return summary;
 }finally{busy=false;buttons.forEach(b=>b.disabled=false);}}
 const report=error=>{status.textContent=error.message;};form.addEventListener('submit',e=>{e.preventDefault();generate(seedInput.value).catch(report);});root.querySelector('[data-random]').addEventListener('click',()=>generate('FLOW-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()).catch(report));
 await generate(host.getAttribute('seed')||'WORKSHOP-01');updateFocus();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),clock=new THREE.Clock();
 renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);if(!host.isConnected||!visible||document.hidden)return;if(!reduced.matches)for(const {mixer}of mixers)mixer.update(dt);updateFocus();renderer.shadowMap.needsUpdate=true;composer.render();});
 return {generate,getView,setView,pause(){visible=false;}};
}
