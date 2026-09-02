# Contributing to OpenSketch

OpenSketch combines a static React editor with a manually refreshed
public-domain illustration bundle. Ordinary builds must never fetch NIH or
Wikimedia content, and browser runtime code must not import development-only
asset scripts.

## Licensing and contributor grant

OpenSketch's own source code is licensed under the GNU Affero General Public
License v3.0 only (`AGPL-3.0-only`). Bundled third-party artwork and other
third-party material retain their original licenses or public-domain status.

By intentionally submitting a contribution for inclusion in OpenSketch,
including a pull request, patch, code, documentation, or other copyrightable
material, you represent that you have the legal right to submit it and agree
that:

- your contribution may be distributed as part of OpenSketch under
  `AGPL-3.0-only`; and
- in addition, you grant the project copyright holder(s), and their successors
  and assigns, a perpetual, worldwide, non-exclusive, royalty-free,
  irrevocable license to use, reproduce, modify, prepare derivative works of,
  publicly display or perform, distribute, sublicense, and relicense your
  contribution under any license or licensing model, including proprietary or
  commercial terms.

To the extent that you control patent claims necessarily infringed by your
contribution, you also grant the project copyright holder(s), and their
successors and assigns, a perpetual, worldwide, non-exclusive, royalty-free,
irrevocable patent license, with the right to sublicense, to make, have made,
use, offer to sell, sell, import, and otherwise transfer your contribution and
derivative works of it.

You retain copyright in your contribution unless you separately assign it. The
additional grants above exist so that project stewardship, dual licensing,
future relicensing, and a transfer or acquisition of project rights cannot be
blocked by external contributions.

Do not submit third-party code or artwork unless you have the right to provide
the grants above. Existing bundled artwork remains governed by its recorded
source license or public-domain status; inclusion in this repository does not
relicense it. If you cannot provide the contributor grants for material you
want to add, open an issue before submitting it.

## Development and validation

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
as public domain or its recorded open license is compatible with the asset
pipeline. Preserve the per-asset author, source, license, and hashes.

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
