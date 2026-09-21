# Developer notes

This document contains the technical setup, build, and release information for contributors. The public-facing project overview is in [README.md](README.md).

## Project summary

Komoot Routing Buddy is a browser extension that improves trail readability in Komoot by highlighting route difficulty, adding visual warnings, and preserving user preferences between sessions.

## Requirements

- Node.js 22 or later
- npm
- A modern Chrome/Chromium browser and Firefox for validation

## Install and build

```sh
npm ci
npm test
npm run build
npm run lint:firefox
npm run package
```

### Scripts

- `npm test` runs the regression suite.
- `npm run build` builds the extension files into the `dist/` directory.
- `npm run lint:firefox` builds the project and lints the Firefox build with warnings treated as errors.
- `npm run package` runs the tests, lints Firefox, and creates ZIP artifacts under `artifacts/chrome/` and `artifacts/firefox/`.
- `npm run dev:firefox` builds the Firefox extension and launches a Firefox testing session.

## Build notes

- The build copies only approved runtime files and generates the required icons.
- Shared JavaScript is used across both browser builds.
- Chrome uses a service worker model; Firefox loads the adapter and background scripts as background scripts.
- Generated files under `dist/` and unsigned ZIPs under `artifacts/` are not meant to be version-controlled.
- Rebuild after source changes before testing or publishing.

## Browser installation

### Chrome / Brave

Open `chrome://extensions` or `brave://extensions`, enable Developer mode, and load the generated unpacked build from `dist/chrome`.

### Firefox

Open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select `dist/firefox/manifest.json`.

The Firefox development setup can also be launched with `npm run dev:firefox`.

## Browser validation checklist

Before release, test both browsers on `/plan`, `/tour/<id>/zoom`, and `/tour/<id>/edit`, including:

- settings access from the toolbar and floating cog
- colour previews and styling changes
- native styling restoration when visuals are off
- panel position, expanded state, and persistence after refresh
- sidebar hide/show behaviour
- Satellite layer and map-style restoration
- a check that unrelated pages are unaffected and no route is modified

Document the exact browser versions and results in the release notes.

## Privacy and permissions

The Firefox manifest declares no extension data collection. The extension does not send telemetry or route data to a developer service; preferences use the browser's built-in storage mechanisms. Reassess this declaration if data handling changes.

See the Mozilla data-consent guidance for more detail:
https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/

## Release notes

- Update the version in `manifest.json` before a release build.
- Run `npm run package` after the final code changes are in place.
- Validate the generated packages in a browser before submitting them.
- Follow the relevant store distribution process for Chrome and Firefox.

For the public-facing release guide, see [docs/RELEASING.md](docs/RELEASING.md).
