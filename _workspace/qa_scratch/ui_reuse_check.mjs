const SRC = 'file:///Users/robin/Downloads/tower-defense/';
// index.html에 실재하는 §7 노드를 시드(hud-score/screen-stage-select 포함) → 재사용 경로 검증
const nodes = new Map();
let hudScoreCount = 0, stageSelCount = 0;
function mk(tag){const el={tagName:(tag||'div').toUpperCase(),id:'',type:'',textContent:'',_ih:'',dataset:{},style:{},children:[],parentNode:null,_a:{},_l:{},
 classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},toggle(c,f){const on=f===undefined?!this._s.has(c):f;on?this._s.add(c):this._s.delete(c);return on},contains(c){return this._s.has(c)}},
 set className(v){el.classList._s=new Set(String(v).split(/\s+/).filter(Boolean))},get className(){return [...el.classList._s].join(' ')},
 set innerHTML(h){el.children.length=0;el.textContent='';el._ih=String(h);parse(String(h),el)},get innerHTML(){return el._ih},
 appendChild(n){n.parentNode=el;el.children.push(n);if(n.id){nodes.set(n.id,n);if(n.id==='hud-score')hudScoreCount++;if(n.id==='screen-stage-select')stageSelCount++;}return n},
 append(...ns){ns.forEach(n=>el.appendChild(n))},insertBefore(n){n.parentNode=el;el.children.push(n);if(n.id)nodes.set(n.id,n);return n},
 setAttribute(k,v){el._a[k]=String(v);if(k==='id'){el.id=String(v);nodes.set(String(v),el)}},getAttribute(k){return el._a[k]},addEventListener(t,fn){(el._l[t]||(el._l[t]=[])).push(fn)},
 querySelector(sel){const f=n=>{for(const c of n.children){if(sel[0]==='#'&&c.id===sel.slice(1))return c;if(sel[0]==='.'&&c.classList.contains(sel.slice(1)))return c;const d=f(c);if(d)return d}return null};return f(el)},
 getContext(){return{setTransform(){},fillRect(){},beginPath(){},arc(){},fill(){},set fillStyle(v){},set globalCompositeOperation(v){},set globalAlpha(v){}}},
 get offsetWidth(){return 0},get nextSibling(){const i=el.parentNode?el.parentNode.children.indexOf(el):-1;return el.parentNode&&i>=0?el.parentNode.children[i+1]||null:null},click(){(el._l.click||[]).forEach(fn=>fn({}))}};return el}
function parse(html,parent){const stack=[parent];const re=/<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*?)\s*(\/?)>|([^<]+)/g;let m;while((m=re.exec(html))){const[,cl,tag,at,sc,tx]=m;const top=stack[stack.length-1];if(tx!==undefined){const t=tx.replace(/\s+/g,' ');if(t.trim())top.textContent=(top.textContent||'')+t;continue}if(cl){if(stack.length>1)stack.pop();continue}const ch=mk(tag);const cm=/class\s*=\s*"([^"]*)"/.exec(at);if(cm)ch.className=cm[1];const im=/id\s*=\s*"([^"]*)"/.exec(at);if(im){ch.id=im[1];nodes.set(im[1],ch)}top.appendChild(ch);if(!sc&&!/^(br|img|input|hr)$/i.test(tag))stack.push(ch)}}
const doc={createElement:t=>mk(t),getElementById:id=>nodes.get(id)||null,body:mk('body')};
// index.html 실제 노드 전부 시드 (hud-score/screen-stage-select 포함)
for(const id of ['hud','hud-gold','hud-lives','hud-wave','hud-score','hud-countdown','btn-wave-start','btn-speed','btn-mute','stage','screen-title','screen-stage-select','screen-victory','screen-defeat','btn-start','btn-restart-victory','btn-restart-defeat']){const n=mk('div');n.id=id;nodes.set(id,n);doc.body.appendChild(n)}
hudScoreCount=0;stageSelCount=0;globalThis.document=doc;globalThis.window={devicePixelRatio:2};
globalThis.localStorage={_m:new Map(),getItem(k){return this._m.has(k)?this._m.get(k):null},setItem(k,v){this._m.set(k,String(v))},removeItem(k){this._m.delete(k)}};
const {initHud}=await import(SRC+'src/ui/hud.js');
const {initScreens}=await import(SRC+'src/ui/screens.js');
const {initStageSelect}=await import(SRC+'src/ui/stageselect.js');
const econ=await import(SRC+'src/systems/economy.js');econ.initEconomy();
const score=await import(SRC+'src/systems/score.js');score.initScore();
const prog=await import(SRC+'src/systems/progress.js');prog.initProgress();
initHud();initScreens();initStageSelect();
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
ok(hudScoreCount===0,`#hud-score 중복 생성 없음 (append 횟수=${hudScoreCount}, 기존 노드 재사용)`);
ok(stageSelCount===0,`#screen-stage-select 중복 생성 없음 (append 횟수=${stageSelCount})`);
const grid=doc.getElementById('screen-stage-select').querySelector('.stage-grid');
ok(grid&&grid.children.length===5,`기존 #screen-stage-select에 카드 5개 주입 (=${grid?grid.children.length:0})`);
const hs=doc.getElementById('hud-score').querySelector('.hud-value');
ok(!!hs,'기존 #hud-score에 점수 라벨 주입');
console.log(fail===0?'\n✅ 재사용 경로 통과':`\n❌ ${fail}건 실패`);process.exit(fail?1:0);
