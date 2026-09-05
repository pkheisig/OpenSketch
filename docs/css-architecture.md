# CSS architecture

OpenSketch loads one stylesheet entry point, `apps/web/src/styles/app.css`.
The entry point imports modules in a fixed order so ownership is visible in the
source tree rather than encoded by a legacy global stylesheet followed by a
high-specificity theme adapter.

## Ownership

- `tokens.css` owns semantic color, typography, motion, and theme tokens.
- `base.css` owns reset rules and shared primitives.
- `home.css` owns the project library and folder surfaces.
- `editor.css` owns the editor shell, toolbar, and save-state chrome.
- `inspector.css` owns sidebars, assets, fields, selectors, and layers.
- `canvas.css` owns the canvas, rulers, selection tools, contextual menus, and
  workspace controls.
- `dialogs.css` owns dialogs, export options, loading, and feedback.

Feature rules use semantic tokens. Light and dark differences belong in the
token layer or in a narrowly scoped feature rule that is unique to that
feature. A component must not be restyled in a second adapter stylesheet.
Selectors are kept at one owner even when a surface is rendered through a
portal; the owning module can target that portal's stable class directly. A
same-module selector may repeat inside a responsive rule when it intentionally
overrides the base declaration; the checker still rejects cross-module repeats.

## Governance

`scripts/check-style-ownership.mjs` checks the single entry-point import order,
ensures the retired `global.css` and `opengate-theme.css` files do not return,
requires an ownership declaration in each module, and rejects duplicate
top-level selectors across modules. Run it directly with:

```sh
corepack pnpm styles:check
```

The check is part of `corepack pnpm test`. New styles should first be assigned
to one owning module, use an existing semantic token where possible, and add a
focused regression test when they change an interaction or responsive rule.
