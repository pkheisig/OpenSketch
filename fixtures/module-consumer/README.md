# OpenSketch packaged consumer fixture

This fixture represents an external host that installs the versioned release
directory as `@opensketch/application-module`. It mounts the module below
`/consumer/opensketch/`, supplies host services, and keeps ReactDOM/page
ownership in the host. It must be served with the generated release directory;
it never imports `apps/web` or another workspace-relative implementation.
