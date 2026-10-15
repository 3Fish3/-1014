/**
 * Three.js 3D 渲染与场景控制器 (viewer.js)
 * 单一 WebGLRenderer 架构，严格遵循低显存占用与资源可释放原则。
 */

import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';

export class SceneViewer {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.width = canvasContainer.clientWidth || window.innerWidth;
    this.height = canvasContainer.clientHeight || window.innerHeight;

    // 1. 初始化渲染器 (限制 DPR <= 2 防止 4K 屏幕显存爆炸)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.append(this.renderer.domElement);

    // 2. 场景与相机
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e131d);

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.05, 50);
    this.camera.position.set(0.40, 0.32, 0.42);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.48; // 防止镜头翻到地面以下
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 6.0;
    this.controls.target.set(0, 0.03, 0);

    // 3. 灯光布局
    this.setupLights();

    // 4. 模型组与节点缓存
    this.carRoot = new THREE.Group();
    this.scene.add(this.carRoot);

    this.diffCarModel = null;
    this.heroRobotModel = null;
    this.nodesMap = new Map();
    this.originalMaterials = new Map();
    this.heroRobotPromise = null;
    this.heroRobotUrl = null;
    this.heroPendingUrl = null;
    this.heroRequestId = 0;
    this.diffCarPromise = null;
    this.currentStep = null;
    this.isComparison = false;
    this.disposed = false;

    // 5. 地面参考网格与接触阴影
    this.setupEnvironment();

    // 6. 轮子自转与指示箭头引用
    this.leftWheelNode = null;
    this.rightWheelNode = null;
    this.leftArrowMesh = null;
    this.rightArrowMesh = null;

    // 7. 动态轨迹线对象
    this.trajectoryLine = null;
    this.setupTrajectoryLine();

    // 8. 摄像机跟踪与过渡插值状态
    this.cameraMode = 'FIXED'; // 'FIXED' | 'FOLLOW'
    this.targetCameraPos = null;
    this.targetCameraLookAt = null;
    this.isTransitioningCamera = false;

    // 9. 窗口尺寸自适应与可见性监听
    this.handleResize = () => {
      this.width = this.container.clientWidth || 1;
      this.height = this.container.clientHeight || 1;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
    };
    window.addEventListener('resize', this.handleResize);

    this.isPaused = false;
    this.handleVisibilityChange = () => {
      this.isPaused = document.hidden;
    };
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff6ea, 2.2);
    keyLight.position.set(2.5, 4.0, 2.5);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x88bbff, 1.4);
    fillLight.position.set(-2.5, 2.0, -2.0);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x00f0ff, 0.8);
    rimLight.position.set(0, 3.0, -3.5);
    this.scene.add(rimLight);
  }

  setupEnvironment() {
    // 现代化极客网格地面 (主网格 + 细网格)
    const gridHelper = new THREE.GridHelper(6.0, 60, 0x00d2ff, 0x1f293d);
    gridHelper.position.y = -0.001;
    this.scene.add(gridHelper);

    // 不使用无纹理的黑色平面模拟阴影，避免遮住教学网格。
  }

  setupTrajectoryLine() {
    const maxPoints = 500;
    const positions = new Float32Array(maxPoints * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });

    this.trajectoryLine = new THREE.Line(geometry, material);
    this.trajectoryLine.frustumCulled = false;
    this.scene.add(this.trajectoryLine);
  }

  /** 加载教学小车 GLB 模型 */
  async loadDiffCar(url) {
    if (this.disposed) throw new Error('Viewer disposed');
    if (this.diffCarModel) return this.diffCarModel;
    if (this.diffCarPromise) return this.diffCarPromise;
    const loader = new GLTFLoader();
    this.diffCarPromise = new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          if (this.disposed) {
            this.releaseResources(gltf.scene);
            resolve(null);
            return;
          }
          this.diffCarModel = gltf.scene;
          this.diffCarModel.position.y += 0.035;
          this.nodesMap.clear();

          // 递归遍历并记录具名节点与其初始材质
          this.diffCarModel.traverse((child) => {
            if (child.name.startsWith('Node_')) {
              this.nodesMap.set(child.name, child);
            }
            if (child.isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;
              // 保留 glTF 材质与贴图；只备份发光色供步骤聚焦恢复。
              for (const material of [child.material].flat()) {
                if (material?.emissive && !this.originalMaterials.has(material)) {
                  this.originalMaterials.set(material, material.emissive.clone());
                }
              }
            }
          });

          // 捕获关键运动节点
          this.leftWheelNode = this.nodesMap.get('Node_LeftWheel');
          this.rightWheelNode = this.nodesMap.get('Node_RightWheel');
          this.leftWheelBase = this.leftWheelNode?.quaternion.clone();
          this.rightWheelBase = this.rightWheelNode?.quaternion.clone();

          // 为左右轮装配动态旋转指示光环箭头
          this.setupWheelArrows();

          this.carRoot.add(this.diffCarModel);
          if (this.currentStep) this.applyStepState(this.currentStep);
          resolve(this.diffCarModel);
        },
        undefined,
        (err) => reject(err)
      );
    }).catch((err) => {
      this.diffCarPromise = null;
      throw err;
    });
    return this.diffCarPromise;
  }

  /** 创建左右轮旋转指示箭头 */
  setupWheelArrows() {
    const createArrowRing = (isLeft) => {
      const ringGroup = new THREE.Group();
      // 半圆环
      const arcGeo = new THREE.TorusGeometry(0.046, 0.0028, 12, 32, Math.PI * 1.1);
      const arcMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.95
      });
      const arcMesh = new THREE.Mesh(arcGeo, arcMat);
      // 箭头圆锥
      const coneGeo = new THREE.ConeGeometry(0.007, 0.016, 12);
      const coneMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      // 圆弧起点的切向为 +Y，与绕 +X 的轮转一致。
      coneMesh.position.set(0.046, 0, 0);

      ringGroup.add(arcMesh);
      ringGroup.add(coneMesh);

      // 调整到轮子外侧，垂直于轮轴 (沿 Y-Z 平面，朝外偏移)
      ringGroup.rotation.y = Math.PI / 2;
      ringGroup.position.set(isLeft ? -0.112 : 0.112, 0.035, 0);
      ringGroup.visible = false;
      return ringGroup;
    };

    this.leftArrowMesh = createArrowRing(true);
    this.rightArrowMesh = createArrowRing(false);
    this.carRoot.add(this.leftArrowMesh);
    this.carRoot.add(this.rightArrowMesh);
  }

  /** 按需懒加载英雄机器人整车模型 */
  async loadHeroRobot(url) {
    if (this.disposed) throw new Error('Viewer disposed');
    if (this.heroRobotModel && this.heroRobotUrl === url && !this.heroRobotPromise) {
      this.heroRobotModel.visible = !this.currentStep || this.isComparison;
      return this.heroRobotModel;
    }
    if (this.heroRobotPromise && this.heroPendingUrl === url) return this.heroRobotPromise;
    const requestId = ++this.heroRequestId;
    this.heroPendingUrl = url;
    const loader = new GLTFLoader();
    this.heroRobotPromise = new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          if (this.disposed || requestId !== this.heroRequestId) {
            this.releaseResources(model);
            resolve(null);
            return;
          }
          model.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(model);
          const size = bounds.getSize(new THREE.Vector3());
          const extent = Math.max(size.x, size.y, size.z);
          if (bounds.isEmpty() || !Number.isFinite(extent) || extent <= 0) {
            this.releaseResources(model);
            reject(new Error('整车模型包围盒无效'));
            return;
          }
          const center = bounds.getCenter(new THREE.Vector3());
          const scale = 0.48 / extent;
          // 外层展示变换，不改变 glTF 内部姿态、材质或贴图。
          const normalized = new THREE.Group();
          normalized.add(model);
          normalized.scale.setScalar(scale);
          normalized.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
          this.comparisonView?.restoreLayers();
          this.clearComparisonHighlight();
          if (this.heroRobotModel) {
            this.scene.remove(this.heroRobotModel);
            this.releaseResources(this.heroRobotModel);
          }
          this.heroRobotUrl = url;
          this.heroOffsetGroup = null;
          model.traverse(node => {
            const index = gltf.parser.associations.get(node)?.nodes;
            if (index !== undefined) node.userData.cadName = gltf.parser.json.nodes[index].name || '';
            else if (node.isMesh && node.parent?.userData.cadName) node.userData.cadName = node.parent.userData.cadName;
            if (index === 549) this.heroOffsetGroup = node;
          });
          this.heroRobotModel = new THREE.Group();
          this.heroRobotModel.add(normalized);
          this.heroRobotModel.position.x = 0.32;
          this.heroRobotModel.visible = !this.currentStep || this.isComparison;
          this.scene.add(this.heroRobotModel);
          if (this.comparisonKind) this.highlightComparison(this.comparisonKind);
          this.comparisonView?.syncModels();
          resolve(this.heroRobotModel);
        },
        undefined,
        (err) => reject(err)
      );
    }).finally(() => {
      if (requestId === this.heroRequestId) {
        this.heroRobotPromise = null;
        this.heroPendingUrl = null;
      }
    });
    return this.heroRobotPromise;
  }

  /** 根据当前教学步骤更新部件可见性与高亮聚焦 */
  applyStepState(step) {
    if (this.disposed) return;
    this.clearComparisonHighlight();
    this.comparisonKind = null;
    this.currentStep = step;
    if (this.instructionMarker) this.instructionMarker.visible = false;
    this.isComparison = Boolean(step.isComparisonStep);
    if (this.heroRobotModel) this.heroRobotModel.visible = this.isComparison;
    this.trajectoryLine.visible = !this.isComparison;

    const isAll = step.activeNodes.includes("ALL");
    const activeSet = new Set(step.activeNodes);

    // 只修改功能节点自身，glTF 父节点和子 Mesh 的显隐不互相覆盖。
    for (const [name, node] of this.nodesMap) {
      node.visible = isAll || activeSet.has(name);
    }
    for (const [material, emissive] of this.originalMaterials) {
      material.emissive.copy(emissive);
    }
    const focused = this.nodesMap.get(step.focusNode);
    const highlight = (node) => {
      if (node !== focused && node.name.startsWith('Node_')) return;
      if (node.isMesh) {
        for (const material of [node.material].flat()) {
          if (material?.emissive) material.emissive.setHex(0x004455);
        }
      }
      node.children.forEach(highlight);
    };
    if (focused) highlight(focused);

    // 运动箭头显示策略：仅在运动演示步骤展示
    const showArrows = Boolean(step.isPresetMotionStep || step.isFreeSliderStep);
    if (this.leftArrowMesh) this.leftArrowMesh.visible = showArrows;
    if (this.rightArrowMesh) this.rightArrowMesh.visible = showArrows;

    // 实车对照模式切换
    if (step.isComparisonStep) {
      // 教学小车站位左移，展示整车
      this.carRoot.position.x = -0.38;
      if (this.heroRobotModel) {
        this.heroRobotModel.visible = true;
      }
    } else {
      // 恢复中心站位，隐藏整车
      this.carRoot.position.x = 0;
      if (this.heroRobotModel) {
        this.heroRobotModel.visible = false;
      }
    }

    // 相机平滑运镜
    if (this.isComparison) {
      this.carRoot.position.set(-0.38, 0, 0);
      this.carRoot.rotation.y = 0;
      this.smoothMoveCamera([0.72, 0.55, 0.95], [0, 0.15, 0]);
    } else if (step.focusCamera) {
      this.smoothMoveCamera(step.focusCamera.pos, step.focusCamera.target);
    }
  }

  /** 恢复对照高亮前的材质，并释放临时克隆。 */
  clearComparisonHighlight() {
    if (!this.comparisonHighlights) return;
    for (const [mesh, original] of this.comparisonHighlights) {
      for (const material of [mesh.material].flat()) material.dispose();
      mesh.material = original;
    }
    this.comparisonHighlights.clear();
  }

  /** 仅按可识别的部件名称匹配；返回空数组表示无匹配，不推测主控/供电。 */
  highlightComparison(kind) {
    this.clearComparisonHighlight();
    this.comparisonKind = kind;
    const result = { kind, teaching: [], hero: [] };
    if (this.disposed) return result;
    const patterns = {
      wheel: /(?:wheel|caster|官方麦轮|车轮|轮胎)/i,
      motor: /motor|电机/i,
      frame: /frame|车架|底盘|框架|铝管30x30x270|外壳下铝管30x15x200/i
    };
    const pattern = patterns[kind];
    if (!['wheel','motor','frame','power','control'].includes(kind)) return result;
    this.comparisonHighlights = new Map();
    const teachingNames = {
      wheel: ['Node_LeftWheel', 'Node_RightWheel', 'Node_Casters'],
      motor: ['Node_LeftMotor', 'Node_RightMotor'],
      frame: ['Node_Frame'],
      power: ['Node_Battery', 'Node_BuckConverter'],
      control: ['Node_STM32', 'Node_MotorDriver']
    };
    const visit = (root, names, teaching = false) => {
      if (!root) return;
      root.traverse((node) => {
        // CAD 节点名含完整路径，只匹配末段，避免“底盘/电机”误算车架。
        const name = (node.userData.cadName || node.name).split('/').at(-1);
        if (teaching ? !teachingNames[kind].includes(node.name) :
          (!node.isMesh || !pattern || !pattern.test(name) ||
            (kind === 'wheel' && /侧板|法兰|联轴器|固定|支架/i.test(name)))) return;
        names.push(node.name);
        const paint = (mesh) => {
          if (!mesh.isMesh || this.comparisonHighlights.has(mesh)) return;
          const original = mesh.material;
          const copies = [original].flat().map((material) => {
            const copy = material.clone();
            if (copy.emissive) copy.emissive.setHex(0x007788);
            if (copy.color) copy.color.setHex(0x00cce6);
            // 原厂CAD含unlit材质，不能只改无效的emissive。
            copy.vertexColors = false;
            return copy;
          });
          this.comparisonHighlights.set(mesh, original);
          mesh.material = Array.isArray(original) ? copies : copies[0];
        };
        // 功能组允许覆盖无独立命名的几何，独立命名的子功能由自身匹配。
        const descend = (child) => {
          paint(child);
          child.children.forEach((next) => {
            if (!next.name) descend(next);
          });
        };
        descend(node);
      });
    };
    visit(this.diffCarModel, result.teaching, true);
    visit(this.heroRobotModel, result.hero);
    return result;
  }

  /** 分步指令/执行传播标记；颜色区分逻辑信号与电机功率输出。 */
  setInstructionStage(stage) {
    if (!this.instructionMarker) {
      this.instructionMarker = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), new THREE.MeshBasicMaterial({color:0x00e5ff}));
      this.carRoot.add(this.instructionMarker);
    }
    this.instructionStage = stage;
    this.instructionProgress = 0;
    this.instructionMarker.visible = true;
    this.instructionMarker.material.color.setHex(stage === 2 ? 0xff8030 : 0x00e5ff);
  }

  /** 平滑运镜过渡 */
  smoothMoveCamera(targetPos, targetLookAt) {
    this.targetCameraPos = new THREE.Vector3(...targetPos);
    this.targetCameraLookAt = new THREE.Vector3(...targetLookAt);
    this.isTransitioningCamera = true;
  }

  /** 更新仿真动态渲染 (每帧调用) */
  render(kinematicsState, simulationDt = 1 / 60) {
    if (this.disposed || this.isPaused) return;
    const dt = Number.isFinite(simulationDt) ? Math.max(0, simulationDt) : 0;
    const cameraAlpha = 1 - Math.pow(0.92, dt * 60);
    const targetAlpha = 1 - Math.pow(0.9, dt * 60);

    if (this.instructionMarker?.visible) {
      this.instructionProgress = (this.instructionProgress + dt * 0.65) % 1;
      const source = new THREE.Vector3(.015,.085,.038);
      const driver = new THREE.Vector3(0,.085,-.035);
      const motor = new THREE.Vector3(-.065,.035,0);
      this.instructionMarker.position.copy(this.instructionStage === 2 ? driver : source)
        .lerp(this.instructionStage === 0 ? source : this.instructionStage === 1 ? driver : motor, this.instructionProgress);
    }
    // 1. 同步小车空间位姿 (X, Z 与 Yaw)
    if (this.carRoot && kinematicsState) {
      this.carRoot.position.set(this.isComparison ? -0.38 : kinematicsState.x, 0,
        this.isComparison ? 0 : kinematicsState.z);
      this.carRoot.rotation.y = this.isComparison ? 0 : kinematicsState.yaw;

      // 2. 同步左右驱动轮在局部坐标系下的自转 (绕 X 轴旋转)
      if (this.leftWheelNode) {
        this.leftWheelNode.quaternion.copy(this.leftWheelBase).multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), kinematicsState.wheelRotLeft));
      }
      if (this.rightWheelNode) {
        this.rightWheelNode.quaternion.copy(this.rightWheelBase).multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), kinematicsState.wheelRotRight));
      }

      // 3. 同步轮子指示箭头的方向与视觉速度
      if (dt > 0 && this.leftArrowMesh && this.leftArrowMesh.visible) {
        // 根据实际转速缩放和旋转箭头
        const dirL = kinematicsState.actualLeft >= 0 ? 1 : -1;
        if (kinematicsState.actualLeft !== 0) this.leftArrowMesh.scale.set(1, dirL, 1);
        this.leftArrowMesh.rotation.x = kinematicsState.wheelRotLeft;
      }
      if (dt > 0 && this.rightArrowMesh && this.rightArrowMesh.visible) {
        const dirR = kinematicsState.actualRight >= 0 ? 1 : -1;
        if (kinematicsState.actualRight !== 0) this.rightArrowMesh.scale.set(1, dirR, 1);
        this.rightArrowMesh.rotation.x = kinematicsState.wheelRotRight;
      }
    }

    // 4. 更新地面运动轨迹线条
    if (this.trajectoryLine && kinematicsState && kinematicsState.trajectory) {
      const capacity = this.trajectoryLine.geometry.attributes.position.count;
      const pts = kinematicsState.trajectory.slice(-capacity);
      const positions = this.trajectoryLine.geometry.attributes.position.array;
      for (let i = 0; i < pts.length; i++) {
        positions[i * 3 + 0] = pts[i].x;
        positions[i * 3 + 1] = 0.002; // 微浮于地面
        positions[i * 3 + 2] = pts[i].z;
      }
      this.trajectoryLine.geometry.setDrawRange(0, pts.length);
      this.trajectoryLine.geometry.attributes.position.needsUpdate = true;
    }

    // 5. 跟随视角逻辑
    if (this.cameraMode === 'FOLLOW' && kinematicsState && !this.isComparison) {
      const offsetDist = this.followOffsetDistance ?? 0.55;
      const offsetHeight = this.followOffsetHeight ?? 0.38;
      // 保持相机在车身后上方
      const carYaw = kinematicsState.yaw;
      const camX = kinematicsState.x - Math.sin(carYaw) * offsetDist;
      const camZ = kinematicsState.z - Math.cos(carYaw) * offsetDist;
      this.camera.position.lerp(new THREE.Vector3(camX, offsetHeight, camZ), cameraAlpha);
      this.controls.target.lerp(new THREE.Vector3(kinematicsState.x, 0.04, kinematicsState.z), targetAlpha);
    }

    // 6. 镜头平滑插值过渡
    if (this.isTransitioningCamera && this.targetCameraPos && this.targetCameraLookAt) {
      this.camera.position.lerp(this.targetCameraPos, cameraAlpha);
      this.controls.target.lerp(this.targetCameraLookAt, cameraAlpha);
      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.005) {
        this.isTransitioningCamera = false;
      }
    }

    if (dt > 0) this.controls.update();
    if (this.comparisonView?.active) this.comparisonView.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** 去重释放模型/场景资源，也用于 dispose 后迟到的加载结果。 */
  releaseResources(root) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const collectTexture = (value) => {
      if (value?.isTexture) textures.add(value);
      else if (Array.isArray(value)) value.forEach(collectTexture);
    };
    root.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of [node.material].flat()) {
        if (!material) continue;
        materials.add(material);
        Object.values(material).forEach(collectTexture);
        if (material.uniforms) {
          Object.values(material.uniforms).forEach((uniform) => collectTexture(uniform.value));
        }
      }
    });
    collectTexture(root.background);
    collectTexture(root.environment);
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }

  /** 清理释放 WebGL 资源 */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.comparisonView?.dispose();
    this.controls.dispose();
    this.clearComparisonHighlight();
    this.releaseResources(this.scene);
    this.scene.clear();
    this.nodesMap.clear();
    this.originalMaterials.clear();
    this.currentStep = null;
    this.diffCarModel = null;
    this.heroRobotModel = null;
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
