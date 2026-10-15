export const ASSEMBLY_MODELS = {
  step: {
    url: './models/hero_robot_step_aligned.glb',
    label: 'STEP对齐（默认）',
    tag: 'STEP对齐 · 位置经用户确认 · 未机械认证',
    status: 'STEP对齐：位置经用户确认，未机械认证；同步带工作面与张紧未认证。'
  },
  original: {
    url: './models/hero_robot_clean.glb',
    label: '原样模型',
    tag: '原始GLB · 原样偏置子装配',
    status: '原样模型：原样偏置子组保留；主体取景可排除该组，完整资产取景可查看全部。'
  },
  inferred: {
    url: './models/hero_robot_inferred.glb',
    label: '旧推定修复候选',
    tag: '旧推定待机械核验 · 未机械核验',
    status: '旧推定装配：旧推定待机械核验，未认定真实装配关系。'
  }
};

export function assemblyKind(value) {
  return Object.hasOwn(ASSEMBLY_MODELS, value) ? value : 'step';
}
