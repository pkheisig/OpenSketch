# Third-party notices

OpenSketch bundles the following Fontsource font families locally so figures
and the editor do not depend on a runtime font service:

- Atkinson Hyperlegible — Copyright 2020 Braille Institute of America, Inc.
- IBM Plex Sans — Copyright 2019 IBM Corp. All rights reserved.
- IBM Plex Serif — Copyright 2020 IBM Corp. All rights reserved.
- Inter — Copyright 2016 The Inter Project Authors.
- Lato — Copyright (c) 2010–2011 by tyPoland Lukasz Dziedzic.
- Merriweather — Copyright 2024 The Merriweather Project Authors.
- Noto Sans — Copyright 2022 The Noto Project Authors.
- Noto Serif — Copyright 2022 The Noto Project Authors.
- Roboto Mono — Copyright 2015 The Roboto Mono Project Authors.
- Source Sans 3 — Copyright 2010–2026 Adobe Systems Incorporated.
- Source Serif 4 — attributed by the distribution to Google Inc.
- STIX Two Text — Copyright 2001–2021 The STIX Fonts Project Authors.

These fonts are distributed under the
[SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/).
They are not covered by OpenSketch's AGPL software license.

The PDF exporter uses merged TrueType faces from the same Fontsource families
for every editor weight/style combination. Georgia is an explicit PDF mapping
to the bundled Noto Serif face; PDF export never depends on a system Georgia
installation. Atkinson Hyperlegible and Lato ship only 400/700 faces, so their
editor 600 choice follows the browser's nearest-face matching to 700.

The NIAID NIH BioArt illustrations bundled by OpenSketch remain in the public
domain. Their per-asset author, source, Commons record, and public-domain status
are retained in the generated manifest and source lock.
