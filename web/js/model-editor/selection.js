import * as THREE from '../../vendor/three/three.module.js';

export function boundsOf(object) {
  object.updateWorldMatrix(true,true);
  return new THREE.Box3().setFromObject(object,true);
}

export function findCandidates(source) {
  const entries=[];
  for(const [index,object] of source.nodes) {
    if(!object.isMesh)continue;
    const box=boundsOf(object);if(box.isEmpty())continue;
    entries.push({index,name:source.parsed.document.nodes[index].name||'(未命名)',path:source.metadata.get(index).path,center:box.getCenter(new THREE.Vector3()).toArray(),min:box.min.toArray(),max:box.max.toArray()});
  }
  if(!entries.length)return [];
  const median=values=>{const a=values.sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
  const middle=[0,1,2].map(axis=>median(entries.map(e=>e.center[axis])));
  for(const e of entries)e.distance=Math.hypot(...e.center.map((v,i)=>v-middle[i]));
  const cutoff=median(entries.map(e=>e.distance))*3;
  return entries.filter(e=>e.distance>cutoff).sort((a,b)=>b.distance-a.distance).slice(0,20);
}

export function renderTree(container,source,select,query='',selected=null) {
  container.replaceChildren();
  const filter=query.toLowerCase();
  const parents=new Map();source.parsed.document.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
  const keep=new Set();
  for(const [index]of source.nodes)if(!filter||`${index} ${source.parsed.document.nodes[index].name||''}`.toLowerCase().includes(filter)){
    let current=index;while(current!==undefined&&!keep.has(current)){keep.add(current);current=parents.get(current);}
  }
  const append=(index,target)=>{
    if(!keep.has(index)||!source.nodes.has(index))return;
    const node=source.parsed.document.nodes[index];
    const children=(node.children||[]).filter(i=>source.nodes.has(i)&&keep.has(i));
    const button=document.createElement('button');button.type='button';
    button.textContent=`#${index} ${node.name||'(未命名)'}`;
    button.title=source.metadata.get(index).path;button.dataset.nodeIndex=index;
    button.classList.toggle('selected',selected===index);
    button.addEventListener('click',()=>select(index));
    if(children.length){const details=document.createElement('details');details.open=Boolean(filter)||parents.get(index)===undefined;
      const summary=document.createElement('summary');summary.append(button);details.append(summary);
      const nested=document.createElement('div');nested.className='tree-nested';children.forEach(i=>append(i,nested));details.append(nested);target.append(details);
    }else target.append(button);
  };
  for(const [index]of source.nodes)if(!source.nodes.has(parents.get(index)))append(index,container);
}

export function pickNode(event,canvas,camera,source) {
  const rect=canvas.getBoundingClientRect();
  const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);
  const hits=ray.intersectObject(source.root,true);
  for(const hit of hits){
    let visible=true;for(let n=hit.object;n;n=n.parent)if(!n.visible)visible=false;
    if(!visible)continue;
    for(let n=hit.object;n&&n!==source.root.parent;n=n.parent)if(source.indices.has(n))return source.indices.get(n);
  }
  return null;
}

export function setIsolation(source,selected) {
  for(const object of source.nodes.values()) {
    let include=false;
    for(let n=object;n;n=n.parent)if(n===selected)include=true;
    for(let n=selected;n;n=n.parent)if(n===object)include=true;
    object.visible=include;
  }
}
