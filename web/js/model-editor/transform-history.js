/**
 * 历史记录管理类
 * - 维护操作历史与撤销/重做栈
 * - 记录前后状态时进行深拷贝
 * - 限制历史最大长度 (默认 50，满足至少 20 级)
 * - UI 自己应用记录
 */

function cloneTransform(t) {
  if (!t || typeof t !== 'object') return null;
  return {
    translation: Array.isArray(t.translation) ? [...t.translation] : [0, 0, 0],
    rotation: Array.isArray(t.rotation) ? [...t.rotation] : [0, 0, 0, 1],
    scale: Array.isArray(t.scale) ? [...t.scale] : [1, 1, 1]
  };
}

export class TransformHistory {
  /**
   * @param {number} [limit=50]
   */
  constructor(limit = 50) {
    if (typeof limit !== 'number' || limit <= 0) {
      this.limit = 50;
    } else {
      this.limit = limit;
    }
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * 记录一次节点变换。
   * 新记录会清空 redo 栈。
   * @param {number} nodeIndex
   * @param {Object} before
   * @param {Object} after
   */
  record(nodeIndex, before, after) {
    if (typeof nodeIndex !== 'number' || !Number.isInteger(nodeIndex) || nodeIndex < 0) {
      throw new Error(`TransformHistory: 无效的 nodeIndex ${nodeIndex}`);
    }

    const entry = {
      nodeIndex,
      before: cloneTransform(before),
      after: cloneTransform(after)
    };

    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }

    // 清空 redo 栈
    this.redoStack = [];
  }

  /**
   * 撤销最近一次操作。
   * @returns {{nodeIndex: number, transform: Object}|null}
   */
  undo() {
    if (this.undoStack.length === 0) {
      return null;
    }

    const entry = this.undoStack.pop();
    this.redoStack.push(entry);

    return {
      nodeIndex: entry.nodeIndex,
      transform: cloneTransform(entry.before)
    };
  }

  /**
   * 重做最近一次撤销的操作。
   * @returns {{nodeIndex: number, transform: Object}|null}
   */
  redo() {
    if (this.redoStack.length === 0) {
      return null;
    }

    const entry = this.redoStack.pop();
    this.undoStack.push(entry);

    return {
      nodeIndex: entry.nodeIndex,
      transform: cloneTransform(entry.after)
    };
  }

  /**
   * 清空所有历史与重做记录。
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * @returns {boolean}
   */
  get canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * @returns {boolean}
   */
  get canRedo() {
    return this.redoStack.length > 0;
  }
}
