# WebMCP command record

This is the ordered, curated replay record for the PAU-478 figure. Repeated inspection and validation calls are collapsed; object IDs and final mutation payloads are preserved.

## Invocation pattern

```js
const tools = window.__webmcpTools || [];
const latest = (name) => [...tools].reverse().find((tool) => tool.name === name);
const result = await latest(commandName).execute(input);
```

All canvas mutations below were executed through registered WebMCP callbacks.

## 1. Inspect existing scene and semantics

```text
inspect_scene {}
inspect_relations {"limit":256}
inspect_object {"objectId":"<candidate object id>"}  # repeated for existing cells, proteins, text, groups, and connectors
inspect_geometry {"objectIds":["<candidate ids>"]}
inspect_asset {"familyId":"<NIH BioArt family id>"}
```

## 2. Create particle fields

`create_particle_field` was called five times for released tumor antigens, priming cytokines, CXCL9/10/11 chemokines, trafficking cues, and perforin/granzymes. Fields use deterministic seeds and the `particle-field` semantic role.

Final retained field examples:

```text
5656a3b7-1806-4993-a4b3-9d7fe7dbe6ef  # CXCL9/10/11 trafficking gradient
a537e3c2-29eb-464b-9807-5ef17f390703  # priming cytokine field
```

## 3. Compose biological interactions

`compose_interaction` was used for these relationship classes:

```text
contact          dendritic cell ↔ CD8 T cell; CTL/NK ↔ tumor cells
binding          peptide-MHC-I ↔ TCR/CD8; CD80 ↔ CD28
secretion        antigen/cytokine/chemokine/perforin-granzyme sources → particle fields
migration        dendritic cell → lymph node; effector T cells → chemokine gradient
cross-boundary   effector T cell ↔ tumor endothelium
progression      living tumor → apoptosis; stage-local process progression
```

The final relation store contains 39 relations with kinds:

```text
binds, contacts, crosses, emits, flow_to, follows_gradient,
intervention_targets, labels
```

## 4. Compose seven labeled stages

`compose_labeled_group` was called once for each stage. The saved stage/content group pairs are:

| Stage | Stage group | Stage-content group |
|---:|---|---|
| 1 | `a29050ab-2409-4338-90df-0ec8d48f53b0` | `8c2085d3-b754-48da-8547-d097fd5c25c6` |
| 2 | `6ff8daad-81f5-46b0-bb80-fa797a961e30` | `ecf89270-d83f-406b-aab0-505c91fcfd06` |
| 3 | `a66bd5a3-16a6-4509-8601-7addf30a8f36` | `1e376fae-8665-401a-9f8e-c8db1266107a` |
| 4 | `3d894ae9-1a87-495e-b5d5-b1bc58ff7811` | `05977b5e-28b8-42e1-8067-f54081f3dc0a` |
| 5 | `21e67597-c901-4946-8993-62a8972b1a33` | `6117ee5f-ab14-4064-b920-b4693fb3a403` |
| 6 | `fb233696-751d-4057-b861-034d87a21b94` | `839be640-d608-4b3a-94ba-3df36a6bddf5` |
| 7 | `831daa88-8f7a-4760-bf2f-8bb4e4c66fb2` | `e88fdbf8-7568-4df7-afcb-7ac9b9f369cb` |

The protected hub is `61d11cf4-36ab-4460-91c0-78988a11adab`.

## 5. Fit labels and plan the complete cycle

```js
await latest("fit_text").execute({
  objectId: "<stage title/subtitle id>",
  maxWidth: 420,
  maxHeight: 96,
  minFontSize: 14
});

const hubGeometry = await latest("inspect_geometry").execute({
  objectIds: ["61d11cf4-36ab-4460-91c0-78988a11adab"]
});
const hubKeepOut = hubGeometry.data.objects[0].layoutBounds;

const layout = await latest("plan_layout").execute({
  "objectIds":[
    "a29050ab-2409-4338-90df-0ec8d48f53b0",
    "6ff8daad-81f5-46b0-bb80-fa797a961e30",
    "a66bd5a3-16a6-4509-8601-7addf30a8f36",
    "3d894ae9-1a87-495e-b5d5-b1bc58ff7811",
    "21e67597-c901-4946-8993-62a8972b1a33",
    "fb233696-751d-4057-b861-034d87a21b94",
    "831daa88-8f7a-4760-bf2f-8bb4e4c66fb2"
  ],
  "mode":"cycle",
  "center":{"x":1700,"y":1400},
  "axes":{"x":1100,"y":1050},
  "startAngle":-90,
  "direction":"clockwise",
  "gap":72,
  "padding":120,
  hubKeepOut
});

await latest("apply_layout_plan").execute({
  planId: layout.data.plan.id
});
```

## 6. Create annotations

`create_annotation` was called eight times. Final annotation IDs:

```text
2624199d-1406-4821-a252-4b01802a50ad
2c991665-a0f4-4c89-945d-f7a6a68189ba
369e6399-c2e0-437f-abf4-09c333912f54
e870d776-319d-4c23-93bc-68fa904e3a5a
17beedb7-3957-4125-a9a4-5afa9e9f7e54
496ff905-1a23-435b-9c81-4ab85dc6c1c9
9bd279b2-9bc7-4704-bf1f-ccd5c60d65c0
8d2cf1b3-9b45-43ba-9b48-cddbf5d11177
```

## 7. Build the persistently bound cycle

The first cycle render exposed the large-arc renderer defect. After the geometry fix, the seven old connectors were removed and recreated with this exact payload:

```js
await latest("delete_objects").execute({
  objectIds: [
    "7cc31678-03d7-4a7e-8a10-e9ca4d4b9d62",
    "1be1db37-db3e-4a0c-96e6-72f9290f9a7e",
    "e0db4ddf-e939-4240-a0e9-6b735d602233",
    "3a8ade9c-2ff5-41ec-8232-032e16630770",
    "0dba2bdc-2cf4-4c1b-87f6-efe998a921a8",
    "b6f7fa28-15c7-4c47-9696-cb32fe82023c",
    "1cf735e5-adb6-424a-a97e-a110f9c18e9e"
  ],
  confirmed: true
});

await latest("connect_sequence").execute({
  objectIds: [
    "8c2085d3-b754-48da-8547-d097fd5c25c6",
    "ecf89270-d83f-406b-aab0-505c91fcfd06",
    "1e376fae-8665-401a-9f8e-c8db1266107a",
    "05977b5e-28b8-42e1-8067-f54081f3dc0a",
    "6117ee5f-ab14-4064-b920-b4693fb3a403",
    "839be640-d608-4b3a-94ba-3df36a6bddf5",
    "e88fdbf8-7568-4df7-afcb-7ac9b9f369cb"
  ],
  closed: true,
  direction: "clockwise",
  routeType: "cycle-arc",
  center: { "x": 1700, "y": 1400 },
  axes: { "x": 1100, "y": 1050 }
});
```

Final cycle connector IDs:

```text
426e77ae-f633-4d3d-92fb-08dacf0c5a88
cb423e3c-429c-40b3-9e62-0d9691ef44c0
7af52ce8-3d9f-4da8-8539-8b9fbeab4fc6
bd94d5d6-8e30-43da-ba26-59b475319072
61487386-fb25-4d86-adaf-fa743c2edf6b
06a164aa-2ca1-4a83-837a-63cd3328632c
1d7af8b6-896c-4b65-8ddb-5d2e3d34df55
```

Each connector was then passed to:

```text
repair_connectors {"connectorIds":["<seven IDs above>"],"category":"z-order"}
```

## 8. Recursive analysis and validation

```js
await latest("analyze_composition").execute({
  profile: "cycle",
  categories: ["geometry", "text", "connectors", "relations", "scientific", "style"],
  maxFindings: 256
});

for (const profile of ["cycle", "scientific-diagram", "publication"]) {
  await latest("validate_figure").execute({ profile, maxFindings: 256 });
}
```

The final validation loop was repeated after a full browser reload to verify canvas persistence and bound-connector restoration.
