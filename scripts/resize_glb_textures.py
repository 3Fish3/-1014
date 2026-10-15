#!/usr/bin/env python3
"""缩小GLB内嵌贴图到512边长；保留几何与材质引用。仅覆盖显式指定的项目输出。"""
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image


def resize(path: Path, max_size: int = 512):
    raw = path.read_bytes()
    magic, version, _ = struct.unpack_from('<III', raw)
    if magic != 0x46546C67 or version != 2:
        raise ValueError('仅支持 GLB 2.0')
    n, kind = struct.unpack_from('<II', raw, 12)
    if kind != 0x4E4F534A:
        raise ValueError('缺少JSON块')
    try:
        doc = json.loads(raw[20:20+n])
    except (ValueError, UnicodeError) as exc:
        raise ValueError('GLB JSON损坏') from exc
    binary_start = 20+n+8
    binary = raw[binary_start:]
    targets = {im['bufferView']: im for im in doc.get('images', []) if 'bufferView' in im}
    # gltfpack可能保留孤立images；无texture且无扩展时它们不参与任何材质。
    # 只删除未被accessor引用的图片view，并完整重映射其余标准bufferView引用。
    removed = set()
    accessors = doc.get('accessors', [])
    refs = []
    for accessor in accessors:
        if 'bufferView' in accessor:
            refs.append(accessor)
        if 'sparse' in accessor:
            refs.extend([accessor['sparse']['indices'], accessor['sparse']['values']])
    used = {ref['bufferView'] for ref in refs}
    if not doc.get('textures') and not doc.get('extensionsUsed'):
        removed = set(targets) - used
        doc.pop('images', None)
        targets = {}
    old_views = doc['bufferViews']
    mapping = {old: new for new, old in enumerate(i for i in range(len(old_views)) if i not in removed)}
    for ref in refs:
        ref['bufferView'] = mapping[ref['bufferView']]
    doc['bufferViews'] = [view for i, view in enumerate(old_views) if i not in removed]
    rebuilt = bytearray()
    report = []
    for index, view in enumerate(old_views):
        if index in removed:
            continue
        start = view.get('byteOffset', 0)
        data = binary[start:start+view['byteLength']]
        if index in targets:
            with Image.open(io.BytesIO(data)) as image:
                before = image.size
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                image.save(output, format='PNG', optimize=True)
                data = output.getvalue()
                report.append({'before': before, 'after': image.size})
                targets[index]['mimeType'] = 'image/png'
        rebuilt.extend(b'\0' * ((-len(rebuilt)) % 4))
        view['byteOffset'] = len(rebuilt)
        view['byteLength'] = len(data)
        rebuilt.extend(data)
    rebuilt.extend(b'\0' * ((-len(rebuilt)) % 4))
    doc['buffers'][0]['byteLength'] = len(rebuilt)
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    text += b' ' * ((-len(text)) % 4)
    total = 12+8+len(text)+8+len(rebuilt)
    packed = struct.pack('<III', magic, 2, total)+struct.pack('<II', len(text), 0x4E4F534A)+text+struct.pack('<II', len(rebuilt), 0x004E4942)+rebuilt
    path.write_bytes(packed)
    return {'oldBytes':len(raw),'newBytes':len(packed),'removedUnusedImages':len(removed),'textures':report,
            'rgbaMipEstimateBytes':sum(r['after'][0]*r['after'][1]*16//3 for r in report)}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('用法：.venv/bin/python scripts/resize_glb_textures.py 项目输出.glb')
    print(json.dumps(resize(Path(sys.argv[1])), ensure_ascii=False, indent=2))
