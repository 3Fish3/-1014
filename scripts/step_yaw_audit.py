#!/usr/bin/env python3
"""Audit extracted Yaw BREP with system FreeCAD, without GUI or source writes.

Run after step_assembly.py --extract-yaw. Shape.Placement already includes local
object placement: apply only globalPlacement * inverse(localPlacement), once.
"""
import argparse
import hashlib
import importlib
import json
import math
import resource
import sys
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path('.tmp/step-alignment/yaw-reference.step'))
    parser.add_argument('--output', type=Path, default=Path('.tmp/step-alignment'))
    parser.add_argument('--memory-mib', type=int, default=2560)
    args = parser.parse_args()
    resource.setrlimit(resource.RLIMIT_AS, (args.memory_mib * 1024**2,) * 2)
    sys.path.append('/usr/lib/freecad/lib')
    # FreeCAD is a system binary extension, intentionally outside project .venv.
    App = importlib.import_module('FreeCAD')
    Import = importlib.import_module('Import')
    Part = importlib.import_module('Part')

    started = time.monotonic()
    args.output.mkdir(parents=True, exist_ok=True)
    doc = App.newDocument('YawCadAudit')
    try:
        Import.insert(str(args.input.resolve()), doc.Name)
        doc.recompute()
        roots = [o for o in doc.Objects if not o.InList and o.TypeId == 'App::Part']
        if len(roots) != 1 or roots[0].Label != 'yaw轴3改':
            raise ValueError('Extracted assembly root differs')
        root = roots[0]

        def find(label, parent=None):
            matches = [o for o in doc.Objects if o.Label == label and
                       (parent is None or parent in o.InList)]
            if len(matches) != 1:
                raise ValueError(f'Ambiguous/missing CAD part: {label}')
            return matches[0]

        group = find('Yaw轴装配体2.1改')
        source_objects = {
            'bearing': find('外环轴承座加工件2.1', group),
            'plate': find('云台底座板', root),
            'driven': find('从动齿轮  2M45齿', group),
            'drive': find('主动齿轮  2M45齿', root),
            'cap': find('外环轴承座压板2.1-3', group),
            'supportA': find('云台支架基座加工件4.0', group),
            'supportB': find('云台支架基座加工件4.001', group),
            'flangeA': find('60齿同步带轮挡边板-2mm', group),
            'flangeB': find('60齿同步带轮挡边板-2mm001', group),
        }
        shapes = {}
        parts = {}
        for key, obj in source_objects.items():
            shape = obj.Shape.copy()
            parent = obj.getGlobalPlacement().multiply(obj.Placement.inverse())
            shape.Placement = parent.multiply(shape.Placement)
            shapes[key] = shape
            box = shape.BoundBox
            cylinders = []
            planes = []
            for i, face in enumerate(shape.Faces, 1):
                surface = face.Surface
                if isinstance(surface, Part.Cylinder):
                    cylinders.append({'face': i, 'radius': surface.Radius,
                                      'center': list(surface.Center), 'axis': list(surface.Axis),
                                      'area': face.Area})
                elif isinstance(surface, Part.Plane):
                    planes.append({'face': i, 'center': list(surface.Position),
                                   'axis': list(surface.Axis), 'area': face.Area})
            parts[key] = {'name': obj.Label, 'object': obj.Name,
                          'placement': list(obj.getGlobalPlacement().toMatrix().A),
                          'bounds': [box.XMin, box.YMin, box.ZMin, box.XMax, box.YMax, box.ZMax],
                          'valid': shape.isValid(), 'closed': shape.isClosed(),
                          'solids': len(shape.Solids), 'shells': len(shape.Shells),
                          'faces': len(shape.Faces), 'volumeMm3': shape.Volume,
                          'cylinders': cylinders, 'planes': planes}

        def axis(key):
            # Select central bore by XZ center and Y axis, not its mesh bounds.
            candidates = [c for c in parts[key]['cylinders'] if abs(c['axis'][1]) > 1 - 1e-9]
            placement = parts[key]['placement']
            origin = [placement[3], placement[7], placement[11]]
            candidates = [c for c in candidates if math.hypot(c['center'][0]-origin[0], c['center'][2]-origin[2]) < 1e-5]
            if not candidates:
                raise ValueError(f'Cannot identify central cylinder: {key}')
            return max(candidates, key=lambda c: c['radius'])

        drive_axis, driven_axis = axis('drive'), axis('driven')
        dot = abs(sum(a*b for a, b in zip(drive_axis['axis'], driven_axis['axis'], strict=True)))
        axis_angle = math.degrees(math.acos(min(1, max(0, dot))))
        center_distance = math.hypot(drive_axis['center'][0]-driven_axis['center'][0],
                                     drive_axis['center'][2]-driven_axis['center'][2])
        # Belt working center planes cannot be inferred from whole-part bounds.
        # Report exact Y-extents separately, with center-plane offset as envelope evidence only.
        drive_bounds, driven_bounds = parts['drive']['bounds'], parts['driven']['bounds']
        bearing_min, plate_max = parts['bearing']['bounds'][1], parts['plate']['bounds'][4]
        bearing_faces = [p for p in parts['bearing']['planes'] if abs(p['axis'][1]) > 1-1e-9 and abs(p['center'][1]-bearing_min) < 1e-6]
        plate_faces = [p for p in parts['plate']['planes'] if abs(p['axis'][1]) > 1-1e-9 and abs(p['center'][1]-plate_max) < 1e-6]
        if not bearing_faces or not plate_faces:
            raise ValueError('Cannot identify intended planar installation faces')
        face_gap = shapes['bearing'].Faces[bearing_faces[0]['face']-1].distToShape(shapes['plate'].Faces[plate_faces[0]['face']-1])[0]
        pairs = [('bearing', 'plate'), ('supportA', 'plate'), ('supportB', 'plate'),
                 ('driven', 'drive'), ('cap', 'bearing'), ('driven', 'bearing'),
                 ('flangeA', 'driven'), ('flangeB', 'driven'), ('supportA', 'supportB')]
        intersections = []
        for a, b in pairs:
            common = shapes[a].common(shapes[b])
            intersections.append({'a': a, 'b': b, 'distanceMm': shapes[a].distToShape(shapes[b])[0],
                                  'commonVolumeMm3': common.Volume if not common.isNull() else 0,
                                  'commonFaces': len(common.Faces),
                                  'bothValidSolids': parts[a]['valid'] and parts[b]['valid'] and parts[a]['solids'] > 0 and parts[b]['solids'] > 0})
        # Hole axes at the actual bearing/plate mounting plane, excluding concentric outlines.
        def holes(key, y):
            out = []
            for c in parts[key]['cylinders']:
                if abs(c['axis'][1]) < 1-1e-9 or not 1 < c['radius'] < 5:
                    continue
                face_box = shapes[key].Faces[c['face']-1].BoundBox
                if not face_box.YMin - 1e-6 <= y <= face_box.YMax + 1e-6:
                    continue
                center = [c['center'][0], c['center'][2]]
                if any(math.dist(center, x['axisXZ']) < 1e-6 and abs(c['radius']-x['radius']) < 1e-6 for x in out):
                    continue
                out.append({'axisXZ': center, 'radius': c['radius']})
            return out
        bh, ph = holes('bearing', bearing_min), holes('plate', plate_max)
        hole_matches = []
        for h in bh:
            distances = [(math.dist(h['axisXZ'], p['axisXZ']), p) for p in ph]
            if distances:
                distance, nearest = min(distances, key=lambda x: x[0])
                hole_matches.append({'bearing': h, 'plate': nearest, 'axisDistanceMm': distance})
        mounted_holes = [h for h in hole_matches if h['axisDistanceMm'] < 1e-5]
        unmatched_holes = [h for h in hole_matches if h['axisDistanceMm'] >= 1e-5]
        # Export independently imported direct child transforms for correspondence
        # checking, not shape bounds or geometry-derived placement guesses.
        imported_children = []
        for obj in group.Group:
            if not hasattr(obj, 'Shape') or obj.Shape.isNull():
                continue
            imported_children.append({'name': obj.Label, 'object': obj.Name,
                                      'localMatrix': list(obj.Placement.toMatrix().A),
                                      'valid': obj.Shape.isValid(), 'solids': len(obj.Shape.Solids)})
        report = {
            'scope': 'Yaw extracted STEP only; not whole vehicle or belt design certification',
            'inputSha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
            'units': 'mm', 'freecad': App.Version()[:3], 'occ': Part.OCC_VERSION,
            'parts': parts, 'assemblyPlacements': {o.Label: list(o.getGlobalPlacement().toMatrix().A) for o in [root, group]},
            'metrics': {'pulleyAxisAngleDeg': axis_angle, 'pulleyAxisDistanceMm': center_distance,
                        'driveAxialEnvelopeMm': [drive_bounds[1], drive_bounds[4]],
                        'drivenAxialEnvelopeMm': [driven_bounds[1], driven_bounds[4]],
                        'axialEnvelopeCenterOffsetMm': abs((drive_bounds[1]+drive_bounds[4]-driven_bounds[1]-driven_bounds[4])/2),
                        'axialOverlapMm': min(drive_bounds[4],driven_bounds[4])-max(drive_bounds[1],driven_bounds[1]),
                        'bearingPlateSignedHeightGapMm': bearing_min-plate_max,
                        'installationFaceDistanceMm': face_gap},
            'holeMatches': hole_matches, 'matchedHoleCount': len(mounted_holes),
            'maxMatchedHoleAxisResidualMm': max((h['axisDistanceMm'] for h in mounted_holes), default=None),
            'unmatchedHoleCount': len(unmatched_holes),
            'unmatchedHoleMeaning': 'Additional bearing holes do not all correspond to plate holes; role not certified',
            'importedChildren': imported_children, 'intersections': intersections,
            'limitations': ['Belt tooth working surfaces/route/tension not certified',
                            'Axial envelope centers are not identified belt pitch planes',
                            'Clearance/press-fit design intent unknown; report intersection volumes without silently forgiving them',
                            'Source STEP tolerance is not manufacturing acceptance tolerance'],
            'seconds': time.monotonic()-started,
            'peakRssKiB': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        }
        (args.output/'cad-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps({k: report[k] for k in ['metrics', 'holeMatches', 'intersections', 'seconds', 'peakRssKiB']},ensure_ascii=False,indent=2))
    finally:
        App.closeDocument(doc.Name)


if __name__ == '__main__':
    main()
