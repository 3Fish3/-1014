// 第10步专用双视区：复用现有场景与唯一WebGLRenderer，只扩展相机/输入。
import * as THREE from '../vendor/three/three.module.js';
import {OrbitControls} from '../vendor/three/OrbitControls.js';

export class ComparisonView {
  constructor(viewer) {
    this.viewer=viewer;this.active=false;this.layers=new Map();
    this.container=document.querySelector('#comparison-regions');
    this.views=['teaching','hero'].map((kind,index)=>{
      const element=document.querySelector(`#comparison-${kind}`);
      const camera=new THREE.PerspectiveCamera(45,1,.0001,50);
      camera.layers.set(index+1);camera.layers.enable(0);
      const controls=new OrbitControls(camera,element);
      controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.48;controls.enabled=false;
      const button=element.querySelector('button');
      button.addEventListener('pointerdown',event=>event.stopPropagation());
      button.onclick=()=>this.fit(index);
      return {kind,element,camera,controls};
    });
    document.querySelector('#hero-framing').onchange=()=>this.fit(1);
  }
  restoreLayers(){for(const[object,mask]of this.layers)object.layers.mask=mask;this.layers.clear();}
  syncModels(){
    if(!this.active)return;
    this.restoreLayers();
    for(const[root,layer]of [[this.viewer.carRoot,1],[this.viewer.heroRobotModel,2]])root?.traverse(object=>{this.layers.set(object,object.layers.mask);object.layers.set(layer);});
    this.fit(1);
  }
  setActive(active){
    this.active=active;this.container.hidden=!active;
    this.viewer.controls.enabled=!active;
    this.views.forEach(v=>v.controls.enabled=active);
    if(active){this.viewer.isTransitioningCamera=false;this.syncModels();this.fit(0);}
    else{
      this.restoreLayers();const r=this.viewer.renderer;
      r.setScissorTest(false);r.setViewport(0,0,this.viewer.width,this.viewer.height);
    }
  }
  root(index){return index===0?this.viewer.carRoot:this.viewer.heroRobotModel;}
  // 主体取景只排除已定位的549子组；不改变该组visible，不写入GLB。
  meshes(index){
    const meshes=[],root=this.root(index);
    const subject=index===1&&this.viewer.heroRobotUrl?.endsWith('hero_robot_clean.glb')&&document.querySelector('#hero-framing').value==='subject';
    const excluded=subject?this.viewer.heroOffsetGroup:null;
    const walk=object=>{if(!object.visible||object===excluded)return;if(object.isMesh)meshes.push(object);object.children.forEach(walk);};
    if(root){root.updateWorldMatrix(true,true);walk(root);}return meshes;
  }
  fit(index){
    if(!this.active)return;
    const view=this.views[index],meshes=this.meshes(index),bounds=new THREE.Box3();
    for(const mesh of meshes)bounds.union(new THREE.Box3().setFromObject(mesh,true));
    if(bounds.isEmpty())return;
    const rect=view.element.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    const direction=new THREE.Vector3(-1,.8,1.25).normalize();
    const inverse=new THREE.Matrix4().lookAt(center.clone().add(direction),center,new THREE.Vector3(0,1,0)).invert();
    view.camera.aspect=rect.width/rect.height;
    const tanV=Math.tan(THREE.MathUtils.degToRad(view.camera.fov/2)),tanH=tanV*view.camera.aspect;
    let distance=0;
    // 精确按各自几何顶点求投影范围，不把另一模型或空包围盒角落算进去。
    for(const mesh of meshes){const position=mesh.geometry.attributes.position;
      for(let i=0;i<position.count;i++){
        const p=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).sub(center).applyMatrix4(inverse);
        distance=Math.max(distance,Math.abs(p.x)/tanH+p.z,Math.abs(p.y)/tanV+p.z);
      }
    }
    distance=Math.max(distance*1.12,.01);
    view.camera.near=Math.max(size.length()/10000,1e-6);view.camera.far=Math.max(distance*20,10);
    view.camera.updateProjectionMatrix();
    // 复位先消耗旧OrbitControls阻尼增量，避免下一帧继续漂移破坏独立取景。
    const damping=view.controls.enableDamping;view.controls.enableDamping=false;view.controls.update();
    view.camera.position.copy(center).addScaledVector(direction,distance);
    view.controls.target.copy(center);view.controls.minDistance=Math.max(distance*.15,.001);view.controls.maxDistance=distance*12;view.controls.update();view.controls.enableDamping=damping;
    view.fittedBounds=bounds.clone();
  }
  fitAll(){this.fit(0);this.fit(1);}
  render(){
    const v=this.viewer,r=v.renderer,base=v.container.getBoundingClientRect();
    // 清除两视区之间的间隙，避免残留上一步完整画布的像素。
    r.setScissorTest(false);r.setViewport(0,0,v.width,v.height);r.clear();
    r.setScissorTest(true);
    for(const view of this.views){
      const rect=view.element.getBoundingClientRect();
      const x=rect.left-base.left,y=base.bottom-rect.bottom;
      r.setViewport(x,y,rect.width,rect.height);r.setScissor(x,y,rect.width,rect.height);
      view.controls.update();r.render(v.scene,view.camera);
    }
    r.setScissorTest(false);r.setViewport(0,0,v.width,v.height);
  }
  dispose(){this.restoreLayers();this.views.forEach(v=>v.controls.dispose());}
}
