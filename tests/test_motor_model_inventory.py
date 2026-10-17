"""盘点回归：英文教学节点、数量一致性和列主序变换。"""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('inventory', ROOT / 'scripts/motor_model_inventory.py')
assert spec is not None and spec.loader is not None
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class MotorInventoryTests(unittest.TestCase):
    def test_teaching_motor_meshes_exist(self):
        gltf, _ = inventory.read_glb_json(ROOT / 'web/models/diff_car_teaching.glb')
        names = {n['name'] for n in gltf['nodes'] if 'mesh' in n}
        for name in ('Node_LeftMotor', 'Node_RightMotor'):
            self.assertIn(name, names)
            self.assertTrue(any(k in name.lower() for k in inventory.MOTOR_KEYWORDS))
        report = json.loads((ROOT / 'docs/motor-assets/teaching-motor-node-map.json').read_text())
        bodies = {m['ownName'] for m in report['motors'] if m['role'] == 'motor_body'}
        self.assertEqual(bodies, inventory.TEACHING_MOTORS)
        driver = next(m for m in report['motors'] if m['ownName'] == 'Node_MotorDriver')
        self.assertNotEqual(driver['role'], 'motor_body')

    def test_hero_counts(self):
        report = json.loads((ROOT / 'docs/motor-assets/motor-node-map.json').read_text())
        bodies = [m for m in report['motors'] if m['role'] == 'motor_body']
        self.assertEqual(len(bodies), 8)
        self.assertEqual(sum('m3508' in m['ownName'].lower() for m in bodies), 7)
        self.assertEqual(sum('j4310' in m['ownName'].lower() for m in bodies), 1)
        self.assertEqual(sum(report['roleCounts'].values()), report['motorNodeCount'])

    def test_column_major_composition(self):
        # 父节点缩放2倍，子节点平移1：原点世界x为2，而非1。
        parent = inventory.trs_to_matrix({'scale': [2, 2, 2]})
        child = inventory.trs_to_matrix({'translation': [1, 0, 0]})
        world = inventory.mat_mul(parent, child)
        self.assertEqual(inventory.apply(world, [0, 0, 0]), [2, 0, 0])


if __name__ == '__main__':
    unittest.main()
