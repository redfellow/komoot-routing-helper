(function () {
	const originals = new Map();
	const squadratsOriginals = new Map();
	const colours = ["#26a269", "#1c9cc5", "#6c63ff", "#f6a609", "#e66b2e", "#c01c28"];
	let map;
	let config;
	let scheduled;
	let applying = false;
	let searchAttempts = 0;

	// Contrast is measured against a controlled black halo, not unpredictable map pixels.
	function labelColour(hex) {
		const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
		function contrast(rgb) {
			const linear = rgb.map(function (channel) {
				const value = channel / 255;
				return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
			});
			return (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] + 0.05) / 0.05;
		}
		let adjusted = channels;
		// Mix toward white to brighten dark colours while retaining their colour family.
		while (contrast(adjusted) < 7) adjusted = adjusted.map((channel) => Math.ceil(channel + (255 - channel) * 0.05));
		return "#" + adjusted.map((channel) => channel.toString(16).padStart(2, "0")).join("");
	}

	function isMap(value) {
		return value && typeof value.getStyle === "function" && typeof value.getCanvas === "function" &&
			typeof value.setPaintProperty === "function" && document.contains(value.getCanvas());
	}

	function findMap() {
		const queue = [];
		for (const canvas of document.querySelectorAll("canvas.maplibregl-canvas, canvas.mapboxgl-canvas")) {
			for (let element = canvas; element; element = element.parentElement) {
				for (const key of Object.getOwnPropertyNames(element)) {
					if (key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")) queue.push(element[key]);
				}
			}
		}
		const seen = new Set();
		for (let index = 0; index < queue.length && index < 100000; index++) {
			const value = queue[index];
			if (!value || typeof value !== "object" || seen.has(value) || value instanceof Node || value === window) continue;
			seen.add(value);
			if (isMap(value)) return value;
			// Read data descriptors only: never invoke arbitrary React/browser getters.
			for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
				if (descriptor.value && typeof descriptor.value === "object" && queue.length < 100000) queue.push(descriptor.value);
			}
		}
		return null;
	}

	function levelExpression() {
		const value = ["to-string", ["get", "mtb_scale"]];
		const expression = ["match", value];
		for (let level = 0; level <= 5; level++) {
			expression.push([String(level), `${level}+`, `${level}-`, `S${level}`, `s${level}`], level);
		}
		expression.push(-1);
		return expression;
	}

	// Keep zoom at the top level, as required by MapLibre's expression grammar.
	function transformStops(value, transform, fallback) {
		if (value && !Array.isArray(value) && Array.isArray(value.stops) && !value.property) {
			const result = ["interpolate", ["exponential", value.base ?? 1], ["zoom"]];
			for (const [zoom, output] of value.stops) result.push(zoom, transform(output));
			return result;
		}
		if (Array.isArray(value) && value[0] === "interpolate" && value[2]?.[0] === "zoom") {
			return value.map((entry, index) => index >= 4 && index % 2 === 0 ? transform(entry) : entry);
		}
		if (Array.isArray(value) && value[0] === "step" && value[1]?.[0] === "zoom") {
			return value.map((entry, index) => index >= 2 && index % 2 === 0 ? transform(entry) : entry);
		}
		return transform(value ?? fallback);
	}

	function same(left, right) {
		return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
	}

	function setFilter(id, value) {
		if (!same(map.getFilter(id), value)) map.setFilter(id, value ?? null);
	}

	function setPaint(id, property, value) {
		if (!same(map.getPaintProperty(id, property), value)) map.setPaintProperty(id, property, value ?? null);
	}

	function restore() {
		for (const [id, original] of originals) {
			if (map.getLayer(id) !== original.layer) continue;
			setFilter(id, original.filter);
			for (const [property, value] of Object.entries(original.paint)) setPaint(id, property, value);
		}
		originals.clear();
	}

	function applySquadrats() {
		const percent = Number.isFinite(config.squadratsOpacity) ? Math.max(0, Math.min(100, config.squadratsOpacity)) : 100;
		const sources = new Set(["squadrats-source", "squadrats-new-squadrats", "squadrats-new-squadratinhos", "squadrats-grid", "squadrats-gridinho"]);
		const layers = (map.getStyle()?.layers || []).filter((layer) =>
			layer.id.startsWith("squadrats-") && sources.has(layer.source) && ["fill", "line"].includes(layer.type));
		const ids = new Set(layers.map((layer) => layer.id));
		for (const id of squadratsOriginals.keys()) if (!ids.has(id)) squadratsOriginals.delete(id);
		for (const layer of layers) {
			const property = `${layer.type}-opacity`;
			const live = map.getLayer(layer.id);
			const current = map.getPaintProperty(layer.id, property);
			let original = squadratsOriginals.get(layer.id);
			if (!original || original.layer !== live || !same(current, original.applied)) {
				original = { layer: live, value: structuredClone(current), applied: structuredClone(current) };
				squadratsOriginals.set(layer.id, original);
			}
			const value = percent === 100 ? original.value : transformStops(original.value, (base) => ["*", base, percent / 100], 1);
			setPaint(layer.id, property, value);
			original.applied = structuredClone(value);
		}
	}

	function apply() {
		if (!map || !config || applying) return;
		applying = true;
		try {
			applySquadrats();
			if (config.visualsEnabled === false) {
				restore();
				postStatus({ ready: true, enabled: false });
				return;
			}
			const layers = (map.getStyle()?.layers || []).filter((layer) =>
				/mtb/i.test(layer.id) && ["line", "symbol"].includes(layer.type) &&
				JSON.stringify([layer.filter, layer.layout]).includes('"mtb_scale"'));
			const level = levelExpression();
			const max = Number(config.maximumTrailLevel.slice(1));
			const applied = [];
			for (const layer of layers) {
				const liveLayer = map.getLayer(layer.id);
				const colourProperty = layer.type === "line" ? "line-color" : "text-color";
				const opacityProperty = layer.type === "line" ? "line-opacity" : "text-opacity";
				if (!originals.has(layer.id) || originals.get(layer.id).layer !== liveLayer) {
					originals.set(layer.id, {
						layer: liveLayer,
						filter: structuredClone(map.getFilter(layer.id)),
						paint: {
							[colourProperty]: structuredClone(map.getPaintProperty(layer.id, colourProperty)),
							[opacityProperty]: structuredClone(map.getPaintProperty(layer.id, opacityProperty))
						}
					});
				}
				const original = originals.get(layer.id);
				if (layer.type === "symbol" && !("text-halo-color" in original.paint)) {
					for (const property of ["text-halo-color", "text-halo-width", "text-halo-blur"]) {
						original.paint[property] = structuredClone(map.getPaintProperty(layer.id, property));
					}
				}
				const allowed = ["any", ["==", level, -1], ["<=", level, max]];
				setFilter(layer.id, original.filter ? ["all", original.filter, allowed] : allowed);
				const colour = transformStops(original.paint[colourProperty], function (base) {
					const expression = ["match", level];
					for (let index = 0; index <= 5; index++) {
						const mode = config.rules[`S${index}`];
						const custom = config.colours?.[`S${index}`];
						const colour = /^#[0-9a-f]{6}$/i.test(custom) ? custom : colours[index];
						const selected = mode === "avoid" ? "#7a1016" : colour;
						expression.push(index, mode === "off" ? base : layer.type === "symbol" ? labelColour(selected) : selected);
					}
					expression.push(base);
					return expression;
				}, "#000000");
				const opacity = transformStops(original.paint[opacityProperty], function (base) {
					const expression = ["match", level];
					for (let index = 0; index <= 5; index++) expression.push(index, config.rules[`S${index}`] === "off" ? 0.2 : 1);
					expression.push(1);
					return ["*", base, expression];
				}, 1);
				setPaint(layer.id, colourProperty, colour);
				setPaint(layer.id, opacityProperty, opacity);
				if (layer.type === "symbol") {
					for (const [property, value, fallback] of [
						["text-halo-color", "#000000", "rgba(0,0,0,0)"],
						["text-halo-width", 0.5, 0],
						["text-halo-blur", 0, 0]
					]) {
						setPaint(layer.id, property, transformStops(original.paint[property], function (base) {
							const expression = ["match", level];
							for (let index = 0; index <= 5; index++) expression.push(index, config.rules[`S${index}`] === "off" ? base : value);
							expression.push(base);
							return expression;
						}, fallback));
					}
				}
				applied.push(layer.id);
			}
			postStatus({ ready: true, enabled: true, layers: applied });
		}
		catch (error) {
			console.error("Routing Buddy map styling failed:", error);
			postStatus({ ready: true, error: error.message });
		}
		finally {
			applying = false;
		}
	}

	function postStatus(detail) {
		window.postMessage({ type: "KRB_MAP_STATUS", detail }, location.origin);
	}

	function scheduleApply() {
		if (applying || scheduled) return;
		scheduled = setTimeout(function () { scheduled = undefined; apply(); }, 50);
	}

	window.addEventListener("message", function (event) {
		if (event.source !== window || event.origin !== location.origin || event.data?.type !== "KRB_MAP_CONFIG") return;
		const incoming = event.data.config;
		if (!incoming || !/^S[0-5]$/.test(incoming.maximumTrailLevel) || !incoming.rules) return;
		config = incoming;
		searchAttempts = 0;
		scheduleApply();
	});

	setInterval(function () {
		if (map && !document.contains(map.getCanvas())) {
			map.off("styledata", scheduleApply);
			map.off("idle", scheduleApply);
			map = undefined;
			originals.clear();
			squadratsOriginals.clear();
			searchAttempts = 0;
		}
		if (map || ++searchAttempts > 30) return;
		const found = findMap();
		if (!found) return;
		map = found;
		map.on("styledata", scheduleApply);
		map.on("idle", scheduleApply);
		postStatus({ ready: true });
		scheduleApply();
	}, 1000);
})();
