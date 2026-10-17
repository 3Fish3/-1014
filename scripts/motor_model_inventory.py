#!/usr/bin/env python3
"""电机机械模型盘点（只读）。

扫描冻结 GLB 的原始 glTF JSON chunk，找出所有电机相关网格节点，计算其世界空间
包围盒、三角面数与索引父链，输出机器可核验的 JSON 盘点结果。

不写入、不重新导出、不修改任何 GLB；读取整文件以校验哈希，但不解码 BIN 几何。

用法：
    python3 scripts/motor_model_inventory.py [GLB 路径] [--out JSON 路径]
默认：web/models/hero_robot_step_aligned.glb -> docs/motor-assets/motor-node-map.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

# 电机识别关键字：命中任一即计入盘点（大小写不敏感）。
# "电机" 覆盖 CAD 中文命名；M3508/J4310 覆盖 CAD 中写入的型号字符串。
MOTOR_KEYWORDS = ("电机", "motor", "m3508", "j4310", "dm-j")
# 教学车生成脚本明确创建的简化电机，不把 MotorDriver 算作电机本体。
TEACHING_MOTORS = {"Node_LeftMotor", "Node_RightMotor"}

# 权重划分：型号字符串比泛用的“电机”二字更可靠；只含“电机”的命名可能是电机本体，
# 也可能是托架、装配等关联件，须看几何或实物才能定论。
MODEL_KEYWORDS = ("m3508", "j4310", "dm-j")

# 结构分组：按最近的结构祖先归类，便于课件引用；未知归属归入 ungrouped。
GROUPS = (
    ("chassis_drive", "底盘驱动电机", (137, 139, 152, 166, 248)),
    ("gimbal_friction", "云台摩擦轮电机", (425, 427, 434, 450)),
    ("yaw_drive", "Yaw 轴减速电机", (543, 549, 563)),
)


def read_glb_json(path: Path) -> tuple[dict, int]:
    """返回 (glTF JSON, GLB 总字节数)。整文件读取，只解析 JSON。"""
    raw = path.read_bytes()
    magic, version, total = struct.unpack("<4sII", raw[:12])
    if magic != b"glTF" or version != 2:
        raise SystemExit(f"不是 glTF 2.0 二进制文件: {path}")
    offset = 12
    gltf = None
    while offset < total:
        chunk_len, chunk_type = struct.unpack("<I4s", raw[offset : offset + 8])
        if chunk_type == b"JSON":
            try:
                gltf = json.loads(raw[offset + 8 : offset + 8 + chunk_len].decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise SystemExit(f"JSON chunk 解析失败: {path} ({exc})") from exc
        offset += 8 + chunk_len
    if gltf is None:
        raise SystemExit(f"未找到 JSON chunk: {path}")
    return gltf, len(raw)


def mat_mul(a: list[float], b: list[float]) -> list[float]:
    return [sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
            for col in range(4) for row in range(4)]


def identity() -> list[float]:
    return [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]


def trs_to_matrix(node: dict) -> list[float]:
    """节点局部变换：优先 matrix（glTF 列主序），否则由 TRS 合成。"""
    if "matrix" in node:
        return list(node["matrix"])
    t = node.get("translation", [0.0, 0.0, 0.0])
    r = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
    s = node.get("scale", [1.0, 1.0, 1.0])
    x, y, z, w = r
    rot = [
        1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0.0,
        2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0.0,
        2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]
    for col in range(3):
        for row in range(3):
            rot[col * 4 + row] *= s[col]
    rot[12], rot[13], rot[14] = t
    return rot


def apply(m: list[float], p: list[float]) -> list[float]:
    return [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]


def motor_node_mesh_stats(gltf: dict, node: dict) -> tuple[dict, dict, int]:
    """单个节点的全部 mesh primitive 的包围盒（局部 + 世界空间）与三角面数。"""
    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    local_min = [float("inf")] * 3
    local_max = [float("-inf")] * 3
    triangles = 0
    mesh = gltf["meshes"][node["mesh"]]
    for prim in mesh["primitives"]:
        acc = gltf["accessors"][prim["attributes"]["POSITION"]]
        if "min" not in acc or "max" not in acc:
            continue
        lo, hi = acc["min"], acc["max"]
        for axis in range(3):
            local_min[axis] = min(local_min[axis], lo[axis])
            local_max[axis] = max(local_max[axis], hi[axis])
        for i in range(8):
            corner = [lo[0] if i & 1 else hi[0], lo[1] if i & 2 else hi[1], lo[2] if i & 4 else hi[2]]
            wp = apply(node["_world"], corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], wp[axis])
                maxs[axis] = max(maxs[axis], wp[axis])
        if "indices" in prim:
            triangles += gltf["accessors"][prim["indices"]]["count"] // 3
    if mins[0] == float("inf"):
        return {"min": None, "max": None, "size": None}, {"min": None, "max": None, "size": None}, triangles
    return (
        {
            "min": [round(v, 9) for v in mins],
            "max": [round(v, 9) for v in maxs],
            "size": [round(maxs[i] - mins[i], 9) for i in range(3)],
        },
        {
            "min": [round(v, 9) for v in local_min],
            "max": [round(v, 9) for v in local_max],
            "size": [round(local_max[i] - local_min[i], 9) for i in range(3)],
        },
        triangles,
    )


def main() -> int:
    repo = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="只读盘点 GLB 中的电机机械模型节点")
    parser.add_argument("glb", nargs="?", default="web/models/hero_robot_step_aligned.glb")
    parser.add_argument("--out", default="docs/motor-assets/motor-node-map.json")
    args = parser.parse_args()

    glb_path = (repo / args.glb).resolve() if not Path(args.glb).is_absolute() else Path(args.glb)
    out_path = (repo / args.out).resolve() if not Path(args.out).is_absolute() else Path(args.out)

    gltf, byte_size = read_glb_json(glb_path)
    digest = hashlib.sha256(glb_path.read_bytes()).hexdigest()

    # 深度优先展开父子链，写回每个节点的世界变换与索引路径。
    nodes = gltf["nodes"]
    order: list[tuple[int, list[int]]] = []
    stack = [(i, [i]) for i in reversed(gltf["scenes"][gltf.get("scene", 0)]["nodes"])]
    while stack:
        index, path = stack.pop()
        nodes[index]["_path"] = path
        parent = nodes[index].get("_parent")
        local = trs_to_matrix(nodes[index])
        parent_world = nodes[parent]["_world"] if parent is not None else identity()
        nodes[index]["_world"] = mat_mul(parent_world, local)
        order.append((index, path))
        for child in reversed(nodes[index].get("children", [])):
            nodes[child]["_parent"] = index
            stack.append((child, path + [child]))

    entries = []
    for index, _path in order:
        node = nodes[index]
        if "mesh" not in node:
            continue
        name = node.get("name", "")
        if not any(k in name.lower() for k in MOTOR_KEYWORDS):
            continue
        bounds, local, triangles = motor_node_mesh_stats(gltf, node)
        chain = [nodes[i].get("name", "") for i in node["_path"]]
        group = next((gid for gid, _label, parents in GROUPS if any(i in parents for i in node["_path"])), "ungrouped")
        # CAD 命名是完整路径：末段命中关键字的才是电机本体，靠祖先段命中的是同一电机子装配内的关联件。
        own = name.split("/")[-1]
        if own in TEACHING_MOTORS or any(k in own.lower() for k in MODEL_KEYWORDS):
            role = "motor_body"
        elif "电机" in own or "motor" in own.lower():
            role = "named_part"
        else:
            role = "assembly_part"
        entries.append(
            {
                "index": index,
                "name": name,
                "ownName": own,
                "role": role,
                "group": group,
                "parentIndex": node["_path"][-2] if len(node["_path"]) > 1 else None,
                "pathIndices": node["_path"],
                "pathNames": chain,
                "triangles": triangles,
                "localBounds": local,
                "worldBounds": bounds,
            }
        )

    entries.sort(key=lambda e: e["index"])
    report = {
        "source": {
            "path": str(glb_path.relative_to(repo)) if glb_path.is_relative_to(repo) else str(glb_path),
            "byteSize": byte_size,
            "sha256": digest,
            "nodeCount": len(nodes),
            "meshCount": len(gltf["meshes"]),
        },
        "method": "整文件读取与哈希；仅解析 JSON 的变换及 POSITION accessor min/max，不解码 BIN 几何，不写回模型。名称匹配盘点，不保证穷尽未命名电机。",
        "groups": {gid: label for gid, label, _p in GROUPS} | {"ungrouped": "未归组"},
        "roles": {
            "motor_body": "末段含电机型号或为生成脚本明确的教学电机名称；不认证实物型号",
            "named_part": "末段含电机/Motor但未识别为本体，需区分托架、驱动板等",
            "assembly_part": "仅祖先段含电机命名，属同子装配内的关联件（摩擦轮等）",
        },
        "motorNodeCount": len(entries),
        "roleCounts": {r: sum(1 for e in entries if e["role"] == r) for r in ("motor_body", "named_part", "assembly_part")},
        "motors": entries,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # 同步生成可粘贴的 Markdown 清单，避免人工转录出错。
    rows = [
        "| 节点 | 角色 | 结构分组 | 源名称末段 | 三角面 | 局部包围盒 (源单位×1000) | 世界 AABB (源单位×1000) |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    role_label = {"motor_body": "本体（型号命名或教学示意）", "named_part": "电机/Motor命名待分类", "assembly_part": "关联件"}
    for e in entries:
        size = e["localBounds"]["size"]
        wsize = e["worldBounds"]["size"]
        rows.append(
            "| #{index} | {role} | {group} | {own} | {tri} | {local} | {world} |".format(
                index=e["index"],
                role=role_label[e["role"]],
                group=report["groups"][e["group"]],
                own=e["ownName"],
                tri=e["triangles"],
                local="×".join(f"{v * 1000:.1f}" for v in size) if size else "n/a",
                world="×".join(f"{v * 1000:.1f}" for v in wsize) if wsize else "n/a",
            )
        )
    md_path = out_path.with_suffix(".md") if out_path.name != "motor-node-map.json" else out_path.with_name("电机网格清单.md")
    md_path.write_text(
        "# 电机网格节点清单（脚本生成，请勿手工编辑）\n\n"
        f"由 `scripts/motor_model_inventory.py` 只读解析 `{report['source']['path']}` 生成。\n"
        f"源文件 SHA-256：`{digest}`；节点 {len(nodes)}、网格 {len(gltf['meshes'])}；命中电机命名 {len(entries)} 项。\n\n"
        "包围盒均为 glTF 源单位乘以 1000 后的数值，源文件未声明物理单位，本清单不把它当作毫米口径的装配认证。\n\n"
        + "\n".join(rows)
        + "\n\n> 世界 AABB 是旋转后的轴对齐包围盒，长轴斜置时会大于局部包围盒，两者不可直接互算。\n",
        encoding="utf-8",
    )

    print(f"源模型：{report['source']['path']}  sha256={digest[:16]}…  节点 {len(nodes)} / 网格 {len(gltf['meshes'])}")
    counts = report["roleCounts"]
    print(
        f"命中电机命名的网格节点：{len(entries)}"
        f"（型号/教学本体 {counts['motor_body']}，电机/Motor命名待分类 {counts['named_part']}，关联件 {counts['assembly_part']}）"
    )
    for e in entries:
        size = e["worldBounds"]["size"]
        dims = "x".join(f"{v * 1000:.1f}" for v in size) if size else "n/a"
        kind = {"motor_body": "本体  ", "named_part": "待核  ", "assembly_part": "关联件"}[e["role"]]
        print(
            f"  #{e['index']:<4} {kind} [{report['groups'][e['group']]}] "
            f"三角面={e['triangles']:<6} 世界包围盒≈{dims} (源单位×1000)  {e['ownName']}"
        )
    print(f"输出：{out_path.relative_to(repo) if out_path.is_relative_to(repo) else out_path}")
    print(f"输出：{md_path.relative_to(repo) if md_path.is_relative_to(repo) else md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
