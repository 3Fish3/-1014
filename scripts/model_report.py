#!/usr/bin/env python3
"""报告GLB文件与唯一几何数据规模，不将其当作进程总内存。"""
import hashlib
import json
import struct
from pathlib import Path


def inspect(path):
    raw = path.read_bytes()
    size, = struct.unpack_from('<I', raw, 12)
    try:
        doc = json.loads(raw[20:20+size])
    except (ValueError, UnicodeError) as exc:
        raise ValueError(f'GLB JSON损坏：{path}') from exc
    accessors = doc['accessors']
    triangles = sum(accessors[p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'] if 'indices' in p)
    geometry_views = {a['bufferView'] for a in accessors if 'bufferView' in a}
    return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
            'uniqueMeshTriangles':triangles,'nodes':len(doc['nodes']),'meshes':len(doc['meshes']),
            'embeddedImages':len(doc.get('images',[])),
            'geometryBufferViewBytes':sum(doc['bufferViews'][i]['byteLength'] for i in geometry_views)}


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    source = Path('/home/kekeyuyu/Downloads/整车5.glb')
    report = {p.name:inspect(p) for p in [source,root/'web/models/hero_robot_clean.glb',root/'web/models/diff_car_teaching.glb']}
    (root/'docs/model-stats.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
