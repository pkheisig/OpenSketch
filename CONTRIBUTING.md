# Contributing to OpenSketch

OpenSketch combines an R launcher, a static React editor, and a manually refreshed
public-domain illustration bundle. Keep those boundaries intact: ordinary builds
must never fetch NIH or Wikimedia content, and browser runtime code must not import
the development-only asset scripts.

Before submitting a change, run:

```sh
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm assets:validate
corepack pnpm build
corepack pnpm test:e2e
R CMD build .
R CMD check --no-manual --as-cran opensketch_*.tar.gz
```

Treat SVG input as executable XML. Changes to either sanitizer require adversarial
tests for scripts, event handlers, external references, CSS URLs, entity declarations,
and internal-ID rewriting.

Do not add built-in artwork unless its source metadata explicitly identifies it as
public domain. Preserve the per-asset author, NIH source, Commons record, and hashes.

Use focused commits, document user-visible changes in `NEWS.md`, and include a
regression test for every defect fix.
