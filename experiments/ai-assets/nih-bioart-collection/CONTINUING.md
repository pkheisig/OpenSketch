# Continue inventory production

The user authorized the complete concrete inventory, sequential PNG-first generation, SVG conversion, visual review, and periodic commits/pushes on the existing experimental branch. The active thread continuation is `complete-opensketch-bioart-inventory`. Pause it only once the full inventory is covered and all deliverables are pushed, or if the user cancels.

1. Check branch, working-tree changes and remote updates. Preserve other work. Never modify dev, integrate into the production library, create a PR, or change the app UI.
2. Read `inventory-progress.json`. Finish any `awaiting_visual_review` item before starting the next `pending` entry in inventory order.
3. Use the built-in image generation tool, one asset per call and one active asset at a time. Generate a genuine transparent PNG first. Use the original NIH references and the approved collection only as style references. Inspect the generated picture. If necessary, refine against `png/macrophage-bioart-transparent.png`, then request transparency with a targeted edit.
4. Save exact generation/refinement prompts as `originals/inventory/<id>/prompt-input.json`, using apply_patch. Preserve source PNGs. Discarded attempts may be archived alongside them. Never overwrite an accepted asset.
5. Run `/tmp/opensketch-ai-assets-venv/bin/python tools/inventory_asset.py prepare <id> <generated-source.png> <prompt-input.json>` from this collection directory.
6. Inspect `qa/inventory/<id>/comparison.png` in chat. The image tool preview sometimes displays color hidden in alpha-zero pixels. Judge actual transparency from the browser comparison and alpha checks, not black or glowing RGB alone.
7. If the PNG/SVG pair passes, run `tools/inventory_asset.py accept <id> --note '<actual visual findings>'` with the same Python. Otherwise correct the asset and recheck. `prepare --resume` is only for this pending or awaiting-review item's interrupted packaging; it refuses complete items. Use `--version 2` (or the next unused number) for a newly generated correction, preserving the previous original and prompt.
8. Run `tools/inventory_checkpoint.py` with the same Python to validate hashes, upload new QA screenshots/recordings to R2 and refresh `PROGRESS.md`.
9. Review the narrow diff, commit completed files and the ledger, and push only `HEAD:experimental/ai-bioart-assets-20260904`. Verify the remote head. Push periodically; do not wait for all assets.

The tooling imports Pillow for file inspection only, browser canvas for mechanical padding and trace preparation, and VTracer for SVG conversion. Do not use Python to generate or creatively edit images. The PNG preserves generated alpha; only trace input uses alpha threshold 128. Current tracing uses color precision 8 and layer difference 8 to retain shading.

The in-app Browser capability was unavailable when these captures were created. Standalone Playwright Chromium performs local gallery captures; no authenticated site or app UI is involved.

Use `inventory_asset.py alias <id> <target-id> --reason '<specific visual-archetype rationale>' --reference '<supporting source>'` only for justified reuse under the inventory's selection rule. Alias coverage is reported separately from distinct illustration count. Do not turn difficult pending assets into aliases without a scientific and visual rationale.

The initial machine count is 770 rows and 768 distinct names, not the older 767 in the inventory prose. Every row is preserved in the ledger. Optional unnumbered biological-name families in section 37 are expressly conditional and are not concrete checklist entries.
