import * as THREE from '../../vendor/three/three.module.js';

// Display routing only: no wire gauge, bend-radius or electrical certification.
function escapePoint(point, normal, boxes, radius) {
  let distance = .16;
  for (const [, box] of boxes) {
    const padded = box.clone().expandByScalar(radius + .025);
    if (!padded.containsPoint(point)) continue;
    let exit = Infinity;
    for (const axis of ['x', 'y', 'z']) {
      if (normal[axis] > 1e-6) exit = Math.min(exit, (padded.max[axis] - point[axis]) / normal[axis]);
      if (normal[axis] < -1e-6) exit = Math.min(exit, (padded.min[axis] - point[axis]) / normal[axis]);
    }
    if (Number.isFinite(exit)) distance = Math.max(distance, exit + .10);
  }
  return point.clone().addScaledVector(normal, distance);
}

function crossesFootprint(a, b, box, padding) {
  let t0 = 0, t1 = 1;
  for (const axis of ['x', 'z']) {
    const delta = b[axis] - a[axis];
    const min = box.min[axis] - padding, max = box.max[axis] + padding;
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      let lo = (min - a[axis]) / delta, hi = (max - a[axis]) / delta;
      if (lo > hi) [lo, hi] = [hi, lo];
      t0 = Math.max(t0, lo);t1 = Math.min(t1, hi);
      if (t0 > t1) return false;
    }
  }
  return true;
}

export function createCableRoute(a, normalA, b, normalB, boxes, lane = 0, radius = .022) {
  const na = normalA.clone().normalize(), nb = normalB.clone().normalize();
  const start = escapePoint(a, na, boxes, radius), end = escapePoint(b, nb, boxes, radius);
  let height = Math.max(start.y, end.y) + .22 + lane * .025;
  for (const [, box] of boxes) {
    if (crossesFootprint(start, end, box, radius + .04)) height = Math.max(height, box.max.y + .22 + lane * .025);
  }
  const topA = new THREE.Vector3(start.x, height, start.z), topB = new THREE.Vector3(end.x, height, end.z);
  const roundA = Math.min(.32, Math.max(.10, (height - start.y) * .4));
  const roundB = Math.min(.32, Math.max(.10, (height - end.y) * .4));
  const upA = new THREE.Vector3(0, roundA, 0), upB = new THREE.Vector3(0, roundB, 0);
  const route = new THREE.CurvePath();
  route.add(new THREE.LineCurve3(a.clone(), start));
  route.add(new THREE.CubicBezierCurve3(start, start.clone().addScaledVector(na, roundA), topA.clone().sub(upA), topA));
  route.add(new THREE.CubicBezierCurve3(topA, topA.clone().add(upA), topB.clone().add(upB), topB));
  route.add(new THREE.CubicBezierCurve3(topB, topB.clone().sub(upB), end.clone().addScaledVector(nb, roundB), end));
  route.add(new THREE.LineCurve3(end, b.clone()));
  return route;
}

export function findCableIntersections(route, boxes, a, b, radius = .022) {
  const points = route.getSpacedPoints(160), hits = [];
  for (const [device, box] of boxes) {
    const padded = box.clone().expandByScalar(radius);
    // Plug seating regions intentionally meet the device surface.
    const samples = points.filter(p => p.distanceTo(a) > .095 && p.distanceTo(b) > .095 && padded.containsPoint(p)).length;
    if (samples) hits.push({ device, samples });
  }
  return hits;
}

// A device AABB includes empty space, notably the recessed XT60 access channel.
// Refine broad-phase candidates against visible, world-transformed triangles.
// Seven offset segment rays sample the tube; this is a visual check, not CAD CCD.
export function findMeshCableIntersections(route, candidates, roots, a, b, radius = .022) {
  const points = route.getSpacedPoints(192), hits = [];
  const offsets = [new THREE.Vector3()];
  for (const axis of ['x', 'y', 'z']) for (const sign of [-1, 1]) {
    const offset = new THREE.Vector3();offset[axis] = sign * radius;offsets.push(offset);
  }
  const ray = new THREE.Raycaster();
  for (const { device } of candidates) {
    const root = roots.get(device);
    if (!root) throw new Error(`Missing collision model: ${device}`);
    root.updateWorldMatrix(true, true);
    const modelBox = new THREE.Box3().setFromObject(root);
    const segmentBox = new THREE.Box3();
    const meshes = [];
    root.traverseVisible(object => { if (object.isMesh) meshes.push(object); });
    let segments = 0;
    let firstHit = null;
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1], to = points[i];
      segmentBox.setFromPoints([from, to]).expandByScalar(radius);
      if (!segmentBox.intersectsBox(modelBox)) continue;
      if (Math.min(from.distanceTo(a), to.distanceTo(a), from.distanceTo(b), to.distanceTo(b)) <= .095) continue;
      const delta = to.clone().sub(from), length = delta.length();
      if (length < 1e-9) continue;
      ray.near = 1e-6;ray.far = length;
      const direction = delta.multiplyScalar(1 / length);
      if (offsets.some(offset => {
        ray.set(from.clone().add(offset), direction);
        const hit = ray.intersectObjects(meshes, false)[0];
        if (hit && !firstHit) firstHit = { mesh: hit.object.name, point: hit.point.toArray() };
        return Boolean(hit);
      })) segments++;
    }
    if (segments) hits.push({ device, segments, firstHit });
  }
  return hits;
}
