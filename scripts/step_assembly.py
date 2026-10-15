#!/usr/bin/env python3
"""Read STEP assembly instances without changing source geometry.

Coordinates and transformations remain in STEP units. The indexed reader keeps
record offsets rather than every BREP entity in Python memory. Supported path is
AP214 NAUO + ITEM_DEFINED_TRANSFORMATION; unsupported structures fail explicitly.
"""
import argparse
from array import array
from collections import Counter, defaultdict
import hashlib
import json
import mmap
from pathlib import Path
import re

import numpy as np

START = re.compile(rb'\s*#(\d+)\s*=')
REF = re.compile(r'#(\d+)')
STRINGS = re.compile(r"'(?:[^']|'')*'")
ASSEMBLY_TYPES = {
    'PRODUCT', 'PRODUCT_DEFINITION', 'PRODUCT_DEFINITION_FORMATION',
    'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE',
    'NEXT_ASSEMBLY_USAGE_OCCURRENCE', 'PRODUCT_DEFINITION_SHAPE',
    'SHAPE_DEFINITION_REPRESENTATION', 'SHAPE_REPRESENTATION',
    'ADVANCED_BREP_SHAPE_REPRESENTATION', 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION',
    'SHAPE_REPRESENTATION_RELATIONSHIP',
    'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION', 'ITEM_DEFINED_TRANSFORMATION',
}


def references(text):
    return [int(x) for x in REF.findall(STRINGS.sub("''", text.split('=', 1)[1]))]


def name_of(text):
    match = STRINGS.search(text)
    if match is None:
        raise ValueError('STEP name missing')
    text = match.group()[1:-1].replace("''", "'")
    for size, encoding in [(2, 'utf-16-be'), (4, 'utf-32-be')]:
        text = re.sub(r'\\X' + str(size) + r'\\([0-9a-fA-F]+)\\X0\\',
                      lambda m, encoding=encoding: bytes.fromhex(m[1]).decode(encoding), text)
    return text


class StepIndex:
    def __init__(self, path):
        self.path = Path(path)
        self.file = self.path.open('rb')
        self.data = mmap.mmap(self.file.fileno(), 0, access=mmap.ACCESS_READ)
        self.offsets = array('Q', [0])
        self.lengths = array('I', [0])
        self.metadata = {}
        self.counts = Counter()
        start = None
        record_id = None
        while True:
            offset = self.data.tell()
            line = self.data.readline()
            if not line:
                break
            if start is None:
                m = START.match(line)
                if not m:
                    continue
                record_id = int(m[1])
                start = offset
            if not line.rstrip().endswith(b';'):
                if self.data.tell() - start > 4 * 1024 * 1024:
                    raise ValueError('Oversized STEP entity')
                continue
            length = self.data.tell() - start
            if record_id is None:
                raise ValueError('Missing entity ID')
            if record_id >= len(self.offsets):
                extension = record_id + 1 - len(self.offsets)
                self.offsets.extend(array('Q', [0]) * extension)
                self.lengths.extend(array('I', [0]) * extension)
            if self.lengths[record_id]:
                raise ValueError(f'Duplicate STEP entity #{record_id}')
            self.offsets[record_id] = start
            self.lengths[record_id] = length
            raw = self.data[start:start + length]
            match = re.match(rb'\s*#\d+\s*=\s*([A-Z_0-9]+)', raw)
            kind = match[1].decode() if match else 'COMPLEX'
            self.counts[kind] += 1
            if kind in ASSEMBLY_TYPES or b'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION' in raw:
                self.metadata[record_id] = self._decode(raw)
            start = None
        if start is not None:
            raise ValueError('Incomplete STEP record')

    @staticmethod
    def _decode(raw):
        try:
            return raw.decode('utf-8').strip()
        except UnicodeDecodeError:
            return raw.decode('gb18030').strip()

    def raw(self, index):
        if index <= 0 or index >= len(self.lengths) or not self.lengths[index]:
            raise ValueError(f'Missing STEP reference #{index}')
        offset = self.offsets[index]
        return self.data[offset:offset + self.lengths[index]]

    def text(self, index):
        return self.metadata.get(index) or self._decode(self.raw(index))

    def by_type(self, kind):
        match = re.compile(r'#\d+\s*=\s*' + kind + r'\s*\(')
        return {i: s for i, s in self.metadata.items() if match.match(s)}

    def close(self):
        self.data.close()
        self.file.close()

    def closure(self, roots):
        found = set()
        pending = list(roots)
        while pending:
            index = pending.pop()
            if index in found:
                continue
            found.add(index)
            pending.extend(ref for ref in references(self.text(index)) if ref not in found)
        return found

    def export_closure(self, roots, target):
        """Extract exact referenced entities, never renumber or edit BREP data."""
        selected = self.closure(roots)
        data_start = self.data.find(b'DATA;', 0)
        if data_start < 0:
            raise ValueError('Missing STEP DATA section')
        header = self.data[:data_start + len(b'DATA;')]
        target = Path(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('wb') as f:
            f.write(header + b'\n')
            for index in sorted(selected):
                f.write(self.raw(index).rstrip() + b'\n')
            f.write(b'ENDSEC;\nEND-ISO-10303-21;\n')
        return len(selected)


def axis_matrix(index, step):
    text = step.text(index)
    if 'AXIS2_PLACEMENT_3D' not in text:
        raise ValueError(f'Unsupported placement #{index}')
    refs = references(text)
    if len(refs) != 3:
        raise ValueError('Axis directions must be explicit')

    def xyz(ref):
        text = step.text(ref)
        values = re.search(r'\(\s*([^()]+)\)\s*\)\s*;', text)
        if not values:
            raise ValueError(f'Unsupported vector #{ref}')
        a = np.array([float(x) for x in values[1].split(',')])
        if a.shape != (3,) or not np.isfinite(a).all():
            raise ValueError('Non-finite axis data')
        return a

    origin, z, x = (xyz(ref) for ref in refs)
    z /= np.linalg.norm(z)
    x -= z * np.dot(x, z)
    x /= np.linalg.norm(x)
    result = np.eye(4)
    result[:3, :3] = np.column_stack((x, np.cross(z, x), z))
    result[:3, 3] = origin
    if not np.isfinite(result).all():
        raise ValueError('Degenerate placement axes')
    return result


def assembly(step):
    products = {i: name_of(s) for i, s in step.by_type('PRODUCT').items()}
    formations = {}
    for kind in ['PRODUCT_DEFINITION_FORMATION', 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE']:
        formations.update({i: references(s)[-1] for i, s in step.by_type(kind).items()})
    definitions = {i: products[formations[references(s)[0]]]
                   for i, s in step.by_type('PRODUCT_DEFINITION').items()}
    pds = {i: references(s)[-1] for i, s in step.by_type('PRODUCT_DEFINITION_SHAPE').items()}
    representations = {pds[references(s)[0]]: references(s)[1]
                       for s in step.by_type('SHAPE_DEFINITION_REPRESENTATION').values()}
    relations = {}
    for s in step.by_type('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION').values():
        rr, definition_shape = references(s)
        occurrence = pds[definition_shape]
        if occurrence in relations:
            raise ValueError('Ambiguous occurrence transform')
        relations[occurrence] = rr
    children = defaultdict(list)
    for index, text in step.by_type('NEXT_ASSEMBLY_USAGE_OCCURRENCE').items():
        parent, child = references(text)
        relation = step.text(relations[index])
        match = re.search(r'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION\s*\(\s*#(\d+)', relation)
        if not match:
            raise ValueError('Missing transformation')
        relationship_refs = references(relation)
        if relationship_refs[:2] != [representations[parent], representations[child]]:
            raise ValueError('Representation direction differs: cannot infer silently')
        first, second = references(step.text(int(match[1])))
        # STEP relation is parent representation -> child representation.
        # Validate this convention against the real importer before using candidate.
        local = axis_matrix(first, step) @ np.linalg.inv(axis_matrix(second, step))
        children[parent].append((index, child, local))
    roots = set(definitions) - {child for rows in children.values() for _, child, _ in rows}
    if len(roots) != 1:
        raise ValueError('Expected one assembly root')
    instances = []

    def visit(definition, path, occurrence_path, world, stack):
        if definition in stack:
            raise ValueError('Cyclic assembly')
        row = {'definition': definition, 'name': definitions[definition],
               'path': path + [definitions[definition]], 'occurrences': occurrence_path,
               'representation': representations[definition], 'worldMatrix': world.tolist()}
        instances.append(row)
        for occurrence, child, local in children[definition]:
            visit(child, row['path'], occurrence_path + [occurrence], world @ local, stack | {definition})
    visit(next(iter(roots)), [], [], np.eye(4), set())
    return instances


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('.tmp/step-alignment'))
    parser.add_argument('--extract-yaw', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    step = StepIndex(args.source)
    try:
        instances = assembly(step)
        source_hash = hashlib.sha256(step.data).hexdigest()
        report = {'source': {'path': str(args.source), 'sha256': source_hash},
                  'matrixConvention': 'row-major child-to-parent; awaiting importer cross-check',
                  'entityCounts': dict(step.counts), 'instances': instances}
        if args.extract_yaw:
            target = [r for r in instances if r['name'] == 'yaw轴3改']
            if len(target) != 1:
                raise ValueError('Yaw assembly not unique')
            # Use the representation itself as extraction root: complete forward
            # geometry closure, plus only the assembly relations within target.
            subtree = [r for r in instances if r['occurrences'][:len(target[0]['occurrences'])] == target[0]['occurrences']]
            roots = {r['representation'] for r in subtree}
            occurrences = {o for r in subtree for o in r['occurrences'][len(target[0]['occurrences']):]}
            # Geometric representations are linked by inverse relationship entities,
            # not forward references from the product's axis-only representation.
            for i, text in step.by_type('SHAPE_REPRESENTATION_RELATIONSHIP').items():
                if references(text)[0] in roots:
                    roots.add(i)
            for kind in ['CONTEXT_DEPENDENT_SHAPE_REPRESENTATION', 'SHAPE_DEFINITION_REPRESENTATION']:
                for i, text in step.by_type(kind).items():
                    refs = references(text)
                    if (kind.startswith('CONTEXT') and references(step.text(refs[-1]))[-1] in occurrences) or (kind.startswith('SHAPE') and refs[-1] in roots):
                        roots.add(i)
            extracted = args.output / 'yaw-reference.step'
            report['extractedEntityCount'] = step.export_closure(roots, extracted)
            report['extractedSha256'] = hashlib.sha256(extracted.read_bytes()).hexdigest()
        (args.output / 'assembly.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        for r in instances:
            if r['name'] in ['云台2(齿轮改)', 'yaw轴3改', 'Yaw轴装配体2.1改', '主动齿轮  2M45齿', '从动齿轮  2M45齿']:
                print(json.dumps(r, ensure_ascii=False))
        print(f'{len(instances)} instance paths; source SHA256 {source_hash}')
    finally:
        step.close()


if __name__ == '__main__':
    main()
