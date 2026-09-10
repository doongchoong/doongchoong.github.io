export function randomFrom(seed){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export const ASSET_IDS=['robot-cell','cnc-machine','conveyor-straight','storage-rack','pipe-skid','conveyor-corner','conveyor-tee','conveyor-cross'];
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]],OPPOSITE=[1,0,3,2];
export function rotateMask(mask,q){for(let n=0;n<q;n++){let next=0;[3,2,0,1].forEach((to,from)=>{if(mask&(1<<from))next|=1<<to});mask=next}return mask}
export function moduleFor(mask){for(const [id,base]of [['conveyor-straight',3],['conveyor-corner',5],['conveyor-tee',7],['conveyor-cross',15]])for(let q=0;q<4;q++)if(rotateMask(base,q)===mask)return {id,rotationY:q*Math.PI/2,mask};throw Error('지원하지 않는 컨베이어 연결입니다.')}

const key=(x,z)=>x+','+z;
const near=(x,z)=>DIRECTIONS.map(([dx,dz])=>[x+dx,z+dz]).filter(([x,z])=>x>=0&&x<10&&z>=0&&z<8);
function network(random){
 const graph=new Map();
 function join(a,b){for(const [p,q] of [[a,b],[b,a]]){const d=DIRECTIONS.findIndex(([dx,dz])=>p[0]+dx===q[0]&&p[1]+dz===q[1]);graph.set(key(...p),(graph.get(key(...p))??0)|(1<<d));}}
 function rectangle(x,z,w,h){for(let i=x;i<x+w;i++){join([i,z],[i+1,z]);join([i,z+h],[i+1,z+h]);}for(let j=z;j<z+h;j++){join([x,j],[x,j+1]);join([x+w,j],[x+w,j+1]);}}
 const x=1+Math.floor(random()*3),z=1+Math.floor(random()*2),w=3+Math.floor(random()*3),h=2+Math.floor(random()*3);
 rectangle(x,z,w,h);
 // A second independently sized loop joins and crosses the production line.
 if(random()<.8){const a=x+1+Math.floor(random()*(w-1)),b=Math.max(1,z-1),right=Math.min(8,x+w+1),bottom=Math.min(6,z+h+1);rectangle(a,b,right-a,bottom-b);}
 return graph;
}
function reachable(cells){const seen=new Set(),stack=cells.filter(c=>c.id==='aisle'&&(c.x===0||c.x===9||c.z===0||c.z===7)).slice(0,1);while(stack.length){const c=stack.pop(),k=key(c.x,c.z);if(seen.has(k))continue;seen.add(k);for(const [x,z]of near(c.x,c.z)){const n=cells[z*10+x];if(n.id==='aisle'&&!seen.has(key(x,z)))stack.push(n);}}return seen;}
export function generateLayout(seed='WORKSHOP-01',width=10){
 if(typeof seed!=='string'||!seed.trim()||seed.length>48||width!==10)throw Error('공장 크기는 30 × 24m입니다. 시드를 확인하세요.');
 const start=performance.now(),random=randomFrom(seed),graph=network(random);
 const cells=Array.from({length:80},(_,i)=>{const x=i%10,z=Math.floor(i/10),mask=graph.get(key(x,z))??0;return {id:mask?moduleFor(mask).id:'aisle',x,z,mask,rotationY:mask?moduleFor(mask).rotationY:0,position:[(x-4.5)*3,0,(z-3.5)*3]};});
 const outside=reachable(cells);
 // Pockets enclosed by the line hold production equipment, never unreachable aisles.
 for(const c of cells)if(c.id==='aisle'&&!outside.has(key(c.x,c.z)))c.id=random()<.75?'cnc-machine':'storage-rack';
 const candidates=cells.filter(c=>c.id==='aisle'&&c.x>0&&c.x<9&&c.z>0&&c.z<7);for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
 const accessible=()=>{const seen=reachable(cells);return seen.size===cells.filter(c=>c.id==='aisle').length&&cells.filter(c=>c.id==='robot-cell').every(c=>near(c.x,c.z).some(([x,z])=>seen.has(key(x,z))));};
 let robots=0;const wanted=3+Math.floor(random()*3);
 for(const c of candidates){if(robots>=wanted)break;const choices=near(c.x,c.z).map(([x,z])=>cells[z*10+x]).filter(n=>n.mask&&(n.mask===3||n.mask===12)&&!(n.mask&(1<<DIRECTIONS.findIndex(([dx,dz])=>n.x+dx===c.x&&n.z+dz===c.z))));
  if(!choices.length||near(c.x,c.z).some(([x,z])=>cells[z*10+x].id==='robot-cell'))continue;
  const target=choices[Math.floor(random()*choices.length)];c.id='robot-cell';if(!accessible()){c.id='aisle';continue;}
  const dx=target.x-c.x,dz=target.z-c.z;c.rotationY=Math.atan2(-dz,dx);c.position[0]+=dx*.8;c.position[2]+=dz*.8;c.workTarget=[target.x,target.z];robots++;
 }
 // Weighted minimum-entropy collapse for the remaining equipment/aisle slots.
 // Propagate rack adjacency restrictions and reject any blocked service route.
 const weights={aisle:5,'cnc-machine':3,'storage-rack':2},domains=new Map(candidates.filter(c=>c.id==='aisle').map(c=>[c,['aisle','cnc-machine','storage-rack']]));
 let decisions=0;while(domains.size){let chosen=null,options=null,best=Infinity;
  for(const [c,domain]of domains){const next=domain.filter(id=>id!=='storage-rack'||!near(c.x,c.z).some(([x,z])=>cells[z*10+x].id==='storage-rack'));domains.set(c,next);const sum=next.reduce((s,id)=>s+weights[id],0),entropy=Math.log(sum)-next.reduce((s,id)=>s+weights[id]*Math.log(weights[id]),0)/sum+random()*.00001;if(entropy<best){best=entropy;chosen=c;options=next;}}
  let pick=random()*options.reduce((s,id)=>s+weights[id],0);for(const id of options){pick-=weights[id];if(pick<=0){chosen.id=id;break;}}domains.delete(chosen);decisions++;
  if(chosen.id!=='aisle'&&!accessible())chosen.id='aisle';
  const aisle=near(chosen.x,chosen.z).find(([x,z])=>cells[z*10+x].id==='aisle');if(aisle)chosen.rotationY=Math.atan2(aisle[0]-chosen.x,aisle[1]-chosen.z);
 }
 for(const x of [0,1]){const c=cells[x];c.id='pipe-skid';}
 const entry=cells.filter(c=>c.z===7&&c.id==='aisle').sort((a,b)=>Math.abs(a.x-4.5)-Math.abs(b.x-4.5))[0];
 const result={seed,width:10,depth:8,cells,decisions,area:720,aisleWidth:3,entryX:entry.x,robots,ms:performance.now()-start};validateLayout(result);return result;
}
export function validateLayout(layout){
 const {width,depth,cells}=layout;if(width!==10||depth!==8||cells.length!==80)throw Error('공장 크기 불일치');
 for(const c of cells){if(c.id!=='aisle'&&!ASSET_IDS.includes(c.id))throw Error('허용되지 않은 설비');if(c.position[1]!==0)throw Error('단층 배치가 아닙니다.');
  if(c.mask){const m=moduleFor(c.mask);if(m.id!==c.id||m.rotationY!==c.rotationY)throw Error('컨베이어 방향 불일치');DIRECTIONS.forEach(([dx,dz],d)=>{if(!(c.mask&(1<<d)))return;const x=c.x+dx,z=c.z+dz;if(x<0||x>=10||z<0||z>=8||!(cells[z*10+x].mask&(1<<OPPOSITE[d])))throw Error('컨베이어가 끊겼습니다.');});}
  if(c.id==='robot-cell'){if(!c.workTarget)throw Error('로봇 작업 대상 누락');const [x,z]=c.workTarget,t=cells[z*10+x];if(!t.mask||Math.abs(x-c.x)+Math.abs(z-c.z)!==1)throw Error('로봇이 컨베이어에 인접하지 않습니다.');const dx=x-c.x,dz=z-c.z;if(Math.abs(Math.cos(c.rotationY)-dx)>.001||Math.abs(-Math.sin(c.rotationY)-dz)>.001)throw Error('로봇 작업 방향 불일치');}
 }
 if(!cells.some(c=>c.id==='robot-cell'))throw Error('컨베이어 작업 로봇 누락');const seen=reachable(cells);if(seen.size!==cells.filter(c=>c.id==='aisle').length)throw Error('통로 연결이 끊겼습니다.');for(const c of cells.filter(c=>c.id==='robot-cell'))if(!near(c.x,c.z).some(([x,z])=>seen.has(key(x,z))))throw Error('로봇 정비 접근 불가');return true;
}
export function validateAssetPorts(layout,manifest){const specs=new Map(manifest.assets.map(a=>[a.id,a])),ports=new Map();
 for(const cell of layout.cells){if(cell.id==='aisle')continue;const spec=specs.get(cell.id);if(!spec)throw Error('GLB 명세가 없습니다.');const co=Math.cos(cell.rotationY),si=Math.sin(cell.rotationY);for(const p of spec.ports){const [x,y,z]=p.position,world=[cell.position[0]+co*x+si*z,cell.position[1]+y,cell.position[2]-si*x+co*z];const local={'+X':[1,0,0],'-X':[-1,0,0],'+Z':[0,0,1],'-Z':[0,0,-1]}[p.face];const direction=[co*local[0]+si*local[2],0,-si*local[0]+co*local[2]];const key=p.type+'|'+world.map(v=>v.toFixed(5)).join(',');if(!ports.has(key))ports.set(key,[]);ports.get(key).push({cell,p,direction})}}
 let connections=0;for(const list of ports.values()){if(list.length===1){if(list[0].p.type==='belt')throw Error('컨베이어 포트 위치가 맞지 않습니다.');continue}if(list.length!==2)throw Error('포트가 중복 연결되었습니다.');const [a,b]=list;if(a.direction.reduce((s,v,i)=>s+v*b.direction[i],0)>-.999)throw Error('포트가 반대 방향을 향하지 않습니다.');if(a.p.width!==b.p.width||a.p.radius!==b.p.radius)throw Error('포트 크기가 다릅니다.');connections++}return connections;
}
