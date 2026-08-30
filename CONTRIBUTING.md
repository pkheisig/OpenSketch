# Contributing to OpenSketch

OpenSketch combines a static React editor with a manually refreshed
public-domain illustration bundle. Ordinary builds must never fetch NIH or
Wikimedia content, and browser runtime code must not import development-only
asset scripts.

Before submitting a change, run:

```sh
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm assets:validate
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm test:pwa
```

Treat SVG input as executable XML. Changes to either sanitizer require
adversarial tests for scripts, event handlers, external references, CSS URLs,
entity declarations, and internal-ID rewriting.

Do not add built-in artwork unless its source metadata explicitly identifies it
as public domain. Preserve the per-asset author, NIH source, Commons record, and
hashes.

Keep `.OpenSketch` compatibility behind the explicit migration gate. Add a
regression fixture before changing the portable project schema. Use focused
commits, document user-visible changes in `NEWS.md`, and include a regression
test for every defect fix.

CSS has one entry point at `apps/web/src/styles/app.css`. Shared semantic
tokens live in `tokens.css`; each surface owns one module (`base.css`,
`home.css`, `editor.css`, `inspector.css`, `canvas.css`, or `dialogs.css`). Do
not add a second theme adapter or rely on import order to resolve duplicate
selectors. Run `corepack pnpm styles:check` after CSS changes; the check is also
part of `corepack pnpm test`.
