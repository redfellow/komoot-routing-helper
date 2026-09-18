(() => {
  const originals = new Map();
  let map;
  let config;
  let retryTimer;

  const isMapLibre = (value) => Boolean(value && value._mapId && typeof value.getLayer === "function" && typeof value.getStyle === "function");
  const reserved = new Set(["self", "parent", "window", "globalThis", "top", "frames", "prototype", "constructor", "caller", "callee", "arguments", "localStorage"]);
  function findMapIn(value, limit = 5000) {
    const seen = new Set(); const queue = [value]; let visited = 0;
    while (queue.length && visited++ < limit) {
      const item = queue.shift();
      if (!item || seen.has(item)) continue;
      if (isMapLibre(item) && document.contains(item.getCanvas())) return item;
      seen.add(item);
      try { for (const key of Object.getOwnPropertyNames(item)) if (!reserved.has(key)) queue.push(item[key]); } catch (error) { if (error.name !== "SecurityError") throw error; }
    }
    return null;
  }
  function findMap() {
    for (const element of document.querySelectorAll("*")) {
      for (const key of Object.getOwnPropertyNames(element)) {
        if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactInternalInstance$")) continue;
        const found = findMapIn(element[key]);
        if (found) return found;
      }
    }
    return null;
  }
  function mtbLayers() {
    return (map?.getStyle()?.layers || []).filter((layer) => /mtb|singletrail|trail.?scale|difficulty/i.test(JSON.stringify(layer)) && (layer.type === "line" || layer.type === "fill"));
  }
  function difficultyProperty(layers) {
    const candidates = ["mtb:scale", "mtb_scale", "mtbScale", "trail_difficulty", "difficulty"];
    const text = JSON.stringify(layers);
    return candidates.find((key) => text.includes(key)) || candidates.find((key) => {
      try { return map.queryRenderedFeatures({ layers: layers.map((layer) => layer.id) }).some((feature) => key in feature.properties); } catch { return false; }
    });
  }
  function apply() {
    if (!map || !config) return false;
		if (config.visualsEnabled === false) {
			for (const [id, original] of originals) {
				if (!map.getLayer(id)) continue;
				map.setFilter(id, original.filter ?? null);
				map.setPaintProperty(id, original.colourProperty, original.colour ?? null);
			}
			originals.clear();
			postStatus({ ready: true, enabled: false });
			return true;
		}
    const layers = mtbLayers(); const property = difficultyProperty(layers);
    if (!layers.length || !property) { postStatus({ ready: true, layers: layers.map((x) => x.id), property: null }); return false; }
    const max = Number(config.maximumTrailLevel.slice(1));
    const allowed = Array.from({ length: max + 1 }, (_, index) => `S${index}`);
    for (const layer of layers) {
			const colourProperty = layer.type === "line" ? "line-color" : "fill-color";
			if (!originals.has(layer.id)) originals.set(layer.id, {
				filter: structuredClone(map.getFilter(layer.id)),
				colourProperty,
				colour: structuredClone(map.getPaintProperty(layer.id, colourProperty))
			});
      const original = originals.get(layer.id).filter;
      map.setFilter(layer.id, original ? ["all", original, ["in", property, ...allowed]] : ["in", property, ...allowed]);
      const avoid = Object.entries(config.rules || {}).filter(([, mode]) => mode === "avoid").map(([level]) => level);
      if (avoid.length && map.getLayer(layer.id)?.paint?.[colourProperty] !== undefined) {
        map.setPaintProperty(layer.id, colourProperty, ["match", ["get", property], ...avoid.flatMap((level) => [level, "#7a1016"]), originals.get(layer.id).colour]);
      }
			else {
				map.setPaintProperty(layer.id, colourProperty, originals.get(layer.id).colour ?? null);
			}
    }
    postStatus({ ready: true, layers: layers.map((x) => x.id), property });
    return true;
  }
  function postStatus(detail) { window.postMessage({ type: "KRB_MAP_STATUS", detail }, location.origin); }
  function startApplyRetry() {
    clearInterval(retryTimer);
    retryTimer = setInterval(() => { if (apply()) clearInterval(retryTimer); }, 600);
  }
  window.addEventListener("message", (event) => { if (event.source === window && event.data?.type === "KRB_MAP_CONFIG") { config = event.data.config; startApplyRetry(); } });
  const finder = setInterval(() => { if (!map) map = findMap(); if (map) { clearInterval(finder); postStatus({ ready: true }); startApplyRetry(); } }, 500);
})();
