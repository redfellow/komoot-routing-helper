import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(new URL("../hazards.js", import.meta.url), "utf8");
function setup(fetch) {
	const context = { fetch, URLSearchParams, AbortSignal, TextDecoder };
	runInNewContext(source, context);
	return context.KrbHazards;
}
const way = { type: "way", id: 1, nodes: [2], tags: { "mtb:scale": "1", obstacle: "vegetation", width: "0.8" }, geometry: [{ lat: 61, lon: 23 }, { lat: 61.001, lon: 23.001 }] };

test("OSM conditions preserve geometry, physical width and node membership without guessing hiking levels", function () {
	const api = setup();
	const result = api.convert([way, way, { ...way, id: 3, tags: { sac_scale: "hiking", obstacle: "vegetation" } },
		{ type: "node", id: 2, lat: 61, lon: 23, tags: { barrier: "log" } },
		{ type: "node", id: 9, lat: 61, lon: 23, tags: { barrier: "log" } }]);
	assert.equal(result.features.length, 2);
	assert.equal(result.features[0].geometry.coordinates[0][0], 23);
	assert.match(result.features[0].properties.label, /Width: 0.8 m/);
	assert.equal(result.features[1].properties.osmId, "node/2");
	assert.equal(api.convert([{ ...way, geometry: [null, {}] }]).features.length, 0);
	assert.equal(api.convert([{ ...way, tags: { "mtb:scale": "0", obstacle: "no", surface: "dirt", trail_visibility: "bad" } }]).features.length, 0);
});

test("hazard queries validate bounds and cache successful responses", async function () {
	let calls = 0;
	const api = setup(async function (url, options) {
		calls++;
		assert.equal(url, "https://overpass-api.de/api/interpreter");
		assert.match(options.body.get("data"), /mtb:scale/);
		assert.match(options.headers["User-Agent"], /^KomootRoutingBuddy\/.*github.com\/redfellow/);
		assert.equal(options.headers.Accept, "application/json");
		return new Response(JSON.stringify({ elements: [way] }));
	});
	await assert.rejects(api.load([0, 0, 90, 180]), /Zoom in/);
	await assert.rejects(api.load([0, NaN, 1, 1]), /Invalid/);
	assert.equal(calls, 0);
	const a = await api.load([61, 23, 61.01, 23.01]);
	const b = await api.load([61, 23, 61.01, 23.01]);
	assert.equal(a, b);
	assert.equal(calls, 1);
});

test("server failures back off and incomplete responses are not treated as empty coverage", async function () {
	let calls = 0;
	const api = setup(async function () { calls++; return new Response(JSON.stringify({ remark: "timeout", elements: [] })); });
	await assert.rejects(api.load([61, 23, 61.01, 23.01]), /incomplete/);
	await assert.rejects(api.load([61, 23, 61.01, 23.01]), /incomplete/);
	assert.equal(calls, 1);
});

test("hazards and remembered layers default on without replacing saved opt-outs", async function () {
	let saved = {};
	const context = { KrbBrowser: { storage: { sync: { async get() { return saved; } } } } };
	runInNewContext(readFileSync(new URL("../settings.js", import.meta.url), "utf8"), context);
	let options = await context.KrbSettings.getOptions();
	assert.equal(options.showHazards, true);
	assert.equal(options.rememberLayers, true);
	saved = { trailOptions: { showHazards: false, rememberLayers: false } };
	options = await context.KrbSettings.getOptions();
	assert.equal(options.showHazards, false);
	assert.equal(options.rememberLayers, false);
});
