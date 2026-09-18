# Komoot Routing Buddy

A Manifest V3 browser extension for Komoot that makes MTB singletrail difficulty easier to read in the route planner.

## What it does

- Adds a floating planner panel with an always-visible legend for S0–S5.
- Lets you set a maximum trail level to display.
- Lets you choose for each level whether it is:
  - highlighted in colour,
  - marked dark red as a visual avoid warning,
  - or dimmed / hidden from emphasis.
- Remembers the last selected Komoot map layer settings and restores them on new planner pages.
- Remembers whether the left sidebar is open and restores its state on future planner pages.
- Works only on Komoot planner pages and does not change the route or submit ride data.

## Current state

This extension is now a practical browser helper for visual trail guidance rather than just a prototype.

### Features in place

- Popup rule editor in [popup.html](popup.html) and [popup.js](popup.js)
- Shared settings storage and defaults in [settings.js](settings.js)
- Planner panel and route styling in [content.js](content.js)
- Floating panel visuals in [planner.css](planner.css)
- Sidebar persistence in [sidebar.js](sidebar.js)
- Background popup opener in [background.js](background.js)
- MapLibre bridge for applying trail filters / paint rules in [map-bridge.js](map-bridge.js)
- Sidebar regression tests in [test/sidebar.test.cjs](test/sidebar.test.cjs)

### Scope and safety

The extension loads on:

- `https://www.komoot.com/tour/<id>/zoom`
- `https://www.komoot.com/tour/<id>/edit`
- including query-string variants

It does not run on other Komoot pages.

The extension is intentionally non-destructive:

- it does not modify the actual route,
- it does not submit or sync trip data,
- dark-red “avoid” markings are a visual warning only, not a routing restriction.

## Install locally

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on Developer mode.
3. Choose Load unpacked and select this repository folder.
4. In Brave, use `brave://extensions`.
5. Open a Komoot planner page and use the extension toolbar button to adjust trail rules.

Suggested defaults highlight S0–S2 and mark S3–S5 as avoid warnings.

## Layer memory

Turn on Remember layer settings in the popup to restore your previous Komoot layer choices, including:

- map type,
- sport-specific map,
- heatmap,
- heatmap sport selection.

The restoration is best-effort and only runs after the layers sheet is available. The code identifies Komoot controls by their specific image sources and labels, and it skips any setting it cannot safely recognise.

## Sidebar state memory

The left sidebar state is stored locally and restored automatically.

- Clicking the sidebar toggle or pressing `H` records the current state.
- On the next planner page, the saved state is restored if the button is still present.
- If Komoot changes the SVG/markup for that toggle, the restoration safely skips it instead of breaking the page.

## Roadmap / what's missing or not working yet

This project is still a lightweight helper, and a few rough edges remain.

### 1. Komoot UI selectors are somewhat brittle

Several parts of the code rely on specific DOM structure, button labels, SVG paths, or image sources. If Komoot updates the planner UI, the layer restore or sidebar restore logic may need small adjustments.

### 2. MapLibre styling is limited by the underlying render model

Komoot renders terrain using MapLibre/WebGL. Ordinary page CSS cannot reliably recolour individual trail pixels, so the extension uses a bridge script to inspect and apply rule-based display changes where possible. This is safer than trying to override route engine behaviour, but it is still a narrow compatibility layer rather than a full graphics rewrite.

### 3. Some settings are intentionally skipped rather than guessed

If a layer option is not confidently detectable, the extension leaves it alone instead of making a risky assumption. That makes the behavior safer, but it also means some edge-case UI changes may not be restored automatically until the selector logic is updated.

### 4. This is still a visual aid, not a route planner

The extension does not:

- block or reroute trails,
- alter Komoot's underlying route generation,
- claim that dark-red levels are excluded from routing.

The “avoid” mode is a warning layer only.

### 5. No broader automated suite yet

The repo currently includes a focused sidebar test file, but the full extension does not have a broad browser automation suite or build pipeline beyond that test. The main validation path is still manual browser testing against real Komoot planner pages.

## Project layout

- [popup.html](popup.html) and [popup.js](popup.js) — rule editor UI
- [settings.js](settings.js) — shared defaults and storage helpers
- [content.js](content.js) — planner logic, legend, layer memory, and styling hooks
- [sidebar.js](sidebar.js) — sidebar open/closed memory
- [map-bridge.js](map-bridge.js) — bridge to MapLibre-style detection and filtering
- [planner.css](planner.css) — panel styling
- [background.js](background.js) — popup-opening message handler
- [manifest.json](manifest.json) — extension permissions and content scripts
- [test/sidebar.test.cjs](test/sidebar.test.cjs) — focused regression test for sidebar behavior

## Testing

Run the sidebar test directly with:

```bash
node --test test/sidebar.test.cjs
```

## Notes

This project is intentionally lightweight and does not require a bundler or build step. Load the folder directly as an unpacked extension in Chromium-based browsers.

## Toggle trail visuals

Use the On/Off switch in the floating MTB panel to disable or enable trail visual changes. The preference is saved; switching off restores the original map filters and colours while keeping the panel, layer memory, and sidebar memory available. Run all tests with `node --test test/`.
