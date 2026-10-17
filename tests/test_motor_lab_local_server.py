"""Verify the local model server never exposes arbitrary project paths."""
import importlib.util
import json
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "motor_lab_server", ROOT / "scripts/run_motor_lab_local.py"
)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LocalServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = MODULE.LoopbackServer(0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, path, method="GET"):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_binding_is_loopback(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")

    def test_static_html_and_head(self):
        status, _, body = self.request("/motor-lab.html")
        self.assertEqual(status, 200)
        self.assertIn(b"motor-lab", body)
        status, headers, body = self.request("/motor-lab.html", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertGreater(int(headers["Content-Length"]), 0)
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_model_whitelist(self):
        status, headers, _ = self.request("/motor-lab-models/c-board.glb", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "model/gltf-binary")
        self.assertGreater(int(headers["Content-Length"]), 0)

    def test_no_directory_listing_or_private_paths(self):
        for path in ["/vendor/", "/.tmp/", "/.git/config", "/assets/motor-lab/",
                     "/motor-lab-models/not-whitelisted.glb", "/%00"]:
            with self.subTest(path=path):
                status, _, body = self.request(path)
                self.assertIn(status, (400, 403, 404))
                self.assertNotIn(str(ROOT), body.decode())
                json.loads(body)

    def test_path_traversal_rejected(self):
        for path in ["/../agent.md", "/%2e%2e/agent.md", "/%252e%252e/agent.md",
                     "/vendor/../../../agent.md", "/motor-lab-models/../../agent.md"]:
            with self.subTest(path=path):
                status, _, _ = self.request(path)
                self.assertIn(status, (403, 404))
        self.assertIsNone(MODULE._safe_fs_path("../agent.md"))


if __name__ == "__main__":
    unittest.main()
