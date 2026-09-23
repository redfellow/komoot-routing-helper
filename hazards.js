// Shared background-side OSM acquisition and normalisation.
(function () {
	const cache = new Map();
	let active;
	let retryAfter = 0;
	let lastError = "OSM service unavailable";
	function boundsKey(bounds) {
		if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) throw new Error("Invalid map bounds");
		const [south, west, north, east] = bounds;
		const area = (north - south) * 111 * (east - west) * 111 * Math.cos((north + south) * Math.PI / 360);
		if (south < -85 || north > 85 || west < -180 || east > 180 || south >= north || west >= east || area > 25) throw new Error("Zoom in to show hazards");
		return bounds.map((value) => value.toFixed(4)).join(",");
	}
	function describe(tags) {
		const notes = [];
		for (const key of ["obstacle", "overgrown", "barrier", "hazard", "hazard:forward", "hazard:backward"]) {
			if (tags[key] && !["no", "none", "false"].includes(tags[key])) notes.push(`${key}: ${tags[key]}`);
		}
		if (tags.surface === "mud") notes.push("Muddy surface");
		if (tags.width) notes.push(`Width: ${tags.width}${/^\d+(\.\d+)?$/.test(tags.width) ? " m" : ""}`);
		else if (tags.est_width) notes.push(`Estimated width: ${tags.est_width}`);
		return notes.join(" · ").slice(0, 400);
	}
	function convert(elements) {
		const features = [];
		const nodes = new Set();
		const seen = new Set();
		for (const way of elements) {
			if (way.type !== "way" || !/^[0-5][+-]?$/.test(way.tags?.["mtb:scale"] || "") || way.tags?.area === "yes") continue;
			for (const id of way.nodes || []) nodes.add(id);
			const label = describe(way.tags);
			if (!label || !Array.isArray(way.geometry) || way.geometry.length < 2 || way.geometry.some((p) => !Number.isFinite(p?.lat) || !Number.isFinite(p?.lon))) continue;
			add(way, { type: "LineString", coordinates: way.geometry.map((p) => [p.lon, p.lat]) }, label);
		}
		for (const node of elements) {
			if (node.type !== "node" || !nodes.has(node.id) || !Number.isFinite(node.lat) || !Number.isFinite(node.lon)) continue;
			const label = describe(node.tags || {});
			if (label) add(node, { type: "Point", coordinates: [node.lon, node.lat] }, label);
		}
		function add(element, geometry, label) {
			const id = `${element.type}/${element.id}`;
			if (seen.has(id)) return;
			seen.add(id);
			features.push({ type: "Feature", id, properties: { label, osmId: id }, geometry });
		}
		return { type: "FeatureCollection", features };
	}
	async function load(bounds) {
		const key = boundsKey(bounds);
		const hit = cache.get(key);
		if (hit && Date.now() - hit.time < 86400000) return hit.data;
		if (active) {
			if (active.key === key) return active.promise;
			throw new Error("Hazards loading; try again shortly");
		}
		if (Date.now() < retryAfter) throw Object.assign(new Error(lastError), { retryMs: retryAfter - Date.now() });
		const promise = fetchData(key);
		active = { key, promise };
		try { return await promise; }
		finally { active = undefined; }
	}
	async function fetchData(key) {
		const query = `[out:json][timeout:20];way["highway"~"^(path|track|footway|bridleway|cycleway)$"]["mtb:scale"~"^[0-5][+-]?$"](${key})->.trails;.trails out body geom;node(w.trails)[~"^(obstacle|overgrown|barrier|hazard|hazard:forward|hazard:backward)$"~"."];out body;`;
		try {
			const response = await fetch("https://overpass-api.de/api/interpreter", {
				headers: { "Accept": "application/json", "User-Agent": `KomootRoutingBuddy/${globalThis.KrbBrowser?.runtime.getManifest?.().version || "development"} (+https://github.com/redfellow/komoot-routing-helper)` },
				method: "POST", body: new URLSearchParams({ data: query }), credentials: "omit", signal: AbortSignal.timeout(25000)
			});
			if (!response.ok) throw new Error(`OSM service returned ${response.status}`);
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let text = "";
			let bytes = 0;
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				bytes += value.byteLength;
				if (bytes > 5000000) { await reader.cancel(); throw new Error("Too much OSM data; zoom in"); }
				text += decoder.decode(value, { stream: true });
			}
			const json = JSON.parse(text + decoder.decode());
			if (json.remark || !Array.isArray(json.elements)) throw new Error("OSM returned incomplete data");
			const data = convert(json.elements);
			cache.set(key, { time: Date.now(), data });
			while (cache.size > 12) cache.delete(cache.keys().next().value);
			return data;
		}
		catch (error) {
			lastError = error.name === "TimeoutError" ? "OSM request timed out" : error.message;
			retryAfter = Date.now() + 30000;
			throw Object.assign(new Error(lastError), { retryMs: 30000 });
		}
	}
	globalThis.KrbHazards = { load, convert, boundsKey };
})();
