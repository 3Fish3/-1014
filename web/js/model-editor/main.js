import * as THREE from '../../vendor/three/three.module.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import { TransformControls } from '../../vendor/three/TransformControls.js';
import { loadSource, disposeModel, objectTransform, applyTransform, checkedTransform } from './model-loader.js';
import { boundsOf, findCandidates, renderTree, pickNode, setIsolation } from './selection.js';
import { writeGlbTransforms } from './glb-transform-writer.js';
import { createPatch, validatePatch } from './repair-patch.js';
import { TransformHistory } from './transform-history.js';
import { validateExport } from './validation.js';

const $=id=>document.getElementById(id);
const viewport=$('viewport');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));viewport.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#f5f7fb');
const camera=new THREE.PerspectiveCamera(45,1,.001,10000);
camera.position.set(3,3,3);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xffffff,0x9ca7b7,2.2));
const light=new THREE.DirectionalLight(0xffffff,2.1);light.position.set(4,8,5);scene.add(light);
let grid=new THREE.GridHelper(10,20,0xb5c5dc,0xdce4ee);scene.add(grid);
const axes=new THREE.AxesHelper(1);scene.add(axes);
const gizmo=new TransformControls(camera,renderer.domElement);gizmo.setSize(.85);scene.add(gizmo.getHelper());
const box=new THREE.Box3Helper(new THREE.Box3(),0x2563eb);box.visible=false;scene.add(box);
const history=new TransformHistory(50);
let source=null,selected=null,candidates=[],dragBefore=null,dirty=false,saved='[]',savedNote=$('note').value,loading=false,disposed=false;
let visibleSnapshot=new Map();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const message=text=>{$('message').textContent=text;};

function changes(){
  if(!source)return [];
  const edits=[];
  for(const [index,object]of source.nodes){
    const metadata=source.metadata.get(index);if(!metadata.original)continue;
    // GLTFLoader对CAD矩阵的分解存在舍入；以加载后快照比较，不能把它误报为用户编辑。
    const original=metadata.baseline,current=objectTransform(object);
    const near=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-8);
    const qa=new THREE.Quaternion().fromArray(current.rotation).normalize();
    const qb=new THREE.Quaternion().fromArray(original.rotation).normalize();
    if(!near(current.translation,original.translation)||1-Math.abs(qa.dot(qb))>1e-12||!near(current.scale,original.scale))edits.push({nodeIndex:index,transform:current});
  }
  return edits;
}
function refresh(){
  const edits=changes();dirty=JSON.stringify(edits)!==saved||$('note').value!==savedNote;
  $('status').textContent=source?`${source.nodes.size}/${source.parsed.document.nodes.length} 个挂载源节点 · ${edits.length} 个已编辑 · ${dirty?'未保存':'已保存状态'} · 未核实草稿 · ${source.hash.slice(0,16)}`:'未加载 · 本地处理，无上传';
  $('undo').disabled=!history.canUndo;$('redo').disabled=!history.canRedo;
  $('save-patch').disabled=!source||loading;$('export-glb').disabled=!source||loading;
  if(selected!==null&&source){
    const object=source.nodes.get(selected),metadata=source.metadata.get(selected);
    const transform=objectTransform(object),world=object.getWorldPosition(new THREE.Vector3());
    const bounds=boundsOf(object);
    const round=a=>a.map(v=>Number(v.toPrecision(8)));
    $('node-info').textContent=`#${selected} ${source.parsed.document.nodes[selected].name||'(未命名)'}\n路径：${metadata.path}\n父节点：${source.indices.has(object.parent)?'#'+source.indices.get(object.parent):'场景根'}\n含mesh：${(()=>{let yes=false;object.traverse(n=>{if(n.isMesh)yes=true;});return yes;})()}\n局部位置：${round(transform.translation)}\n世界位置：${round(world.toArray())}\n包围盒：${bounds.isEmpty()?'无几何':JSON.stringify({min:round(bounds.min.toArray()),max:round(bounds.max.toArray())})}\n${metadata.error||''}`;
    const euler=new THREE.Euler().setFromQuaternion(object.quaternion,'XYZ');
    for(const [i,id]of ['px','py','pz'].entries())$(id).value=transform.translation[i];
    for(const [i,id]of ['rx','ry','rz'].entries())$(id).value=THREE.MathUtils.radToDeg(euler.toArray()[i]);
    $('numeric').disabled=Boolean(metadata.error);
    $('group-warning').textContent=object.children.length?`移动真实装配节点将同时移动 ${object.children.length} 个直接子组件；不会只移动外壳。`: '当前选中真实 glTF 叶节点。';
    if(!bounds.isEmpty()){box.box.copy(bounds);box.visible=object.visible;}
  }else{
    $('numeric').disabled=true;$('node-info').textContent='未选择';$('group-warning').textContent='';box.visible=false;
  }
  for(const id of ['focus','reset-node','hide','isolate'])$(id).disabled=selected===null;
}
function select(index){
  gizmo.detach();selected=index;
  if(index!==null&&source?.nodes.has(index)){
    const object=source.nodes.get(index);
    const error=source.metadata.get(index).error;
    if(!error){try{checkedTransform(object,source.metadata.get(index).original.scale);gizmo.attach(object);}catch(e){message(e.message);}}
    else message(`该节点只读：${error}`);
  }
  document.querySelectorAll('#tree button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.nodeIndex)===index));
  refresh();
}
function restoreVisibility(){
  if(!source)return;for(const [o,visible]of visibleSnapshot)o.visible=visible;box.visible=selected!==null;
}
function fit(object=null){
  if(!source)return;
  const bounds=new THREE.Box3();
  if(object)bounds.copy(boundsOf(object));
  else if($('main-bounds').checked&&candidates.length){
    const excluded=new Set(candidates.map(c=>c.index));
    for(const [index,node]of source.nodes)if(node.isMesh&&!excluded.has(index))bounds.union(boundsOf(node));
  }else bounds.copy(boundsOf(source.root));
  if(bounds.isEmpty()){message('该节点没有可聚焦几何');return;}
  const center=bounds.getCenter(new THREE.Vector3());
  const radius=Math.max(bounds.getSize(new THREE.Vector3()).length()/2,.01);
  const angle=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  const distance=radius/Math.sin(angle)*1.2;
  camera.near=Math.max(radius/10000,1e-6);camera.far=Math.max(distance*100,100);camera.updateProjectionMatrix();
  camera.position.copy(center).add(new THREE.Vector3(1,.7,1).normalize().multiplyScalar(distance));
  orbit.target.copy(center);orbit.update();
}
function rerenderTree(){if(source)renderTree($('tree'),source,select,$('search').value,selected);}
async function open(bytes,filename){
  if(loading)throw new Error('模型正在装载，请稍候');
  if(dirty&&!confirm('当前有未保存修改，确认放弃并打开其他模型？'))return;
  const openingSignature=JSON.stringify(changes()),openingNote=$('note').value;
  loading=true;refresh();message('正在本地解析模型与源节点映射…');
  let next;
  try{
    next=await loadSource(bytes,filename);
    if((JSON.stringify(changes())!==openingSignature||$('note').value!==openingNote)&&!confirm('模型装载期间出现了新的编辑，确认放弃这些新修改？')){
      disposeModel(next.root);message('已取消替换，保留现有编辑。');return;
    }
    gizmo.detach();selected=null;
    if(source){scene.remove(source.root);disposeModel(source.root);}
    source=next;scene.add(source.root);history.clear();saved='[]';dirty=false;
    $('note').value='人工调整，待机械核验';savedNote=$('note').value;
    visibleSnapshot=new Map();source.root.traverse(n=>visibleSnapshot.set(n,n.visible));
    candidates=findCandidates(source);
    const range=boundsOf(source.root),size=Math.max(range.getSize(new THREE.Vector3()).length(),1);
    scene.remove(grid);grid.geometry.dispose();grid.material.dispose();
    grid=new THREE.GridHelper(size*2,30,0xb5c5dc,0xdce4ee);grid.position.copy(range.getCenter(new THREE.Vector3()));grid.position.y=range.min.y;scene.add(grid);
    axes.scale.setScalar(size/5);
    $('source-label').textContent=`${filename} · ${source.hash.slice(0,16)} · ${source.parsed.bytes.length} B`;
    $('candidates').replaceChildren(...candidates.map(c=>{const b=document.createElement('button');b.textContent=`#${c.index} ${c.name} · 距离 ${c.distance.toFixed(3)}`;b.onclick=()=>{select(c.index);fit(source.nodes.get(c.index));};return b;}));
    $('search').value='';rerenderTree();fit();message('已加载原始场景；异常候选仅为距离统计，不是自动修复结论。');
  }finally{loading=false;refresh();}
}
function commitTransform(index,before,after){
  const object=source.nodes.get(index),original=source.metadata.get(index).original;
  try{
    if(!original)throw new Error('无法识别源节点变换，禁止编辑');
    applyTransform(object,after);
    const valid=checkedTransform(object,original.scale);
    if(!same(before,valid)){history.record(index,before,valid);message('节点变换已更新；人工调整，待机械核验。');}
  }catch(error){applyTransform(object,before);message(`已拒绝编辑：${error.message}`);}
  refresh();
}
function applyNumeric(){
  if(selected===null)return;
  const object=source.nodes.get(selected),before=objectTransform(object);
  const position=['px','py','pz'].map(id=>Number($(id).value));
  const angles=['rx','ry','rz'].map(id=>Number($(id).value));
  if([...position,...angles].some(v=>!Number.isFinite(v))||['px','py','pz','rx','ry','rz'].some(id=>$(id).value.trim()==='')){message('坐标/角度必须为有限数值，不能留空');return;}
  const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles.map(THREE.MathUtils.degToRad),'XYZ'));
  commitTransform(selected,before,{translation:position,rotation:quaternion.toArray(),scale:before.scale});
}
function travel(direction){
  const record=history[direction]();if(!record)return;
  applyTransform(source.nodes.get(record.nodeIndex),record.transform);select(record.nodeIndex);message(direction==='undo'?'已撤销':'已重做');
}
function download(bytes,type,name){const blob=new Blob([bytes],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function savePatch(){
  if(!source)return;
  const current=source,edits=changes(),signature=JSON.stringify(edits),note=$('note').value;
  const patch=await createPatch(current.parsed,edits,current.filename,note,false);
  if(source!==current||JSON.stringify(changes())!==signature||$('note').value!==note)throw new Error('生成过程中编辑或说明发生变化，请重新保存');
  download(JSON.stringify(patch,null,2),'application/json','hero_robot_repair.json');saved=signature;savedNote=note;refresh();message('补丁已下载；浏览器不能直接写入仓库。该补丁未经过机械核验。');
}
async function exportGlb(){
  if(!source)return;
  const current=source,edits=changes(),signature=JSON.stringify(edits);
  const bytes=writeGlbTransforms(current.parsed,edits);validateExport(current.parsed,bytes,edits);
  const probe=await loadSource(bytes,'export-validation.glb');
  try{if(probe.nodes.size!==current.nodes.size)throw new Error('重新加载的源节点映射数量不一致');}finally{disposeModel(probe.root);}
  if(source!==current||JSON.stringify(changes())!==signature)throw new Error('校验过程中编辑发生变化，请重试');
  download(bytes,'model/gltf-binary','hero_robot_repaired.glb');
  message('未核实草稿已下载：BIN/其他块字节及非目标信息一致，GLTFLoader重新加载通过。请与JSON补丁共同保存；尚须机械核验。');
}
async function importPatch(file){
  if(!source)throw new Error('请先加载补丁对应的原始模型');
  const current=source,signature=JSON.stringify(changes()),note=$('note').value;
  let patch;
  try{patch=JSON.parse(await file.text());}catch{throw new Error('修复补丁不是有效JSON');}
  const edits=await validatePatch(current.parsed,patch);
  if(current!==source||signature!==JSON.stringify(changes())||note!==$('note').value)throw new Error('校验期间源模型或编辑状态发生变化，请重试');
  for(const edit of edits){
    if(!source.nodes.has(edit.nodeIndex)||source.metadata.get(edit.nodeIndex).error)throw new Error(`节点 #${edit.nodeIndex} 不可编辑，拒绝整个补丁`);
  }
  if((dirty||changes().length)&&!confirm('导入补丁会替换当前全部编辑，确认继续？'))return;
  // 在同一同步事务中检查最终父子状态；任何一项失败恢复所有节点，不留半个补丁。
  const snapshot=new Map([...source.nodes].map(([i,o])=>[i,objectTransform(o)]));
  try{
    for(const [index,object]of source.nodes){const metadata=source.metadata.get(index);if(metadata.original)applyTransform(object,metadata.baseline);}
    for(const edit of edits)applyTransform(source.nodes.get(edit.nodeIndex),edit.transform);
    source.root.updateMatrixWorld(true);
    for(const edit of edits)checkedTransform(source.nodes.get(edit.nodeIndex),source.metadata.get(edit.nodeIndex).original.scale);
  }catch(error){for(const [index,transform]of snapshot)applyTransform(source.nodes.get(index),transform);source.root.updateMatrixWorld(true);throw error;}
  history.clear();saved=JSON.stringify(changes());
  $('note').value=patch.edits[0]?.note||'人工调整，待机械核验';savedNote=$('note').value;
  select(edits[0]?.nodeIndex??null);message('源哈希、节点路径与原始变换全部匹配；补丁已应用，仍为未核实状态。');
}
function action(callback){return (...args)=>Promise.resolve().then(()=>callback(...args)).catch(error=>{message(error.message);console.error(error);});}
$('load-course').onclick=action(async()=>{const response=await fetch('./models/hero_robot_clean.glb');if(!response.ok)throw new Error(`课程模型加载失败 HTTP ${response.status}`);await open(new Uint8Array(await response.arrayBuffer()),'hero_robot_clean.glb');});
$('file').onchange=action(async e=>{const file=e.target.files[0];if(file)await open(new Uint8Array(await file.arrayBuffer()),file.name);e.target.value='';});
$('patch-file').onchange=action(async e=>{const file=e.target.files[0];if(file)await importPatch(file);e.target.value='';});
$('search').oninput=rerenderTree;$('note').oninput=refresh;
$('fit-all').onclick=()=>fit();$('main-bounds').onchange=()=>{fit();message('仅改变观察镜头，未隐藏、删除或修改任何节点。');};$('focus').onclick=()=>{if(selected!==null)fit(source.nodes.get(selected));};
$('translate').onclick=()=>{gizmo.setMode('translate');$('translate').classList.add('active');$('rotate').classList.remove('active');};
$('rotate').onclick=()=>{gizmo.setMode('rotate');$('rotate').classList.add('active');$('translate').classList.remove('active');};
$('translate').click();$('space').onchange=()=>gizmo.setSpace($('space').value);
$('apply').onclick=applyNumeric;$('undo').onclick=()=>travel('undo');$('redo').onclick=()=>travel('redo');
$('reset-node').onclick=()=>{if(selected!==null){const metadata=source.metadata.get(selected);if(metadata.original)commitTransform(selected,objectTransform(source.nodes.get(selected)),metadata.baseline);}};
$('reset-all').onclick=()=>{if(!source||!confirm('恢复全部初始变换？可以逐节点撤销。'))return;for(const edit of changes()){const baseline=source.metadata.get(edit.nodeIndex).baseline;commitTransform(edit.nodeIndex,objectTransform(source.nodes.get(edit.nodeIndex)),baseline);}refresh();};
$('isolate').onclick=()=>{if(selected!==null){restoreVisibility();setIsolation(source,source.nodes.get(selected));refresh();}};
$('hide').onclick=()=>{if(selected!==null){source.nodes.get(selected).visible=false;gizmo.detach();refresh();}};
$('show-all').onclick=()=>{restoreVisibility();select(selected);};
$('save-patch').onclick=action(savePatch);$('export-glb').onclick=action(exportGlb);
gizmo.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;});
gizmo.addEventListener('mouseDown',()=>{if(selected!==null)dragBefore=objectTransform(source.nodes.get(selected));});
gizmo.addEventListener('mouseUp',()=>{if(selected!==null&&dragBefore){commitTransform(selected,dragBefore,objectTransform(source.nodes.get(selected)));dragBefore=null;}});
gizmo.addEventListener('objectChange',()=>{if(selected!==null){box.box.copy(boundsOf(source.nodes.get(selected)));}});
renderer.domElement.addEventListener('dblclick',event=>{if(source&&!gizmo.dragging)select(pickNode(event,renderer.domElement,camera,source));});
window.addEventListener('keydown',event=>{
  if(event.target.closest('input,textarea,select,button,a'))return;
  const key=event.key.toLowerCase();
  if((event.ctrlKey||event.metaKey)&&key==='z'){event.preventDefault();travel(event.shiftKey?'redo':'undo');}
  else if(key==='w')$('translate').click();else if(key==='e')$('rotate').click();else if(key==='f')$('focus').click();else if(key==='escape')select(null);
});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
const observer=new ResizeObserver(()=>{const width=viewport.clientWidth,height=viewport.clientHeight;if(width&&height){renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}});observer.observe(viewport);
function frame(){if(disposed)return;requestAnimationFrame(frame);orbit.update();if(selected!==null&&source&&box.visible)box.box.copy(boundsOf(source.nodes.get(selected)));renderer.render(scene,camera);}frame();
window.addEventListener('pagehide',()=>{disposed=true;observer.disconnect();gizmo.dispose();orbit.dispose();if(source)disposeModel(source.root);grid.geometry.dispose();grid.material.dispose();axes.geometry.dispose();axes.material.dispose();box.geometry.dispose();box.material.dispose();renderer.dispose();},{once:true});
// 只暴露本地工作台状态，供可复现浏览器验收；不提供服务器写入接口。
window.modelEditor={get source(){return source;},get selected(){return selected;},get dirty(){return dirty;},get candidates(){return candidates;},history,gizmo,camera,orbit,scene,renderer,open,select,changes,applyNumeric,exportGlb,savePatch,importPatch};
refresh();
