# Komoot Routing Buddy

A simple browser extension for making MTB trail difficulty easier to read in Komoot.

## What it does

- Highlights trail difficulty directly on the map
- Lets you set a max level to show and colors for each level
- Marks harder trails with a dark red warning (configurable)
- Remembers your preferred map and panel settings between Komoot sessions

## How it looks

### Enabled

![Enabled view](enabled.png)

### Disabled

![Disabled view](disabled.png)

## Install

1. Open your browser extensions page.
2. Turn on Developer mode.
3. Choose Load unpacked and select this folder.
4. Open a Komoot route planner and use the extension.

This is a visual helper only. It does not change the route itself.

## Current state

The extension is ready to use for MTB route planning and trail readability.

## Trail label readability

Highlighted and avoid labels use a thin 0.5px black outline. Label colours are brightened toward white only when needed to reach a calculated 7:1 contrast against that outline; trail-line colours stay unchanged. This measures contrast against the outline, not the underlying terrain. Switching visuals Off restores the original label colours and outlines.

## Browser compatibility work

Extension API calls use `browser-api.js`, which selects Firefox’s `browser` namespace or Chrome’s `chrome` namespace. Chrome loads the shared background code through `background-worker.js`. API selection, settings and popup messaging have automated fixture coverage. Generated manifests target Chrome/Brave and Firefox. The user has confirmed Firefox map functionality; the root manifest continues to support direct loading in Chrome/Brave.


## Browser builds and packaging

Use Node 22 or later:

```sh
npm ci
npm test
npm run build
npm run lint:firefox
npm run package
```

The build copies only approved runtime files and generates correctly sized icons. Shared JavaScript is identical in both builds. Chrome uses a service worker; Firefox loads the adapter and background script as background scripts. Generated files under `dist/` and unsigned ZIPs under `artifacts/` are ignored by Git. Rebuild after source changes.

- Chrome/Brave: open `chrome://extensions` or `brave://extensions`, enable Developer mode, and load unpacked `dist/chrome`.
- Firefox: open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select `dist/firefox/manifest.json`. Alternatively, with Firefox installed, run `npm run dev:firefox`. Temporary installation ends when Firefox closes.
- Firefox's stable extension ID is `komoot-routing-buddy@redfellow`; keep it unchanged across releases. The declared minimum is Firefox 142; development checks used Firefox 156.0.

Before release, test both browsers on `/plan`, `/tour/<id>/zoom` and `/tour/<id>/edit`, including live colours, label readability, native-style restoration, the settings cog, dragged panel position, sidebar H persistence, Satellite restoration and changing map styles. Record the actual browser versions and results. Automated tests and Firefox lint do not substitute for these checks.

The Firefox manifest declares no extension data collection. The code does not send telemetry or route data to a developer service; preferences use the browser's built-in storage/sync. Reassess the declaration if data handling changes. See [Mozilla's data consent guidance](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

For release, update the version in the source `manifest.json`, run `npm run package`, and manually submit the appropriate archive to Chrome Web Store or Mozilla Add-ons. Firefox production installation requires Mozilla signing (including self-distribution); the generated ZIP is unsigned. No publishing credentials or automatic submissions are configured.

The pinned development tools include an `image-size` override to use the patched 2.x parser required by Firefox lint. Revisit the override when `web-ext` updates its dependency.

See [the manual release guide](docs/RELEASING.md) for installation updates, browser checks, privacy disclosures, store submissions and Firefox signing.
