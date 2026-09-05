# OpenSketch scientific asset expansion plan

106 planning entries: **70 source-checked specifications and 36 further brainstorms**. No artwork has been generated. The source-checked claims describe schematic biology; the proposed layouts are original design decisions, not scientifically validated geometry.

| Deliverable | Count | What to do with it |
|---|---:|---|
| [New building-block candidates](NEW-ASSETS.md) | 12 | Consider a distinct morphology or topology; try existing geometry first |
| [Reuse presets](REUSE-PRESETS.md) | 18 | Reuse an existing asset with labels, placement or state overlays |
| [Composite recipes](COMPOSITES.md) | 40 | Assemble library instances; 11 new topics and 29 expansions of existing concepts |
| [Further brainstorms](BRAINSTORM.md) | 36 | Verify the listed scientific questions before implementation |

**Browse all entries in the [Planning index](INDEX.md).**

**Start future implementation with [Assembly instructions](ASSEMBLY-INSTRUCTIONS.md).** An immune reaction, for example, combines our existing cell, receptor and protein instances with editable connectors. Do not create the entire scene as one new SVG.

## What was checked

The 70 specifications have claim-level references to 35 opened scientific resources: Reactome pathways, RCSB structural resources, university histology material and official assay/method documentation. Each specification separates the supported biological fact, proposed construction, useful states, caveats, exact library dependencies and its deduplication decision. Sources support only the stated scope; they do not certify every proposed color, position or curve.

This is a selected scientific expansion, not an exhaustive commercial catalog or a census of every biological object. BioRender account content, images, names, descriptions and template layouts were not used for this catalog. No reference-image archive is included.

## Baseline and duplicate handling

The baseline is production feature commit `f76212775d0fc1af43c7079964b5d22cfecf6324`, from `experimental/ai-bioart-assets-20260904`. Planning lives separately on `planning/scientific-asset-expansion-20260905` because the production worktree contained ongoing artwork work.

Two draft composite ideas were also removed because their state comparisons already belong to the ferritin and four-way DNA primitive specifications.

The original two inventory files contain **770 rows but 768 unique names**: `organ-on-chip device` and `hydrogel scaffold` each occur twice. The existing assembly roadmap contains 136 numbered entries. All three documents and the production progress ledger remain byte-identical to the baseline.

Exact normalized-name comparisons and dependency checks are automated. Morphological and topic overlap was also reviewed against the nearest existing archetypes and roadmap entries. That manual judgment is recorded per entry; a string comparison alone cannot establish semantic novelty. Existing concepts receive expanded specifications, not another primitive backlog entry. In particular, the 18 presets, 29 existing-concept recipe expansions and 36 brainstorms must not be reported as newly required artwork.

A baseline checklist item is not necessarily completed artwork. Dependencies carry the pinned ledger status and, where available, file-existence/hash checks. Recheck current availability before implementing; this snapshot deliberately does not absorb concurrent production changes.

## Machine-readable evidence and maintenance

- [Full catalog](catalog.json): stable planning IDs, kinds, dependency references, evidence and caveats.
- [Baseline snapshot](research/baseline-snapshot.json): all 768 names, source rows, IDs, statuses, file checks and protected-file hashes.
- [Source ledger](research/source-ledger.csv) and [source details](research/sources.json): source URLs, evidence locations and checked scope.
- [Claim/evidence matrix](research/claim-evidence-matrix.csv): reported scientific claims versus proposed design and unverified brainstorms.
- [Review contract](research/review-plan.md) and [retrieval notes](research/retrieval-notes.md): scope and evidence limitations.
- [Validation report](research/validation-report.json): structural checks and preservation result.

To regenerate the catalog from its authored records, run from this worktree:

```sh
python3 docs/scientific-asset-planning/tools/build_catalog.py
```

The generator fails if a protected baseline file changes. A future rebase onto a newer inventory requires an explicit baseline update and another deduplication pass. Do not silently remove that guard. The script writes planning documents and JSON/CSV only.

App implementation: [Editable structures and generated artwork](EDITABLE-STRUCTURES.md).
