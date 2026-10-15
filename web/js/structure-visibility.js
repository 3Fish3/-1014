// 仅管理运行时显隐；不修改几何、节点变换或任何源文件。
export class StructureVisibility {
  constructor(root, nodes, defaultHidden = []) {
    this.root = root;
    this.nodes = nodes;
    this.defaults = new Map();
    root.traverse(object => this.defaults.set(object, object.visible));
    for (const index of defaultHidden) this.defaults.set(this.node(index), false);
    this.isolationSnapshot = null;
    this.isolatedIndex = null;
    this.resetDefault();
  }

  node(index) {
    const object = this.nodes.get(index);
    if (!object) throw new Error(`未找到源节点 #${index}`);
    return object;
  }

  isVisible(object) {
    for (let current = object; current; current = current.parent) {
      if (!current.visible) return false;
      if (current === this.root) return true;
    }
    return false;
  }

  snapshot() {
    const state = new Map();
    this.root.traverse(object => state.set(object, object.visible));
    return state;
  }

  restore(state) {
    for (const [object, visible] of state) object.visible = visible;
  }

  exitIsolation() {
    if (this.isolationSnapshot) this.restore(this.isolationSnapshot);
    this.isolationSnapshot = null;
    this.isolatedIndex = null;
  }

  hide(index) {
    const object = this.node(index);
    this.exitIsolation();
    object.visible = false;
  }

  show(index) {
    const object = this.node(index);
    this.exitIsolation();
    // 显示必要祖先；不冲掉组内其他零件自己设置的隐藏状态。
    for (let current = object; current; current = current.parent) {
      current.visible = true;
      if (current === this.root) break;
    }
  }

  isolate(index) {
    const selected = this.node(index);
    const snapshot = this.isolationSnapshot || this.snapshot();
    this.restore(snapshot);
    const included = new Set();
    selected.traverse(object => included.add(object));
    for (let object = selected; object; object = object.parent) {
      included.add(object);
      if (object === this.root) break;
    }
    this.root.traverse(object => { object.visible = included.has(object); });
    this.isolationSnapshot = snapshot;
    this.isolatedIndex = index;
  }

  showAll() {
    this.isolationSnapshot = null;
    this.isolatedIndex = null;
    this.root.traverse(object => { object.visible = true; });
  }

  resetDefault() {
    this.isolationSnapshot = null;
    this.isolatedIndex = null;
    this.restore(this.defaults);
  }
}
