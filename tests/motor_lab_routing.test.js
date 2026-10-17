import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three/three.module.js';
import { createCableRoute, findCableIntersections, findMeshCableIntersections } from '../web/js/motor-lab/cable-routing.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

test('cable starts at each socket, leaves along its normal and ends facing the destination', () => {
  const a = v(-1, .3, 0), b = v(1, .4, 0);
  const route = createCableRoute(a, v(-1, 0, 0), b, v(1, 0, 0), []);
  assert(route.getPoint(0).distanceTo(a) < 1e-9);
  assert(route.getPoint(1).distanceTo(b) < 1e-9);
  assert(route.getTangent(0).dot(v(-1, 0, 0)) > .999);
  assert(route.getTangent(1).dot(v(-1, 0, 0)) > .999);
  assert(route.getSpacedPoints(128).every(p => p.toArray().every(Number.isFinite)));
});

test('lift clears an intervening device and keeps both exit legs outside the bodies', () => {
  const a = v(-1, .3, 0), b = v(1, .3, 0);
  const boxes = [
    ['left', new THREE.Box3(v(-1.5, 0, -.4), v(-1, .7, .4))],
    ['middle', new THREE.Box3(v(-.3, 0, -.3), v(.3, 1.1, .3))],
    ['right', new THREE.Box3(v(1, 0, -.4), v(1.5, .7, .4))]
  ];
  const route = createCableRoute(a, v(1, 0, 0), b, v(-1, 0, 0), boxes);
  assert(Math.max(...route.getSpacedPoints(128).map(p => p.y)) > 1.2);
  assert.deepEqual(findCableIntersections(route, boxes, a, b), []);
});

test('top sockets rise vertically without diving back through their own enclosure', () => {
  const a = v(-.6, .4, 0), b = v(.6, .4, 0);
  const boxes = [['body', new THREE.Box3(v(-1, 0, -.4), v(1, .4, .4))]];
  const route = createCableRoute(a, v(0, 1, 0), b, v(0, 1, 0), boxes);
  assert.deepEqual(findCableIntersections(route, boxes, a, b), []);
  assert(route.getTangent(0).y > .999);
});

test('collision check detects a real midspan hit and does not inspect untransformed plug vertices', () => {
  const a = v(-1, .3, 0), b = v(1, .3, 0);
  const straight = new THREE.LineCurve3(a, b);
  const box = new THREE.Box3(v(-.2, .1, -.2), v(.2, .5, .2));
  const hits = findCableIntersections(straight, [['obstacle', box]], a, b);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].device, 'obstacle');
  assert(hits[0].samples > 0);
});

test('triangle refinement clears a real opening but detects an inserted solid in world coordinates', () => {
  const a = v(-1, .3, 0), b = v(1, .3, 0), route = new THREE.LineCurve3(a, b);
  const frame = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const [dimensions, position] of [
    [[.4, .1, 1], [0, .75, 0]], [[.4, .1, 1], [0, -.15, 0]],
    [[.4, .8, .1], [0, .3, .45]], [[.4, .8, .1], [0, .3, -.45]]
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
    mesh.position.set(...position);frame.add(mesh);
  }
  frame.position.x = .25;
  frame.updateWorldMatrix(true, true);
  const boxes = [['frame', new THREE.Box3().setFromObject(frame)]];
  const candidates = findCableIntersections(route, boxes, a, b);
  assert.equal(candidates.length, 1, 'the whole device box includes the empty opening');
  assert.deepEqual(findMeshCableIntersections(route, candidates, new Map([['frame', frame]]), a, b), []);
  const obstacle = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, .3), material);
  obstacle.position.set(0, .3, 0);frame.add(obstacle);
  assert.equal(findMeshCableIntersections(route, candidates, new Map([['frame', frame]]), a, b).length, 1);
});
