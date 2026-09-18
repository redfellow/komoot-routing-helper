(function () {
	const originals = new Map();
	const colours = ["#26a269", "#1c9cc5", "#6c63ff", "#f6a609", "#e66b2e", "#c01c28"];
	let map;
	let config;
	let scheduled;
	let applying = false;
	let searchAttempts = 0;

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

	function apply() {
		if (!map || !config || applying) return;
		applying = true;
		try {
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
				const allowed = ["any", ["==", level, -1], ["<=", level, max]];
				setFilter(layer.id, original.filter ? ["all", original.filter, allowed] : allowed);
				const colour = transformStops(original.paint[colourProperty], function (base) {
					const expression = ["match", level];
					for (let index = 0; index <= 5; index++) {
						const mode = config.rules[`S${index}`];
						const custom = config.colours?.[`S${index}`];
						const colour = /^#[0-9a-f]{6}$/i.test(custom) ? custom : colours[index];
						expression.push(index, mode === "avoid" ? "#7a1016" : mode === "off" ? base : colour);
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
