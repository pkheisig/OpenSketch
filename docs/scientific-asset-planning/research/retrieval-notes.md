# Retrieval and evidence notes

Research cutoff: 2026-09-05. Sources were discovered by topic searches and opened as source pages; the ledger records the relevant page sections. This is a curated planning review, not a systematic literature review with a claim of exhaustive search coverage. Search-result snippets alone were not used as evidence.

## Source groups

- Reactome: TCR, BCR, complement, platelet activation, antigen presentation, IgE, PD-1, interferon, WNT, NOTCH, insulin, apoptosis, autophagy, splicing and STING.
- RCSB PDB/PDB-101: ferritin, fibrin, nanodiscs, riboswitches, telomerase, LPS, porins, IgE Fc and a four-way DNA junction deposition.
- University of Leeds histology: intestinal epithelium, capillary architecture and alveolar cells.
- NCBI-hosted scholarly chapter: aggrecan structure and cartilage context.
- Addgene, NEB, 10x Genomics and Thermo Fisher: selected cloning, single-cell and Annexin assay concepts. These are institutional/vendor method references, not independent validation studies of every performance claim.

The records in `sources.json` contain the exact URLs and verified scope. Publication authors/years were not normalized into a bibliographic database; the CSV explicitly marks that absence rather than inventing metadata. Page content can change after the recorded access date. No claim is made that the linked live pages are immutable snapshots.

## Limitations found during checking

- Reactome's content-service request for BCR returned HTTP 403. The public pathway page was accessible and supplied the cited evidence; no access bypass was attempted.
- Complement C2-fragment nomenclature is inconsistent across historical conventions. The general recipe avoids silently choosing one.
- The platelet page contains a problematic factor-complex description. The catalog uses its high-level activation/aggregation scope and does not reproduce that factor assignment.
- The STING page includes historical mouse/human context. The recipe limits itself to trafficking and downstream signaling and does not claim a verified cGAS/cGAMP sequence.
- An IgE Fc structure is not a full IgE binding pose. The complete antibody remains a labeled assembly schematic.
- Annexin/dye double positivity is compatible with more than one death state. The recipe retains that ambiguity.
- OpenStax pages encountered during exploration were excluded from the evidence set. No catalog entry relies on their text or figures.

## Verification boundary

The claim matrix marks scientific statements as reported, original design instructions as inferred proposals, and unverified brainstorms as not-disclosed. Reported means supported by the stated source at schematic scope, not independently reproduced experimentally. Geometry, colors, quantities and species-specific details require additional checking when not established by that source.

No commercial catalog content or source artwork was downloaded into this branch. The machine-readable baseline snapshot records pre-existing library paths and hashes only; it does not duplicate their image files.

## Document checks

The literature-review skill's bundled audit was attempted. Its ledger/bibliography checks found all 35 keys after bibliography generation, but its overall command fails because it requires a TeX manuscript and scans only TeX citations. This deliverable is Markdown plus JSON/CSV, so its no-TeX error and uncited-TeX warnings are not treated as a passing audit. The catalog generator independently validates protected hashes, counts, names, dependencies, cycles and source references; local Markdown links are checked separately.

During manual overlap review, draft C015 (ferritin loading states) was folded into A001, and draft C024 (four-way-junction conformation comparison) was folded into A009. Their IDs are intentionally absent rather than repurposed. This prevents two proposed state comparisons from becoming redundant assembly backlog entries.
