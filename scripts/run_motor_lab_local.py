#!/usr/bin/env python3
"""Motor Lab 真实模型本地预览服务器（仅回环绑定，本地专用）。

用法:
    python3 scripts/run_motor_lab_local.py [--port N]

行为:
    - 仅绑定 127.0.0.1，默认端口 0（由系统分配）并打印实际访问 URL（含 JSON 行）。
    - 将项目 web/ 目录作为普通静态目录服务；禁止目录列表、路径穿越与符号链接跳出。
    - 额外白名单映射 /motor-lab-models/{id}.glb 到磁盘上的真实 GLB 模型文件。

安全边界:
    - 本服务用于本地开发与无头浏览器验收，不是公开分发授权；未经许可不对外网暴露。
    - 未列入白名单的模型源不会被复制、打包或对外提供。
"""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEB_ROOT = PROJECT_ROOT / "web"

# Versioned review assets: a fresh checkout no longer depends on local .tmp files.
# Only these individual files are served, never the whole assets/source tree.
REVIEW_MODELS = "assets/motor-lab/review-stage/models"
MODEL_MAP = {
    "c-board": "assets/motor-lab/c-board/c-board-official-white-silver.glb",
    "center-board2": f"{REVIEW_MODELS}/center-board2/web.glb",
    "c620": f"{REVIEW_MODELS}/c620/web.glb",
    "m3508": f"{REVIEW_MODELS}/m3508/web.glb",
    "tb47d": f"{REVIEW_MODELS}/tb47d/web.glb",
    "tb47d-local": f"{REVIEW_MODELS}/tb47d/neutral-web.glb",
    "battery-rack": f"{REVIEW_MODELS}/battery-rack/web.glb",
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".bin": "application/octet-stream",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".ktx2": "image/ktx2",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


def _safe_fs_path(url_path: str) -> Path | None:
    """将 URL 路径安全解析为磁盘路径；解析失败或越界返回 None。

    防御:
        - 请求路径先做 percent-decode，再检查 ``..`` 段（含编码变体在 decode 后统一拦截）。
        - 所有路径先 resolve()，再确认结果位于 WEB_ROOT 之内，防止符号链接跳出。
        - 目标必须是常规文件；目录一律拒绝（无目录列表）。
    """
    # 仅允许纯路径形式的 URL（去掉 query 已在 handler 完成）
    path = url_path
    # 多余的 percent-decode 由 handler 逐层展开，这里假定已是解码后的形态
    if "\x00" in path:
        return None
    # 拒绝任何形式的上级目录段
    parts = path.split("/")
    for seg in parts:
        if seg == "..":
            return None
    # posix 规范化（合并 ./、重复斜杠）
    norm = posixpath.normpath("/" + path).lstrip("/")
    if not norm:
        norm = "index.html"
    # percent-decode（处理“%2e%2e”等编码变体）
    decoded = unquote(norm)
    if ".." in decoded.split("/"):
        return None
    decoded = unquote(decoded)  # 二次解码兜底（双重编码变体）
    if ".." in decoded.split("/"):
        return None
    fs_path = (WEB_ROOT / decoded).resolve()
    try:
        fs_path.relative_to(WEB_ROOT.resolve())
    except ValueError:
        return None
    if not fs_path.is_file():  # is_file() 对 symlink-to-file 也为真，但前面已 resolve 并限定根内
        return None
    return fs_path


def _model_fs_path(model_id: str) -> Path | None:
    """解析白名单模型 id 到磁盘文件；白名单外或目标缺失返回 None。"""
    rel = MODEL_MAP.get(model_id)
    if rel is None:
        return None
    p = (PROJECT_ROOT / rel).resolve()
    if model_id == "tb47d" and not p.is_file():
        p = (PROJECT_ROOT / MODEL_MAP["tb47d-local"]).resolve()
    # 白名单路径固定，理论上不会越界，这里仍做一次根内校验
    try:
        p.relative_to(PROJECT_ROOT.resolve())
    except ValueError:
        return None
    if not p.is_file():
        return None
    return p


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "MotorLabLocal/1.0"

    # ------------------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802
        self._serve(head_only=False)

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve(head_only=True)

    def _serve(self, head_only: bool) -> None:
        raw = self.path
        path_only = raw.split("?", 1)[0].split("#", 1)[0]
        path_only = unquote(path_only)
        if "\x00" in path_only:
            self._send_error(400, "bad request path")
            return

        # 白名单模型路由: /motor-lab-models/{id}.glb
        m = MODEL_ROUTE.match(path_only)
        if m is not None:
            model_id = m.group(1)
            fs_path = _model_fs_path(model_id)
            if fs_path is None:
                self._send_error(404, "model not found")
                return
            self._send_file(fs_path, head_only)
            return

        # Root opens the independent lab rather than exposing a directory listing.
        if path_only == "/":
            path_only = "/motor-lab.html"
        # 普通静态资源
        fs_path = _safe_fs_path(path_only)
        if fs_path is None:
            # 目录或不存在：目录返回 404（不区分以便不泄露目录信息，且明确禁止列表）
            self._send_error(404, "not found")
            return
        self._send_file(fs_path, head_only)

    # ------------------------------------------------------------------
    def _send_file(self, fs_path: Path, head_only: bool) -> None:
        ctype = CONTENT_TYPES.get(fs_path.suffix.lower(), "application/octet-stream")
        try:
            length = fs_path.stat().st_size
            with open(fs_path, "rb") as f:
                body = None if head_only else f.read()
        except OSError:
            self._send_error(404, "not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head_only and body is not None:
            self.wfile.write(body)

    def _send_error(self, code: int, message: str) -> None:
        body = json.dumps({"error": message}).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - 基类签名; 静默 stderr 日志
        pass


MODEL_ROUTE = re.compile(r"^/motor-lab-models/([A-Za-z0-9_-]+)\.glb$")


class LoopbackServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, port: int):
        super().__init__(("127.0.0.1", port), Handler)


def main() -> int:
    parser = argparse.ArgumentParser(description="Motor Lab 真实模型本地预览服务器（仅回环）")
    parser.add_argument("--port", type=int, default=0, help="监听端口，默认 0 由系统分配")
    args = parser.parse_args()

    if not (0 <= args.port <= 65535):
        print("--port 须为 0..65535", file=sys.stderr)
        return 2

    if not WEB_ROOT.is_dir():
        print(f"web 目录不存在: {WEB_ROOT.name}", file=sys.stderr)
        return 2

    server = LoopbackServer(args.port)
    host, port = server.server_address[:2]
    url = f"http://127.0.0.1:{port}/"
    info = {
        "event": "motor-lab-local-server",
        "url": url,
        "base_url": url,
        "port": port,
        "web_root": "web",
        "models": dict(MODEL_MAP),
    }
    # 打印就绪 JSON（供测试脚本解析 readiness）
    print(json.dumps(info, ensure_ascii=False), flush=True)
    print(f"Motor Lab 本地服务已就绪: {url}  (Ctrl+C 停止)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
