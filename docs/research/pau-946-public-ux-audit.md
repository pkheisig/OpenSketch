# PAU-946 public feasibility and UX audit

Date: 2026-09-06

This bounded audit used only publicly accessible sources. It informed the
adapter boundary and the compact import/export UI; it did not copy product
text, artwork, layouts, or authenticated product behavior.

## Feasibility findings

- [ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
  defines Office Open XML document representation and its packaging model.
  The implementation therefore validates the ZIP package, content types, and
  relationships before inspecting slide XML.
- [PptxGenJS browser integration](https://gitbrent.github.io/PptxGenJS/docs/integration/)
  and [browser saving](https://gitbrent.github.io/PptxGenJS/docs/usage-saving/)
  confirm that standards-oriented PPTX export and browser Blob delivery are
  feasible. PptxGenJS is an export reference, not the import architecture:
  adopting it would not provide the required bounded PresentationML intake or
  truthful unsupported-feature report.
- The issue's other candidates remain qualification candidates rather than
  runtime dependencies. No parser/renderer is accepted solely because a demo
  deck opens; the adapter keeps an explicit snapshot/refusal boundary and
  records what was not mapped.

## Public molecular-biology UX references

- [Benchling Molecular Biology](https://www.benchling.com/molecular-biology)
  presents contextual sequence views, annotations, guided design, and
  traceability as separate tasks around one scientific object.
- [Benchling CRISPR tools](https://help.benchling.com/hc/en-us/articles/37748593861133-Use-CRISPR-tools)
  shows a compact progression from a bounded target choice to scored results
  and an explicit save step.
- [Benchling codon optimization](https://help.benchling.com/hc/en-us/articles/9684246819213-Codon-optimize-sequences)
  makes material choices visible before preview/save, including protected
  regions and cut-site handling.

The resulting OpenSketch decision is deliberately smaller: keep PowerPoint in
the existing Format dropdown, make slide selection an explicit import decision
when a package has multiple slides, and surface fidelity/flattening findings
only when they affect the result. There is no Office-style toolbar, permanent
compatibility panel, or hidden conversion mode.
