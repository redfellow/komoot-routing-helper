import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../map-bridge.js", import.meta.url), "utf8");
const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function fixture() {
	const original = {
		id: "mtb-trails-easy", type: "line",
		filter: ["all", ["has", "mtb_scale"], ["!=", ["get", "bicycle"], "no"]],
		paint: { "line-color": "#123456", "line-opacity": { stops: [[16, 0.7], [17, 0]] } }
	};
	const layers = [copy(original), { id: "mtb-imba", type: "line", filter: ["has", "mtb_scale_imba"], paint: {} },
		{ id: "mtb-label", type: "symbol", filter: ["has", "mtb_scale"], paint: {} }];
	const timers = [];
	const events = {};
	let interval;
	let receive;
	let writes = 0;
	const canvas = {};
	const map = {
		getCanvas() { return canvas; },
		getStyle() { return { layers }; },
		getLayer(id) { return layers.find((layer) => layer.id === id); },
		getFilter(id) { return this.getLayer(id).filter; },
		setFilter(id, value) { writes++; this.getLayer(id).filter = copy(value); },
		getPaintProperty(id, key) { return this.getLayer(id).paint[key]; },
		setPaintProperty(id, key, value) {
			writes++;
			if (value === null) delete this.getLayer(id).paint[key];
			else this.getLayer(id).paint[key] = copy(value);
		},
		on(name, fn) { events[name] = fn; },
		off(name) { delete events[name]; }
	};
	const fiber = { state: { map } };
	Object.defineProperty(fiber, "unsafe", { get() { throw new Error("Getter invoked"); } });
	canvas.parentElement = { __reactFiber$test: fiber };
	const window = { postMessage() {}, addEventListener(type, fn) { receive = fn; } };
	runInNewContext(source, {
		window, Node: class {}, console, location: { origin: "https://www.komoot.com" }, structuredClone,
		document: { contains(value) { return value === canvas; }, querySelectorAll() { return [canvas]; } },
		setInterval(fn) { interval = fn; },
		setTimeout(fn) { timers.push(fn); return timers.length; }
	});
	function flush() { while (timers.length) timers.shift()(); }
	function configure(overrides = {}, origin = "https://www.komoot.com") {
		receive({ source: window, origin, data: { type: "KRB_MAP_CONFIG", config: {
			visualsEnabled: true, maximumTrailLevel: "S5",
			rules: { S0: "highlight", S1: "avoid", S2: "off", S3: "highlight", S4: "highlight", S5: "highlight" }, ...overrides
		} } });
		flush();
	}
	interval(); flush();
	return { layers, original, configure, writes: () => writes, restyle() { events.styledata(); flush(); } };
}

function evaluate(expression, properties) {
	if (!Array.isArray(expression)) return expression;
	const [operator, ...args] = expression;
	const ev = (value) => evaluate(value, properties);
	switch (operator) {
		case "get": return properties[args[0]];
		case "has": return args[0] in properties;
		case "to-string": return String(ev(args[0]));
		case "match": {
			const input = ev(args[0]);
			for (let i = 1; i < args.length - 1; i += 2) {
				if (Array.isArray(args[i]) ? args[i].includes(input) : args[i] === input) return ev(args[i + 1]);
			}
			return ev(args.at(-1));
		}
		case "*": return ev(args[0]) * ev(args[1]);
		case "==": return ev(args[0]) === ev(args[1]);
		case "!=": return ev(args[0]) !== ev(args[1]);
		case "<=": return ev(args[0]) <= ev(args[1]);
		case "all": return args.every(ev);
		case "any": return args.some(ev);
		default: throw new Error(`Unsupported expression: ${operator}`);
	}
}

test("real mtb_scale values select highlight, warning and dimming without touching IMBA", function () {
	const f = fixture(); f.configure();
	const paint = f.layers[0].paint;
	for (const value of [0, "0", "0+", "0-", "S0"]) {
		assert.equal(evaluate(paint["line-color"], { mtb_scale: value }), "#26a269");
	}
	assert.equal(evaluate(paint["line-color"], { mtb_scale: "1+" }), "#7a1016");
	assert.equal(evaluate(paint["line-color"], { mtb_scale: "2" }), "#123456");
	const opacity = paint["line-opacity"];
	assert.deepEqual(opacity.slice(0, 4), ["interpolate", ["exponential", 1], ["zoom"], 16]);
	assert.ok(Math.abs(evaluate(opacity[4], { mtb_scale: "2" }) - 0.14) < 1e-10);
	assert.equal(evaluate(opacity[6], { mtb_scale: "0" }), 0);
	assert.deepEqual(f.layers[1].paint, {});
	assert.match(evaluate(f.layers[2].paint["text-color"], { mtb_scale: "0" }), /^#[0-9a-f]{6}$/);
});

test("maximum difficulty preserves native access restrictions and unknown values", function () {
	const f = fixture(); f.configure({ maximumTrailLevel: "S1" });
	const filter = f.layers[0].filter;
	assert.equal(evaluate(filter, { mtb_scale: "1-" }), true);
	assert.equal(evaluate(filter, { mtb_scale: "2" }), false);
	assert.equal(evaluate(filter, { mtb_scale: "0", bicycle: "no" }), false);
	assert.equal(evaluate(filter, { mtb_scale: "unknown" }), true);
});

test("Off restores original filters and paint including absent properties; repeated apply is stable", function () {
	const f = fixture(); f.configure();
	const applied = copy(f.layers);
	const writes = f.writes();
	f.configure(); f.restyle();
	assert.equal(f.writes(), writes);
	f.configure({ visualsEnabled: false });
	assert.deepEqual(f.layers[0], f.original);
	assert.deepEqual(f.layers[2].paint, {});
	f.configure();
	assert.deepEqual(f.layers, applied);
});

test("replacement style layers get new rules and restore their own original paint", function () {
	const f = fixture(); f.configure();
	const replacement = copy(f.original);
	replacement.paint["line-color"] = "#abcdef";
	f.layers[0] = copy(replacement); f.restyle();
	assert.equal(evaluate(f.layers[0].paint["line-color"], { mtb_scale: "0" }), "#26a269");
	f.configure({ visualsEnabled: false });
	assert.deepEqual(f.layers[0], replacement);
});

test("foreign-origin configuration is ignored", function () {
	const f = fixture(); f.configure({}, "https://example.com");
	assert.equal(f.writes(), 0);
});

test("visuals default to enabled and saved disabled preference survives option loading", async function () {
	let saved = {};
	const context = { KrbBrowser: { storage: { sync: { async get() { return saved; } } } } };
	runInNewContext(readFileSync(new URL("../settings.js", import.meta.url), "utf8"), context);
	assert.equal((await context.KrbSettings.getOptions()).visualsEnabled, true);
	saved = { trailOptions: { visualsEnabled: false, rememberLayers: true } };
	const options = await context.KrbSettings.getOptions();
	assert.equal(options.visualsEnabled, false);
	assert.equal(options.rememberLayers, true);
});

test("custom colours update live strokes and labels while avoid keeps its warning colour", function () {
	const f = fixture();
	f.configure({ colours: { S0: "#abcdef", S1: "#ffffff" } });
	assert.equal(evaluate(f.layers[0].paint["line-color"], { mtb_scale: "0" }), "#abcdef");
	assert.equal(evaluate(f.layers[2].paint["text-color"], { mtb_scale: "0" }), "#abcdef");
	assert.equal(evaluate(f.layers[0].paint["line-color"], { mtb_scale: "1" }), "#7a1016");
	f.configure({ colours: { S0: "#123abc" } });
	assert.equal(evaluate(f.layers[0].paint["line-color"], { mtb_scale: "0" }), "#123abc");
	f.configure({ colours: { S0: "invalid" } });
	assert.equal(evaluate(f.layers[0].paint["line-color"], { mtb_scale: "0" }), "#26a269");
	f.configure({ visualsEnabled: false });
	assert.deepEqual(f.layers[0], f.original);
});

test("saved colours merge with defaults and invalid values fall back safely", async function () {
	let saved = {};
	const context = { KrbBrowser: { storage: { sync: { async get() { return saved; } } } } };
	runInNewContext(readFileSync(new URL("../settings.js", import.meta.url), "utf8"), context);
	assert.deepEqual(copy(await context.KrbSettings.getColours()), copy(context.KrbSettings.HIGHLIGHT_COLOURS));
	saved = { trailColours: { S0: "#ABCDEF", S1: "red", S2: null } };
	const colours = await context.KrbSettings.getColours();
	assert.equal(colours.S0, "#ABCDEF");
	assert.equal(colours.S1, "#1c9cc5");
	assert.equal(colours.S2, "#6c63ff");
	assert.equal(colours.S5, "#c01c28");
});


test("labels contrast with their halo while line colours remain unchanged; Off restores halo", function () {
	const f = fixture();
	const originalPaint = { "text-halo-color": "#eeeeee", "text-halo-width": 0.5, "text-halo-blur": 0.2 };
	Object.assign(f.layers[2].paint, originalPaint);
	for (const colour of ["#ffffff", "#ffff00", "#26a269", "#7a1016", "#000000"]) {
		f.configure({ colours: { S0: colour } });
		const properties = { mtb_scale: "0" };
		const paint = f.layers[2].paint;
		const text = evaluate(paint["text-color"], properties);
		const rgb = [1, 3, 5].map(function (offset) {
			const c = parseInt(text.slice(offset, offset + 2), 16) / 255;
			return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		assert.ok((0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + 0.05) / 0.05 >= 7);
		for (const offset of [1, 3, 5]) {
			assert.ok(parseInt(text.slice(offset, offset + 2), 16) >= parseInt(colour.slice(offset, offset + 2), 16));
		}
		if (colour === "#7a1016") {
			assert.notEqual(text, colour);
			assert.ok(parseInt(text.slice(1, 3), 16) > parseInt(text.slice(3, 5), 16));
		}
		assert.notEqual(evaluate(paint["text-color"], { mtb_scale: "1" }), "#7a1016");
		assert.equal(evaluate(paint["text-halo-color"], properties), "#000000");
		assert.equal(evaluate(paint["text-halo-width"], properties), 0.5);
		assert.equal(evaluate(f.layers[0].paint["line-color"], properties), colour);
		assert.equal(evaluate(paint["text-halo-width"], { mtb_scale: "2" }), 0.5);
		assert.equal(evaluate(paint["text-halo-width"], { mtb_scale: "unknown" }), 0.5);
	}
	f.configure({ visualsEnabled: false });
	assert.deepEqual(f.layers[2].paint, originalPaint);
});
