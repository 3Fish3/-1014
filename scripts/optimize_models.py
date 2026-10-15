#!/usr/bin/env python3
# pyright: reportMissingImports=false
"""
模型自动化压缩与轻量化流水线 (optimize_models.py)
用于将整车 CAD 导出的大型 GLB (200MB+) 转化为适合 Web 端高帧率渲染的轻量化模型。
"""

import subprocess
import sys
from pathlib import Path

from resize_glb_textures import resize


def optimize_hero_robot(source_path: Path | None = None) -> bool:
    project_root = Path(__file__).resolve().parent.parent
    if source_path is None:
        candidates = [
            Path("/home/kekeyuyu/Downloads/整车5.glb"),
            Path("/home/kekeyuyu/下载/整车5.glb"),
            project_root / "assets" / "整车5.glb",
        ]
        for c in candidates:
            if c.exists():
                source_path = c
                break

    if source_path is None or not source_path.exists():
        print(f"❌ 未找到源模型: {source_path}", file=sys.stderr)
        return False

    out_clean = project_root / "web" / "models" / "hero_robot_clean.glb"
    try:
        out_clean.parent.mkdir(parents=True, exist_ok=True)
    except OSError as err:
        print(f"❌ 创建目标目录失败: {err}", file=sys.stderr)
        return False

    src_mb = source_path.stat().st_size / 1024 / 1024
    print(f"🚀 开始优化整车模型: {source_path} ({src_mb:.2f} MB)")

    # 有损几何简化；固定本地依赖版本，不在重建时自动联网。
    tool = project_root / "node_modules" / "gltfpack" / "cli.js"
    if not tool.is_file():
        print("缺少本地 gltfpack，请先 npm ci", file=sys.stderr)
        return False
    cmd = [
        "node", str(tool),
        "-i", str(source_path),
        "-o", str(out_clean),
        "-kn", "-km", "-si", "0.08", "-noq"
    ]
    try:
        subprocess.run(cmd, check=True)
        resize(out_clean)
        out_mb = out_clean.stat().st_size / 1024 / 1024
        print(f"✓ 成功生成轻量化整车模型: {out_clean} ({out_mb:.2f} MB)")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as err:
        print(f"❌ 优化执行失败: {err}", file=sys.stderr)
        return False


def main():
    custom_src = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
    ok = optimize_hero_robot(custom_src)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
