import test from 'node:test';
import assert from 'node:assert/strict';
import { TransformHistory } from '../web/js/model-editor/transform-history.js';

test('TransformHistory: 默认容量与边界限制', () => {
  const history = new TransformHistory(50);
  assert.equal(history.limit, 50);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

test('TransformHistory: 记录操作、undo/redo 正确性与清空 redo 栈', () => {
  const history = new TransformHistory();

  const t0 = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  const t1 = { translation: [1, 1, 1], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  const t2 = { translation: [2, 2, 2], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };

  history.record(0, t0, t1);
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);

  // Undo 回到 t0
  const undoResult = history.undo();
  assert.equal(undoResult.nodeIndex, 0);
  assert.deepEqual(undoResult.transform.translation, [0, 0, 0]);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);

  // Redo 回到 t1
  const redoResult = history.redo();
  assert.equal(redoResult.nodeIndex, 0);
  assert.deepEqual(redoResult.transform.translation, [1, 1, 1]);
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);

  // 再次撤销后记录新操作，应清空 redo 栈
  history.undo();
  assert.equal(history.canRedo, true);
  history.record(0, t0, t2);
  assert.equal(history.canRedo, false);
  assert.equal(history.canUndo, true);
});

test('TransformHistory: 深度拷贝隔离，外部修改不污染历史快照', () => {
  const history = new TransformHistory();
  const before = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  const after = { translation: [10, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };

  history.record(1, before, after);

  // 外部对象就地修改
  before.translation[0] = 999;
  after.translation[0] = 888;

  const undo = history.undo();
  assert.equal(undo.transform.translation[0], 0);

  const redo = history.redo();
  assert.equal(redo.transform.translation[0], 10);
});

test('TransformHistory: 至少 20 级撤销支持与溢出丢弃最老记录', () => {
  const limit = 25;
  const history = new TransformHistory(limit);

  for (let i = 0; i < 30; i++) {
    history.record(
      0,
      { translation: [i, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      { translation: [i + 1, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }
    );
  }

  // 检查已存满且溢出（只有最近 25 条）
  let undoCount = 0;
  let lastTransform = null;
  while (history.canUndo) {
    lastTransform = history.undo().transform;
    undoCount++;
  }

  assert.equal(undoCount, 25);
  // 最早保留的一条是第 5 次记录（i=5），其 before.translation 为 5
  assert.equal(lastTransform.translation[0], 5);
});

test('TransformHistory: 空栈 undo/redo 与 clear()', () => {
  const history = new TransformHistory();
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);

  history.record(0, { translation: [0, 0, 0] }, { translation: [1, 1, 1] });
  history.clear();
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
});
