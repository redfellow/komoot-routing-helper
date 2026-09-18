import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../map-bridge.js", import.meta.url), "utf8");

test("disabling restores original map filter and paint; re-enabling reapplies rules", function () {
	const originalFilter = ["==", "type", "mtb"];
	let filter = structuredClone(originalFilter);
	let colour = "#123456";
	const layer = { id: "mtb", type: "line", paint: { "line-color": colour }, metadata: "mtb:scale" };
	const map = {
		_mapId: 1,
		getCanvas() { return {}; },
		getStyle() { return { layers: [layer] }; },
		getLayer() { return layer; },
		getFilter() { return filter; },
		setFilter(id, value) { filter = value; },
		getPaintProperty() { return colour; },
		setPaintProperty(id, key, value) { colour = value; }
	};
	const timers = new Map();
	let nextId = 0;
	let receive;
	const window = { postMessage() {}, addEventListener(type, fn) { receive = fn; } };
	runInNewContext(source, {
		window, location: { origin: "https://www.komoot.com" }, structuredClone,
		document: { contains() { return true; }, querySelectorAll() { return [{ __reactFiber$test: map }]; } },
		setInterval(fn) { timers.set(++nextId, fn); return nextId; },
		clearInterval(id) { timers.delete(id); }
	});
	function tick() { for (const fn of [...timers.values()]) fn(); }
	function configure(enabled) {
		receive({ source: window, data: { type: "KRB_MAP_CONFIG", config: { visualsEnabled: enabled, maximumTrailLevel: "S2", rules: { S3: "avoid" } } } });
		tick();
	}
	tick();
	configure(false);
	assert.deepEqual(filter, originalFilter);
	assert.equal(colour, "#123456");
	configure(true);
	const applied = JSON.stringify({ filter, colour });
	assert.notEqual(JSON.stringify(filter), JSON.stringify(originalFilter));
	assert.ok(JSON.stringify(colour).includes("#7a1016"));
	configure(true);
	assert.equal(JSON.stringify({ filter, colour }), applied);
	configure(false);
	assert.deepEqual(filter, originalFilter);
	assert.equal(colour, "#123456");
	configure(true);
	assert.equal(JSON.stringify({ filter, colour }), applied);
});

test("visuals default to enabled and saved disabled preference survives option loading", async function () {
	let saved = {};
	const context = { chrome: { storage: { sync: { async get() { return saved; } } } } };
	runInNewContext(readFileSync(new URL("../settings.js", import.meta.url), "utf8"), context);
	assert.equal((await context.KrbSettings.getOptions()).visualsEnabled, true);
	saved = { trailOptions: { visualsEnabled: false, rememberLayers: true } };
	const options = await context.KrbSettings.getOptions();
	assert.equal(options.visualsEnabled, false);
	assert.equal(options.rememberLayers, true);
});
