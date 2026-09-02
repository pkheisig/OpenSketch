# WebMCP and semantic editor guide

This guide is for contributors and judges who want to understand or qualify
OpenSketch's WebMCP surface. OpenSketch remains a private, browser-native
scientific figure editor: the browser owns the project, canvas, history,
assets, persistence, and exports. WebMCP is a progressive enhancement over
that editor, not a second application or a server API.

## Architecture

The semantic layer has four parts:

1. `apps/web/src/semantic/semanticCommands.ts` is the versioned command
   registry. Each command declares its name, purpose, input/output schema,
   risk, confirmation requirement, retry/idempotency hints, and project/canvas
   prerequisites.
2. `semanticRuntime.ts` validates inputs, reports capabilities, enforces
   prerequisites, resolves bounded aliases for batches, and converts editor
   results into stable success/failure envelopes.
3. `semanticEditorAdapter.ts` is the editor boundary. It maps semantic
   commands to the same `EditorContext` transaction and history pathways used
   by the application, while exposing bounded scene, asset, and provenance
   inspection.
4. `webmcp.ts` detects a browser `document.modelContext` with a callable
   `registerTool` method and registers the available semantic commands as
   WebMCP tools. `EditorContext.tsx` retries registration briefly because a
   compatible host may expose the model context after the editor first loads.

The development-only `semanticIntrospection.ts` hook is separate from the
WebMCP transport. It is useful for local qualification and is rejected from
the production bundle by `scripts/check-webmcp-build.mjs`. No raw Fabric
objects, complete project files, matrices, or unbounded scene snapshots are
exposed through the semantic surface.

## Public command catalogue

The catalogue below is intentionally a compact index, not a copy of the input
schemas. The table is checked against `SEMANTIC_COMMANDS` by
`tests/webmcp-documentation.test.ts`; add or remove a row when changing the
registry.

| Command                  | Purpose                                                          | Risk and confirmation                        |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------- |
| `inspect_scene`          | Bounded canvas and hierarchy snapshot                            | Read-only                                    |
| `inspect_object`         | Inspect one stable scene object ID                               | Read-only                                    |
| `inspect_selection`      | Inspect the current human selection                              | Read-only                                    |
| `search_assets`          | Search the bundled scientific asset manifest                     | Read-only                                    |
| `inspect_asset`          | Inspect one asset family or variant without raw SVG              | Read-only                                    |
| `inspect_provenance`     | Inspect bounded asset provenance for the figure                  | Read-only                                    |
| `set_selection`          | Set the canvas selection by stable object IDs                    | Reversible and retryable                     |
| `create_text`            | Create point or box text through the editor pathway              | Reversible                                   |
| `create_shape`           | Create a supported OpenSketch shape                              | Reversible                                   |
| `create_connector`       | Create a free or object-bound connector                          | Reversible                                   |
| `insert_asset`           | Insert an exact bundled asset family and variant                 | Reversible                                   |
| `replace_asset_variant`  | Replace an asset variant while preserving identity and placement | Reversible and retryable                     |
| `move_objects`           | Translate exact scene objects                                    | Reversible and retryable                     |
| `rotate_objects`         | Rotate exact scene objects                                       | Reversible and retryable                     |
| `scale_objects`          | Scale exact scene objects                                        | Reversible and retryable                     |
| `flip_objects`           | Flip exact scene objects on one axis                             | Reversible and retryable                     |
| `set_object_properties`  | Apply typed, whitelisted object properties                       | Reversible and retryable                     |
| `set_asset_color_preset` | Apply an existing asset color preset                             | Reversible and retryable                     |
| `arrange_objects`        | Move objects within their layer collection                       | Reversible and retryable                     |
| `align_objects`          | Align objects to the requested union-bound axis                  | Reversible and retryable                     |
| `distribute_objects`     | Distribute three or more objects on one axis                     | Reversible and retryable                     |
| `duplicate_objects`      | Clone objects with fresh identities                              | Reversible                                   |
| `delete_objects`         | Delete exact objects and bound connectors                        | Sensitive/destructive; explicit confirmation |
| `group_objects`          | Group exact sibling objects                                      | Reversible                                   |
| `ungroup_objects`        | Ungroup one existing manual group                                | Reversible                                   |
| `undo`                   | Undo the most recent editor history step                         | Reversible                                   |
| `redo`                   | Redo the next editor history step                                | Reversible                                   |
| `export_figure`          | Start the existing SVG, PDF, PNG, or credits download            | Local side effect                            |
| `batch`                  | Run up to 32 typed mutations as one atomic history step          | Sensitive/destructive; explicit confirmation |

All current commands use semantic runtime version `opensketch.semantic.v1`.
Command outputs contain a bounded result, changed object IDs, warnings, and
the runtime version. Object references are stable IDs, not DOM selectors or
array positions. `batch` accepts registered mutations only, resolves aliases
within the batch, and rolls back the editor transaction if a member fails.

## Safety and progressive enhancement

The runtime validates the declared schema before execution and checks that a
project and, where necessary, a ready canvas exist. Mutations go through the
normal editor transaction/history boundary, so semantic edits are visible to
manual editing and ordinary undo/redo. Stale object IDs, unsupported values,
invalid asset references, and unavailable capabilities fail with structured
errors before a mutation is applied.

`delete_objects` requires `confirmed: true`. `batch` also requires explicit
confirmation, and its confirmation covers every contained mutation, including
deletes. Export commands create browser downloads; they do not upload project
data. Asset search and inspection return catalog/provenance metadata rather
than raw SVG source.

When `document.modelContext` is absent or does not provide
`registerTool(tool, options)`, no WebMCP tools are registered. The normal
editor still works, and local tests can use the transport-neutral runtime or
development introspection surface. This is the expected fallback for browsers
without WebMCP support; it is not an application error.

## Judge qualification path

The hosted app is [OpenSketch on GitHub Pages](https://pkheisig.github.io/OpenSketch/).
No account or judge credential is required.

1. Open the hosted app in ChatGPT's in-app browser or another compatible
   browser with WebMCP enabled. Create a **New figure**.
2. Confirm that the host can discover the registered tools. In a local browser
   harness, install a `document.modelContext.registerTool` recorder before
   navigation and inspect the recorded tool names. The expected names are the
   catalogue above.
3. Run a bounded read-only check with `inspect_scene` and search the bundled
   library with `search_assets`. Use `inspect_asset` to choose an exact family
   and variant, then insert it with `insert_asset`.
4. Continue the same workflow with `create_text`, `move_objects`, or
   `set_object_properties`, and re-run `inspect_scene` to verify the stable
   object identity and changed state. `inspect_provenance` should report the
   inserted scientific asset.
5. Make a normal manual canvas edit, then use `inspect_scene` again. The
   semantic surface should see the same live editor state. `undo` and `redo`
   use the same history as the manual editor.
6. If a local download check is needed, use `export_figure` with
   `format: "credits"`; exports remain local browser downloads.

Run the focused qualification from the repository root with:

```sh
pnpm test:webmcp
```

This runs the semantic unit tests, the registry/catalogue drift guard, the
production build guard, and the Chromium browser workflow in
`tests/e2e/webmcp.spec.ts`. The browser test supplies a small model-context
recorder, exercises asset search/insertion, editing, grouping, history,
provenance, stale-ID handling, manual editing, and a local credits download.

## Deployment variants

The production build supports the GitHub Pages path `/OpenSketch/` by default.
WEB-6 (PAU-433, [PR #18](https://github.com/pkheisig/OpenSketch/pull/18)) adds
one normalized `VITE_PUBLIC_BASE` and the provider-native static-host
configuration. On the current `dev` head, use:

```sh
pnpm build:pages  # /OpenSketch/; the default GitHub Pages deployment
pnpm build:root   # /; root-hosted static deployment
pnpm test:deployment
```

The root variant uses `netlify.toml`: it runs
`pnpm build:root`, publishes `dist`, uses Node 24, and serves the SPA fallback
from `/index.html`. The same normalized base then drives Vite assets, PWA scope
and `start_url`, Workbox navigation fallback, and runtime font/scientific-asset
cache paths. No generated `dist` directory is committed, and the deployment
does not depend on GitHub Actions artifacts.

The default build retains the existing offline contract: the app shell is
cached by the service worker, while the large scientific asset pack is fetched
only after the user explicitly prepares it from the Assets panel. Cache
entries, IndexedDB projects, and imported media remain origin-local.

## Existing project and WebMCP change boundary

The repository does not encode an external WebMCP Challenge start timestamp.
For an auditable, reproducible source boundary, this guide records the
following history instead:

| Boundary               | Evidence                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-WebMCP baseline    | [`d8c7428`](https://github.com/pkheisig/OpenSketch/commit/d8c74284435605a72d7ed5ce60a854da74e56399), the direct parent of the first semantic-runtime commit, dated 2026-08-30; its parent is [`920de47`](https://github.com/pkheisig/OpenSketch/commit/920de476e9e802f97ff3a2af78337c4b6311da69), the preceding merge commit |
| First semantic runtime | [`8373141`](https://github.com/pkheisig/OpenSketch/commit/83731418a85916f50b536c5426e75920237d80d7), `feat: add semantic editor runtime`, dated 2026-09-02                                                                                                                                                                   |
| WebMCP exposure        | [`2ca786b`](https://github.com/pkheisig/OpenSketch/commit/2ca786b3e6243279faab34e86f89e9e63ed5ad7b), `feat: expose semantic workflows through WebMCP`, dated 2026-09-02                                                                                                                                                      |
| WebMCP hardening       | [`771c41f`](https://github.com/pkheisig/OpenSketch/commit/771c41f876601f3988cf9b19e9ec02f167229572) and [`557efd7`](https://github.com/pkheisig/OpenSketch/commit/557efd7c7c1f0accbc43eb79909da5e60b22c34b), dated 2026-09-02                                                                                                |

Before that recorded boundary, OpenSketch already had the browser editor,
Fabric canvas, local projects and history, offline assets, manual figure
editing, provenance-aware exports, and the AGPL/third-party-artwork licensing
model. The semantic/WebMCP work added or changed the following implementation
areas:

- `apps/web/src/semantic/` — registry, typed runtime, editor adapter,
  introspection, and WebMCP registration;
- `apps/web/src/editor/EditorContext.tsx` and
  `apps/web/src/editor/creationObjects.ts` — shared semantic/editor mutation
  paths;
- `tests/semantic-runtime.test.ts`,
  `tests/semantic-editor-adapter.test.ts`, `tests/webmcp.test.ts`, and
  `tests/e2e/webmcp.spec.ts` — unit and browser qualification;
- `scripts/check-webmcp-build.mjs` and the root `test:webmcp` script — the
  production guard and repeatable qualification entry point.

The commit boundary is repository evidence, not a claim about the external
challenge calendar. For a submission report, pair these immutable commits with
the challenge's official submission timestamp. Do not describe the preexisting
editor or artwork library as WebMCP work.

## Licensing and provenance

OpenSketch source is AGPL-3.0-only; the complete text is in [`LICENSE`](../LICENSE)
and the GitHub-visible summary is [`LICENSE.md`](../LICENSE.md). Bundled
artwork is not relicensed: source, author, license, and attribution metadata
remain attached to the asset manifests and third-party notices. The semantic
asset and provenance commands preserve that distinction, and exports provide
readable credits alongside embedded provenance where the format supports it.
