# Trail conditions overlay investigation

Investigated 2026-09-23. Initial prototype now implemented. Show hazards defaults
to enabled per the requested behaviour; saved opt-outs remain respected.
The prototype uses a bounded in-memory cache (not persistent cell caching),
labels and click/tap details in the floater. Local coverage and browser visuals
still require live verification. The sections below record the original proposal.

## Feasibility and scope

Use OSM data from Overpass and render a separate GeoJSON overlay on the existing
MapLibre map. The bridge already discovers that map; it currently edits existing
paint properties but does not own a GeoJSON source. Conditions should be a separate,
opt-in display, independent of whether Komoot's premium MTB layer is selected.
Do not replace the difficulty colours, enlarge base paths, or affect routing.

Coverage and freshness are the main unresolved risks. An absent tag means unknown,
not an obstacle-free trail. OSM is mapped information, not a live vegetation or
weather feed. Display the original tags and an OSM element link on inspection.

## Data interpretation

| Information | Tags to inspect | Interpretation |
| --- | --- | --- |
| Vegetation | `obstacle=vegetation`, `overgrown=*` | Explicit mapped overgrowth; exclude negative values. Retain conditional/seasonal tags as context. |
| Obstacles | `obstacle=*`, `obstacle_description=*`, `barrier=*` | Ways describe affected sections; nodes describe individual obstacles. Start with vegetation, fallen trees and logs; do not label every gate as impassable. |
| Mud | `surface=mud` | Mapped muddy surface, not a prediction of today's conditions. Dirt/earth or nearby wetland is insufficient evidence. |
| Warnings | `hazard=*`, directional hazard tags | Keep the actual category; no invented risk score. Point association must be explicit. |
| Width | `width=*`, `est_width=*` | Physical width; default unit metres. Parse supported units and label estimates. Keep unparseable values as text. Do not confuse `maxwidth` restrictions with physical width. |
| Additional context | `trail_visibility=*`, `smoothness=*`, survey/check-date tags | Useful details, not proof of vegetation. An edit timestamp is not a field survey date. |

OSM's MTB key is **`mtb:scale`**, whereas Komoot tiles use **`mtb_scale`**.
Normalise this explicitly. Do not turn `sac_scale` hiking difficulty into S0–S5.
For the initial scope, use OSM-rated S0–S5 ways and points belonging to their node
lists. This avoids associating an obstacle on a nearby parallel trail or bridge.
Unrated paths can be a later, separately labelled option.

## Acquisition experiment

Run this small, reproducible query in Overpass Turbo for the current viewport:

```overpass
[out:json][timeout:20];
way["highway"~"^(path|track|footway|bridleway|cycleway)$"]({{bbox}})->.trails;
.trails out body geom;
node(w.trails)[~"^(obstacle|overgrown|barrier|hazard|hazard:forward|hazard:backward)$"~"."];
out body;
```

`{{bbox}}` is a Turbo macro. The extension must supply validated numeric
south,west,north,east coordinates. Fetch all candidate paths in a small box first
so coverage can be measured, then filter/normalise locally. Keep node IDs from
ways to associate point obstacles. GeoJSON coordinates are longitude,latitude.
Exclude area polygons and reject missing/partial geometry rather than drawing
spurious connecting lines. Deduplicate using element type plus OSM ID.

Before production, measure rated ways and counts with each requested tag, payload
size, geometry alignment, and point association at the test route and a second
area with known mapped obstacles. Do not use fabricated zero counts if a server
request fails. A first POST request for a public Tampere sample returned HTTP 406;
a bounded GET retry returned HTTP 504. These are acquisition failures, not
evidence of missing tags. No local coverage counts have been established yet.

## Integration proposal

1. `map-bridge.js`: send bounded viewport changes on debounced `moveend`, not
   `idle`/every style mutation. Add owned `krb-conditions-*` sources/layers and
   update GeoJSON with `setData`. Reattach after style replacement and remove on
   disable/map disposal. Explicitly exclude these IDs from the existing broad
   trail renderer selection to prevent recolouring our own condition overlay.
2. `content.js`: relay validated bounds and settings to the extension background;
   relay sanitised GeoJSON back. Use a request generation ID to discard stale
   responses after a pan, navigation or disabling the feature.
3. Background: fetch from one fixed Overpass endpoint with a narrowly scoped host
   permission. Never accept arbitrary page-provided URLs or Overpass query text.
   Validate sender/tab scope, numeric bounds, maximum area, response size and tags.
   Share this logic between Chrome's worker and Firefox's background script.
4. Fetch policy proposed for the prototype: explicit enable, zoom >=14, maximum
   viewport area 25 km², 750 ms debounce, one request in flight, timeout and backoff
   for 429/5xx. Cache bounded cells locally with a size cap and initially 24-hour
   TTL. These are starting parameters to measure, not server guarantees. Do not
   bulk-prefetch areas or rotate public endpoints to evade limits. At meaningful
   adoption, reassess a hosted cache/vector tiles instead of every user querying
   public Overpass independently.
5. UI: separate Vegetation/obstacles, Mud, Warnings and Width controls. Use sparse
   symbols or a subtle condition pattern while preserving S-level colours. Show
   widths as text on inspection initially, not physical screen line thickness.
   Hover and tap should show details without breaking Komoot route editing; this
   event interaction needs live testing. Show loading, zoom-in, unavailable and
   no-mapped-data states separately.
6. Privacy/release: explain that enabled lookups send the viewed bounding box and
   normal request metadata to the provider, without sending the route/account.
   Update README, extension store disclosures and Firefox data declarations as
   appropriate before shipping network functionality. Include OSM attribution and
   a link to its copyright/licence page for the added data.

## Tests before rollout

- Tag fixtures: explicit positives/negatives, multi-values, hiking-vs-MTB scales,
  missing tags, conditional tags, width units/estimates and malformed values.
- Conversion: node membership, parallel trails, partial geometry, duplicate IDs,
  geographic coordinate order and non-S0–S5 exclusions.
- Fetch lifecycle: cache hits, size/area caps, server errors, cancellation, stale
  replies, disabling, rapid pans and browser background restarts.
- Map lifecycle: mode switches, satellite/default styles, zoom, source/layer
  replacement, no recursive styling and no interference with Squadrats or routes.
- Live Chrome/Firefox check: known OSM obstacles align with the correct path;
  map taps, settings and existing visual toggles retain their behaviour.

## Sources

- [OSM obstacle](https://wiki.openstreetmap.org/wiki/Key:obstacle)
- [OSM overgrown](https://wiki.openstreetmap.org/wiki/Key:overgrown)
- [OSM mud](https://wiki.openstreetmap.org/wiki/Tag:surface%3Dmud)
- [OSM hazard](https://wiki.openstreetmap.org/wiki/Key:hazard)
- [OSM width](https://wiki.openstreetmap.org/wiki/Key:width)
- [OSM trail visibility](https://wiki.openstreetmap.org/wiki/Key:trail_visibility)
- [Overpass bounding boxes and geometry](https://dev.overpass-api.de/overpass-doc/en/full_data/bbox.html)
- [Public Overpass resource sharing](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [MapLibre GeoJSON layers](https://maplibre.org/maplibre-gl-js/docs/examples/geojson-line/)
- [Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Firefox content script networking](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)
- [OSM attribution and licence](https://www.openstreetmap.org/copyright)
