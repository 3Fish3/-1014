"""Local Python tests; run with .venv/bin/python -m unittest discover -s tests -p 'test_step_*.py'."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

import numpy as np

SPEC = importlib.util.spec_from_file_location('step_assembly', Path(__file__).resolve().parents[1]/'scripts/step_assembly.py')
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class StepIndexTests(unittest.TestCase):
    def make_index(self, body):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        source = Path(temp.name)/'source.step'
        source.write_text("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n"+body+'\nENDSEC;\nEND-ISO-10303-21;\n')
        index = module.StepIndex(source)
        self.addCleanup(index.close)
        return index

    def test_offsets_multiline_names_and_reference_closure(self):
        index = self.make_index("#1=PRODUCT('has #99; literal',\n'copy','',(#2));\n#2=APPLICATION_CONTEXT('context');")
        self.assertEqual(index.closure([1]),{1,2})
        self.assertIn('copy',index.text(1))
        self.assertEqual(module.name_of(index.text(1)),'has #99; literal')
        target=index.path.parent/'extracted.step'
        index.export_closure([1],target)
        # mmap cursor was at EOF after indexing: regression for lost STEP header.
        self.assertTrue(target.read_bytes().startswith(b'ISO-10303-21;'))
        self.assertIn(b'DATA;',target.read_bytes())
        output=module.StepIndex(target)
        try:
            self.assertEqual(output.closure([1]),{1,2})
            self.assertEqual(output.raw(1).rstrip(),index.raw(1).rstrip())
        finally:
            output.close()

    def test_missing_reference_fails_not_silent_partial_extract(self):
        index=self.make_index("#1=PRODUCT('test','','',(#55));")
        with self.assertRaisesRegex(ValueError,'Missing STEP reference'):
            index.closure([1])

    def test_axis_transformation_keeps_rotated_frames(self):
        index=self.make_index("#1=CARTESIAN_POINT('',(10.,20.,30.));\n#2=DIRECTION('',(0.,0.,1.));\n#3=DIRECTION('',(0.,1.,0.));\n#4=AXIS2_PLACEMENT_3D('',#1,#2,#3);")
        m=module.axis_matrix(4,index)
        np.testing.assert_allclose(m,[[0,-1,0,10],[1,0,0,20],[0,0,1,30],[0,0,0,1]],atol=1e-14)
        np.testing.assert_allclose(m[:3,:3].T@m[:3,:3],np.eye(3),atol=1e-14)

    def test_step_unicode_names(self):
        self.assertEqual(module.name_of("#1=PRODUCT('\\X2\\4E9153F0\\X0\\','','',());"),'云台')


if __name__ == '__main__':
    unittest.main()
