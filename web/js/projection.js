// P0展示适配层：只处理第3、9步，不维护第二套运动学或教学步骤。
import * as THREE from '../vendor/three/three.module.js';

const PAGES = {
  3: {category:'认识一个部件',name:'驱动电机',question:'轮子自己不会转，动力从哪来？',image:'./assets/images/ui-v2/damiao-motor-reference.jpg',alt:'达妙减速关节电机原厂产品照片',caption:'实物参考：达妙 DM-J4310。原厂手册图片；非示意小车同款。',lines:['电机把电能变成旋转运动。','减速箱把转动传到车轮。'],keywords:['电能 → 运动','减速箱','输出轴'],topic:'新加入：左右驱动电机'},
  9: {category:'动手试一试',name:'让小车转个弯',question:'改变左右轮速，为什么会转弯？',image:'./assets/images/ui-v2/differential.svg',alt:'右轮快于左轮时车头左偏的运动示意图',caption:'运动示意，非实拍。',lines:['先猜方向，再拖动验证。','交换轮速，观察轨迹变化。'],keywords:['方向','快慢','轨迹'],topic:'观察轮子方向与地面轨迹'}
};

export class ProjectionPresentation {
  constructor(app) {
    this.app = app;
    const notes = document.querySelector('#teacher-notes');
    document.querySelector('#btn-notes').addEventListener('click',()=>notes.showModal());
    document.querySelector('#btn-close-notes').addEventListener('click',()=>notes.close());
    document.querySelector('#btn-toggle-code').addEventListener('click',()=>{notes.close();app.dom.codeDrawer.hidden=false;});
    document.querySelector('#btn-close-code').addEventListener('click',()=>{app.dom.codeDrawer.hidden=true;});
  }

  attachViewer(viewer) {
    this.viewer = viewer;
    viewer.scene.background = new THREE.Color('#f5f7fb');
    viewer.scene.fog = new THREE.Fog('#f5f7fb', .65, 1.7);
    viewer.renderer.toneMappingExposure = 1;
    viewer.scene.traverse(node=>{
      if(node.type === 'GridHelper'){
        node.scale.setScalar(.25);
        node.material.vertexColors=false;
        node.material.color.set('#dce4ee');
        node.material.transparent=true;
        node.material.opacity=.65;
        node.material.needsUpdate=true;
      }
    });
    viewer.trajectoryLine.material.color.set('#2563eb');
    this.observer = new ResizeObserver(()=>{
      viewer.handleResize();
      if(viewer.diffCarModel && viewer.cameraMode==='FIXED')this.fitModel(false);
    });
    this.observer.observe(this.app.dom.canvasContainer);
    window.addEventListener('pagehide',()=>this.observer.disconnect(),{once:true});
  }

  afterModelLoaded() {
    // 顶点色保留，功能节点分别使用材质，避免共享材质导致整车一起发光。
    const oldMaterials = new Set();
    this.viewer.diffCarModel.traverse(node=>{
      if(!node.isMesh)return;
      const materials=[node.material].flat();
      const copies=materials.map(material=>{
        oldMaterials.add(material);
        const copy=material.clone();
        copy.roughness=.65;
        this.viewer.originalMaterials.set(copy,copy.emissive.clone());
        return copy;
      });
      node.material=Array.isArray(node.material)?copies:copies[0];
    });
    for(const material of oldMaterials){this.viewer.originalMaterials.delete(material);material.dispose();}
    for(const [name,color] of [['Node_PowerWires','#c25a14'],['Node_SignalWires','#2563eb']]){
      this.viewer.nodesMap.get(name)?.traverse(mesh=>{
        if(!mesh.isMesh)return;
        for(const material of [mesh.material].flat()){
          material.vertexColors=false;
          material.color.set(color);
          material.needsUpdate=true;
        }
      });
    }
    for(const arrow of [this.viewer.leftArrowMesh,this.viewer.rightArrowMesh])arrow.traverse(n=>{if(n.isMesh)n.material.color.set('#2563eb');});
  }

  update(step) {
    const page=PAGES[step.id];
    if(!page)return;
    this.viewer.cameraMode='FIXED';
    document.querySelector('#btn-cam-mode').textContent='固定视角';
    document.querySelector('#step-badge').textContent=`${String(step.id).padStart(2,'0')} / 10`;
    document.querySelector('#card-category').textContent=page.category;
    document.querySelector('#step-title').textContent=page.name;
    document.querySelector('#key-concept').textContent=page.question;
    document.querySelector('#section-name').textContent=page.name;
    document.querySelector('#stage-topic').textContent=page.topic;
    document.querySelector('#hardware-photo').src=page.image;
    document.querySelector('#hardware-photo').alt=page.alt;
    document.querySelector('#photo-caption').textContent=page.caption;
    document.querySelector('#btn-prev').textContent='上一页';
    document.querySelector('#btn-next').textContent='下一步';
    const fill=(selector,items)=>{
      const list=document.querySelector(selector);
      list.replaceChildren(...items.map(text=>{const item=document.createElement('li');item.textContent=text;return item;}));
    };
    fill('#step-details',page.lines);fill('#keywords',page.keywords);
    document.querySelector('#motion-controls').hidden=step.id!==9;
    this.app.dom.presetControls.querySelectorAll('button').forEach((button,index)=>{button.hidden=index===4||index===5;});
    // 图例展示功能语义；本轮未新增反馈传感器或反馈动画。
    document.querySelector('.feedback').textContent='反馈（待讲解）';
    document.querySelector('.feedback').title='反馈关系留待P1分步讲解，本页不生成反馈信号';
    requestAnimationFrame(()=>{this.viewer.handleResize();this.fitModel(!this.app.paused);});
  }

  resetView() {
    // 手动归位也同步镜头；暂停中的跟随相机不会自动追赶归位后的车体。
    this.viewer.render(this.app.kinematics.update(0),0);
    this.fitModel(false);
  }

  /** 以可见功能几何和当前画布宽高做相机适配，不改变模型比例/运动状态。 */
  fitModel(animate) {
    const v=this.viewer;
    v.carRoot.updateMatrixWorld(true);
    const bounds=new THREE.Box3();
    for(const node of v.nodesMap.values())if(node.visible)bounds.union(new THREE.Box3().setFromObject(node,true));
    if(bounds.isEmpty())return;
    bounds.expandByScalar(.018); // 轮侧箭头的额外空间
    const center=bounds.getCenter(new THREE.Vector3());
    const direction=new THREE.Vector3(-1,.85,1.15).normalize();
    const rotation=new THREE.Matrix4().lookAt(center.clone().add(direction),center,new THREE.Vector3(0,1,0));
    const inverse=rotation.clone().invert();
    const tanV=Math.tan(THREE.MathUtils.degToRad(v.camera.fov/2));
    const tanH=tanV*v.camera.aspect;
    let distance=0;
    // 用真实顶点而非空包围盒角落拟合，避免扁平车体被过分缩小。
    const objects=[...v.nodesMap.values(),v.leftArrowMesh,v.rightArrowMesh];
    for(const node of objects)if(node?.visible)node.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++){
        const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).sub(center).applyMatrix4(inverse);
        distance=Math.max(distance,Math.abs(p.x)/tanH+p.z,Math.abs(p.y)/tanV+p.z);
      }
    });
    distance*=1.16;
    const position=center.clone().addScaledVector(direction,distance);
    v.followOffsetDistance=distance*.82;
    v.followOffsetHeight=distance*.65;
    if(animate)v.smoothMoveCamera(position.toArray(),center.toArray());
    else{
      v.camera.position.copy(position);v.controls.target.copy(center);v.controls.update();
      v.isTransitioningCamera=false;
    }
  }
}
