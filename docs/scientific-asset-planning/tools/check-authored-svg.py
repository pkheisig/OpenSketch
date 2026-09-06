#!/usr/bin/env python3
"""Check new hand-authored primitives. Existing traced library assets are exempt."""
import argparse
import json
import math
import pathlib
import re
import xml.etree.ElementTree as ET

ROLES = {"primary", "secondary", "outline", "highlight", "detail"}
SHAPES = {"path", "rect", "circle", "ellipse", "polygon", "polyline", "line"}
def check(path):
    errors = []
    raw = pathlib.Path(path).read_bytes()
    if len(raw) > 1_000_000:
        errors.append("New primitive exceeds 1 MB; simplify geometry.")
    if re.search(rb"<!DOCTYPE|<!ENTITY", raw, re.I):
        return {"path": str(path), "errors": ["DTD/entities are not allowed."]}
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        return {"path": str(path), "errors": [str(exc)]}
    if root.tag.rsplit("}", 1)[-1] != "svg":
        errors.append("Root element must be svg.")
    try:
        view = [float(x) for x in root.get("viewBox", "").replace(",", " ").split()]
        if len(view) != 4 or not all(math.isfinite(x) for x in view) or min(view[2:]) <= 0:
            raise ValueError()
    except ValueError:
        errors.append("Provide a finite viewBox with positive width and height.")
    count = 0
    roles = set()
    ids = set()
    def walk(node, inherited=None):
        nonlocal count
        tag = node.tag.rsplit("}", 1)[-1]
        role = node.get("data-color-role", inherited)
        if role is not None and role not in ROLES:
            errors.append("Unknown color role: " + role)
        if tag in {"image", "text", "script", "foreignObject", "use"}:
            errors.append("Unsupported primitive element: " + tag)
        node_id = node.get("id")
        if node_id:
            if node_id in ids:
                errors.append("Duplicate ID: " + node_id)
            ids.add(node_id)
        if tag == "path" and not node.get("d", "").strip():
            errors.append("Empty path has no geometry.")
        if tag in SHAPES:
            count += 1
            if role not in ROLES:
                errors.append("Painted " + tag + " has no explicit color role.")
            else:
                roles.add(role)
        for child in node:
            walk(child, role)
    walk(root)
    if count > 1000:
        errors.append("More than 1000 paint elements; simplify the new primitive.")
    if "primary" not in roles:
        errors.append("At least one primary body region is required.")
    return {"path": str(path), "paintElements": count, "roles": sorted(roles), "errors": errors}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("svg", nargs="+", type=pathlib.Path)
    args = parser.parse_args()
    results = [check(path) for path in args.svg]
    print(json.dumps(results, indent=2))
    raise SystemExit(1 if any(result["errors"] for result in results) else 0)
