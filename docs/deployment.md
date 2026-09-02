# Deployment

OpenSketch is a static application. The same build supports the existing
GitHub Pages subpath and a root-hosted static site; only `VITE_PUBLIC_BASE`
changes the public URL base.

```sh
pnpm build:pages  # /OpenSketch/ (the default)
pnpm build:root   # / (Netlify and other root-hosted sites)
pnpm test:deployment
```

Both commands build the workspace packages and publish the web app to `dist`.
`test:deployment` builds both variants and inspects the generated app shell,
manifest, service worker, and public paths. It does not require GitHub Actions.

Netlify can build directly from this repository using [`netlify.toml`](../netlify.toml):
it runs `pnpm build:root`, publishes `dist`, and serves the single-page app
fallback from `/index.html`. No generated `dist` directory is committed.

The default `/OpenSketch/` build retains its existing PWA scope and offline
asset behavior. The root variant derives its manifest, navigation fallback,
font caching, and scientific asset caching paths from the same normalized base.
