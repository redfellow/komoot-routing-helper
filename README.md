# Komoot Routing Buddy

A Manifest V3 browser extension that lets Komoot remember your map layer choices. Also puts MTB singletrail-scale rules (S0–S5) beside Komoot's Route Planner. Set a maximum difficulty to display, then choose whether each included level is coloured, marked dark red as an **avoid warning**, or visually de-emphasised.

## Install locally

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Choose **Load unpacked**, then select this folder: `J:\apps\komoot-routing-buddy`.
4. Open Komoot's Route Planner, enable Komoot's MTB layer, and use the extension toolbar button to set rules.

Suggested defaults highlight S0–S2 and warn in dark red for S3–S5.

## Remembering layers

Turn on **Remember layer settings** in the popup to have the extension remember selections in Komoot's **Layers** sheet: Map type, Sport-specific maps, and Heatmaps. It restores them only on a new planner page, and only after the layer sheet is available. The integration identifies controls by their own `map layer` image sources, so the two distinct `None` buttons are preserved correctly. If Komoot changes that UI, a setting it cannot safely identify is skipped.

## Current map integration

The extension styles difficulty-bearing SVG/DOM features exposed by the planner and adds an always-visible legend. Komoot currently paints its terrain in a MapLibre WebGL canvas, so ordinary page CSS cannot recolour individual trail pixels. The next implementation step is a narrowly scoped MapLibre renderer adapter. This keeps the initial extension safe: it never changes your route, submits data, or claims that dark-red paths are excluded from Komoot's routing engine.

## Project layout

- `popup.*` — persistent S0–S5 rule editor
- `content.js` — planner legend, settings listener, and DOM/SVG styling adapter
- `planner.css` — planner panel styles

No build system is required; load the folder directly as an unpacked extension.
