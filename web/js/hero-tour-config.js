// 第一章只读展示配置。索引绑定冻结STEP资产，不能套用其他车型。
export const TOUR_MODEL = {
  url: './models/hero_robot_step_aligned.glb',
  sha256: 'cfb8cb7d333a7b8a6973424e2b774616604fef250c777530a6cbfa0674c599af'
};
export const TOUR_MODULES = {
  gimbal: {title: '云台', nodeIndices: [389]},
  chassis: {title: '底盘', nodeIndices: [135]},
  launcher: {title: '发射机构', nodeIndices: [2, 394]}
};
// 每个细节只表示CAD中已识别的结构位置，不认证实际在役硬件型号。
export const TOUR_DETAILS = {
  gimbal: [
    {id: 'yaw', title: 'Yaw · 水平旋转', nodeIndices: [543], note: '方向示意，不驱动真实关节。'},
    {id: 'pitch', title: 'Pitch · 俯仰', nodeIndices: [390], note: '展示俯仰含义；动力源、转轴及传动细节待确认。'},
    {id: 'belt', title: '同步带传动位置', nodeIndices: [551, 563], note: '两轮通过同步带连接的关系已确认；模型未补带，工作面、带路由及张紧未认证。'}
  ],
  chassis: [
    {id: 'frame', title: '承载车架', nodeIndices: [211], note: '车架承载整车结构。'},
    {id: 'wheel-a', title: '轮组 A', nodeIndices: [139], note: 'CAD电机 #142 → 联轴器 #143/#149 → 轮体 #145。'},
    {id: 'wheel-b', title: '轮组 B', nodeIndices: [152], note: 'CAD电机 #155 → 联轴器 #156/#162 → 轮体 #158。'},
    {id: 'wheel-c', title: '轮组 C', nodeIndices: [166], note: 'CAD电机 #171 → 联轴器 #167/#172 → 轮体 #175。'},
    {id: 'wheel-d', title: '轮组 D', nodeIndices: [248], note: 'CAD电机 #254 → 联轴器 #250/#255 → 轮体 #260。'},
    {id: 'drive', title: '底盘驱动电机', nodeIndices: [142, 155, 171, 254], note: 'CAD标注M3508减速电机；实车铭牌与接线待核对。'}
  ],
  launcher: [
    {id: 'channel', title: '发射通道所在结构', nodeIndices: [425], note: '枪管及其支承装配；不宣称完整弹丸路径已核验。'},
    {id: 'feeder', title: '拨弹装配', nodeIndices: [2], note: '拨叉 #32/#38、供弹管 #56 及弹路侧板 #60/#66；拨弹动力源待确认。'},
    {id: 'friction', title: '摩擦轮与动力部件', nodeIndices: [427, 434, 450], note: '三处电机与摩擦轮同属各自CAD子装配；不演示发射运动。'}
  ],
  motors: [
    {id: 'motor-a', title: '驱动电机 A', nodeIndices: [142], note: 'CAD M3508减速电机，实车型号待核对。'},
    {id: 'motor-b', title: '驱动电机 B', nodeIndices: [155], note: 'CAD M3508减速电机，实车型号待核对。'},
    {id: 'motor-c', title: '驱动电机 C', nodeIndices: [171], note: 'CAD M3508减速电机，实车型号待核对。'},
    {id: 'motor-d', title: '驱动电机 D', nodeIndices: [254], note: 'CAD M3508减速电机，实车型号待核对。'}
  ]
};
export const TOUR_SCENES = [
  {id: 'opening', title: '从一台英雄机器人开始认识电控', description: '先看到真正需要控制的机器人，再理解程序有什么作用。', keywords: ['看见结构', '理解任务'], module: null, details: null, camera: {direction: [-1, .8, 1.25], padding: 1.14}},
  {id: 'whole', title: '认识完整机器人', description: '想让机器人移动、瞄准和发射，需要控制哪些部分？', keywords: ['移动', '瞄准', '发射'], module: null, details: null, camera: {direction: [-1, .8, 1.25], padding: 1.14}},
  {id: 'gimbal', title: '云台 · 改变瞄准方向', description: '电机和控制程序，让云台朝目标方向转动。', keywords: ['蓝：Yaw 水平', '橙：Pitch 俯仰', '方向示意，非真实关节轴'], module: 'gimbal', details: 'gimbal', camera: {direction: [-1, .65, 1.25], padding: 1.2}},
  {id: 'chassis', title: '底盘 · 承载与移动', description: '车架承载整车，电机通过机械传动驱动车轮。', keywords: ['车架', '轮组', '驱动电机'], module: 'chassis', details: 'chassis', camera: {direction: [-1, .8, 1.25], padding: 1.18}},
  {id: 'launcher', title: '发射机构 · 输送与发射', description: '让相关执行机构按要求工作，是电控的任务。', keywords: ['拨弹', '通道', '动力部件'], module: 'launcher', details: 'launcher', camera: {direction: [-1, .7, 1.25], padding: 1.2}},
  {id: 'motors', title: '从结构走向电机', description: '结构功能不同，许多运动都依靠电机。接下来，认识电机与动力。', keywords: ['云台瞄准', '底盘移动', '机构发射'], module: null, details: 'motors', camera: {direction: [-1, .8, 1.25], padding: 1.14}}
];
// 用于加载期fail-closed核对：不是名称关键字搜索。
export const TOUR_NODE_GUARDS = [
  [1, null, '整车5'], [2, 1, '拨弹盘4'], [135, 1, '底盘4.0 - 副本'],
  [137, 135, '底盘2.0'], [139, 137, '轮组2.1'], [152, 137, '轮组2.1'],
  [166, 137, '轮组2.2'], [248, 137, '轮组2.2'], [211, 137, '车架'],
  [389, 1, '云台2(齿轮改)'], [390, 389, '云台底座1'],
  [394, 390, '发射机构1'], [425, 424, '枪管装配鹅颈'],
  [427, 425, '电机带摩擦轮'], [434, 425, '电机带摩擦轮'], [450, 425, '镜向电机带摩擦轮1'],
  [543, 389, 'yaw轴3改'], [549, 543, 'Yaw轴装配体2.1改'],
  [551, 549, 'yaw轴3改-1/Yaw轴装配体2.1改-1/从动齿轮  2M45齿-1'],
  [563, 543, 'yaw轴3改-1/主动齿轮  2M45齿-1']
];
