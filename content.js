(() => {
	if (!/^\/tour\/[^/]+\/(zoom|edit)$/.test(location.pathname)) return;
const contentSettings = globalThis.KrbSettings;

const AVOID_COLOUR = "#7a1016";
const STYLE_ID = "krb-trail-style";
let restoreTimer;
let layersRestoredThisLoad = false;
let restoringLayers = false;

function installMapBridge() {
  if (document.querySelector("#krb-map-bridge")) return;
  const script = document.createElement("script");
  script.id = "krb-map-bridge";
  script.src = chrome.runtime.getURL("map-bridge.js");
  script.addEventListener("load", () => refresh(false));
  (document.head || document.documentElement).append(script);
}

function sendMapConfig(rules, options, colours) {
  window.postMessage({ type: "KRB_MAP_CONFIG", config: { rules, colours, visualsEnabled: options.visualsEnabled !== false, maximumTrailLevel: options.maximumTrailLevel } }, location.origin);
}

function createPanel() {
  if (document.querySelector("#krb-panel")) return;
  const panel = document.createElement("details");
  panel.id = "krb-panel";
  panel.open = true;
  panel.innerHTML = `<summary><span class="krb-title"></span><button type="button" class="krb-panel__toggle" role="switch" aria-checked="true" aria-label="Trail visual changes" title="Toggle trail visual changes">On</button><button type="button" class="krb-panel__settings" aria-label="Open Routing Buddy settings" title="Open settings">⚙</button><span class="krb-caret">⌃</span></summary><div class="krb-legend"></div>`;
  document.documentElement.append(panel);
	setupPanelControls(panel);
}

function setupPanelControls(panel) {
	const header = panel.querySelector("summary");
	const settings = panel.querySelector(".krb-panel__settings");
	const toggle = panel.querySelector(".krb-panel__toggle");
	toggle.addEventListener("click", async function (event) {
		event.preventDefault();
		event.stopPropagation();
		toggle.disabled = true;
		try {
			const options = await contentSettings.getOptions();
			await chrome.storage.sync.set({ trailOptions: { ...options, visualsEnabled: options.visualsEnabled === false } });
			await refresh(false);
		}
		catch (error) {
			console.error("Routing Buddy could not toggle visuals:", error);
		}
		finally {
			toggle.disabled = false;
		}
	});
	let drag;
	let suppressClick = false;

	function movePanel(left, top) {
		panel.style.right = "auto";
		panel.style.left = `${Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth))}px`;
		panel.style.top = `${Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight))}px`;
	}

	header.addEventListener("pointerdown", function (event) {
		if (event.button !== 0 || event.target.closest("button")) return;
		const rect = panel.getBoundingClientRect();
		suppressClick = false;
		drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
		header.setPointerCapture(event.pointerId);
	});
	header.addEventListener("pointermove", function (event) {
		if (!drag || drag.id !== event.pointerId) return;
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		if (!suppressClick && Math.hypot(dx, dy) < 5) return;
		suppressClick = true;
		movePanel(drag.left + dx, drag.top + dy);
	});
	function finishDrag() {
		drag = undefined;
	}
	header.addEventListener("pointerup", finishDrag);
	header.addEventListener("pointercancel", finishDrag);
	header.addEventListener("lostpointercapture", finishDrag);
	header.addEventListener("click", function (event) {
		if (suppressClick && event.detail !== 0) {
			event.preventDefault();
			suppressClick = false;
		}
	});
	window.addEventListener("resize", function () {
		const rect = panel.getBoundingClientRect();
		movePanel(rect.left, rect.top);
	});
	panel.addEventListener("toggle", function () {
		const rect = panel.getBoundingClientRect();
		movePanel(rect.left, rect.top);
	});
	settings.addEventListener("click", async function (event) {
		event.preventDefault();
		event.stopPropagation();
		try {
			const result = await chrome.runtime.sendMessage({ type: "KRB_OPEN_SETTINGS" });
			if (!result?.ok) throw new Error(result?.error || "Could not open settings");
			settings.title = "Open settings";
		}
		catch (error) {
			console.error("Routing Buddy settings:", error);
			settings.title = "Could not open settings. Try the extension toolbar icon.";
		}
	});
}

function difficultySelector(level) {
  const lower = level.toLowerCase();
  return [
    `[data-mtb-difficulty="${level}"]`, `[data-mtb-difficulty="${lower}"]`,
    `[data-trail-difficulty="${level}"]`, `[data-trail-difficulty="${lower}"]`,
    `[data-sac-scale="${level}"]`,
    `[class~="mtb-${lower}"]`, `[class~="difficulty-${lower}"]`, `[class~="${lower}"]`
  ].join(", ");
}

function applyTrailStyles(rules, maximumTrailLevel) {
  let css = "";
  for (const level of contentSettings.LEVELS) {
    const selector = difficultySelector(level);
    const rule = contentSettings.LEVELS.indexOf(level) > contentSettings.LEVELS.indexOf(maximumTrailLevel) ? "off" : rules[level];
    if (rule === "off") css += `${selector}{opacity:.2 !important;}`;
    else {
      const colour = rule === "avoid" ? AVOID_COLOUR : contentSettings.HIGHLIGHT_COLOURS[level];
      css += `${selector}{stroke:${colour} !important;fill:${colour} !important;color:${colour} !important;opacity:1 !important;}`;
    }
  }
  // MapLibre renders Komoot trail pixels in WebGL; CSS cannot alter them.
  // The page-world bridge applies the equivalent rules to MapLibre layers.
}

function renderLegend(rules, maximumTrailLevel, colours) {
  const legend = document.querySelector("#krb-panel .krb-legend");
  if (!legend) return;
  legend.replaceChildren(...contentSettings.LEVELS.map((level) => {
    const mode = contentSettings.LEVELS.indexOf(level) > contentSettings.LEVELS.indexOf(maximumTrailLevel) ? "off" : rules[level];
    const item = document.createElement("div");
    item.className = `krb-level ${mode === "off" ? "krb-muted" : ""} ${mode === "avoid" ? "krb-avoid" : ""}`;
    const dot = document.createElement("span");
    dot.className = "krb-dot";
    dot.style.background = mode === "avoid" ? AVOID_COLOUR : colours[level];
    item.append(dot, document.createTextNode(level));
    return item;
  }));
}

function layerKind(element) {
  const imageSource = element.querySelector('img[alt="map layer"]')?.getAttribute("src") || "";
  if (imageSource.includes("baselayer-")) return "mapType";
  if (imageSource.includes("overlay-komoot-sport-specific-")) return "sportMap";
  if (imageSource.includes("heatmap-")) return "heatmap";
  return null;
}

function layerLabel(element) {
  return element.getAttribute("aria-label") || element.textContent?.trim() || "";
}

const HEATMAP_SPORTS = ["All sports", "All foot sports", "Hiking", "Running", "All riding sports", "Cycling", "Mountain biking", "Road cycling", "Gravel riding"];

async function rememberHeatmapSport(event) {
  if (restoringLayers || !document.body.innerText.includes("Heatmap settings")) return;
  let node = event.target;
  while (node && node !== document.body) {
    const label = node.textContent?.trim();
    if (HEATMAP_SPORTS.includes(label)) {
      const options = await contentSettings.getOptions();
      if (options.rememberLayers) await chrome.storage.sync.set({
        trailOptions: { ...options, rememberedLayers: { ...options.rememberedLayers, heatmapSport: label } }
      });
      return;
    }
    node = node.parentElement;
  }
}

async function rememberLayerClick(event) {
  if (restoringLayers) return;
  const element = event.target.closest("button, [role=menuitem], [role=option], label");
  if (!element || element.closest("#krb-panel")) return;
  const kind = layerKind(element);
  const label = layerLabel(element);
  if (!kind || !label || label === "Layers") return;
  const options = await contentSettings.getOptions();
  if (!options.rememberLayers) return;
  await chrome.storage.sync.set({
    trailOptions: { ...options, rememberedLayers: { ...options.rememberedLayers, [kind]: label } }
  });
}

function findLayerMenuOpener() {
  const dataControlButton = document.querySelector("[data-control-layers-button] button");
  if (dataControlButton) return dataControlButton;
  return [...document.querySelectorAll("button")].find((element) =>
    element.querySelector('img[alt="map layer"]') && /layers/i.test(element.textContent || "")
  );
}

function findLayerOption(kind, label) {
  return [...document.querySelectorAll('button[aria-label]')].find((element) =>
    layerKind(element) === kind && layerLabel(element) === label
  );
}

function findHeatmapSport(label) {
  return [...document.querySelectorAll("p")].find((element) => element.textContent?.trim() === label);
}

function heatmapSportIsSelected(label) {
  let row = findHeatmapSport(label);
  // The radio is a sibling of the label block, four wrappers above the <p> in Komoot's sheet.
  for (let depth = 0; row && depth < 5; depth += 1, row = row.parentElement) {
    if (row.querySelector(':scope input[type="radio"]:checked')) return true;
  }
  return false;
}

function hideRestorationSheets() {
	const hidden = new Set();
	function hideSheets() {
		for (const heading of document.querySelectorAll("p")) {
			if (!["Customize map", "Heatmap settings"].includes(heading.textContent?.trim())) continue;
			let sheet = heading.parentElement;
			while (sheet && sheet !== document.body && sheet !== document.documentElement) {
				// Stop before the map or application root; hide only the sheet containing its controls.
				if (sheet.querySelector("canvas")) break;
				if (sheet.querySelector('button[aria-label="Close"]') &&
					sheet.querySelector('img[alt="map layer"], input[type="radio"]')) {
					sheet.classList.add("krb-restoration__sheet");
					hidden.add(sheet);
					break;
				}
				sheet = sheet.parentElement;
			}
		}
	}
	const observer = new MutationObserver(hideSheets);
	observer.observe(document.documentElement, { childList: true, subtree: true });
	hideSheets();
	return function () {
		observer.disconnect();
		for (const sheet of hidden) sheet.classList.remove("krb-restoration__sheet");
	};
}

function closeLayerSheetWhenAvailable(done) {
	let closeAttempts = 0;
	const closeTimer = window.setInterval(function () {
		closeAttempts += 1;
		const heading = [...document.querySelectorAll("p")].find((element) =>
			["Customize map", "Heatmap settings"].includes(element.textContent?.trim()));
		const closeButton = heading?.parentElement?.querySelector('button[aria-label="Close"][aria-disabled="false"]');
		if (closeButton) {
			closeButton.click();
			window.clearInterval(closeTimer);
			// Keep the closing animation hidden too.
			window.setTimeout(done, 750);
		}
		else if (closeAttempts >= 15) {
			window.clearInterval(closeTimer);
			done();
		}
	}, 250);
}

async function restoreLayers(options) {
  if (!options.rememberLayers || layersRestoredThisLoad || restoringLayers) return;
  const layers = options.rememberedLayers || {};
  if (!Object.keys(layers).length) return;
  window.clearInterval(restoreTimer);
  restoringLayers = true;
	const revealSheets = hideRestorationSheets();
	let finishing = false;
	const restorationDeadline = window.setTimeout(function () {
		window.clearInterval(restoreTimer);
		revealSheets();
		restoringLayers = false;
	}, 16000);
  let attempts = 0;
  let layerSheetOpened = false;
  let step = "heatmap";
  const finishRestore = () => {
		if (finishing) return;
		finishing = true;
		window.clearInterval(restoreTimer);
		closeLayerSheetWhenAvailable(function () {
			window.clearTimeout(restorationDeadline);
			revealSheets();
			restoringLayers = false;
		});
  };
  restoreTimer = window.setInterval(() => {
    attempts += 1;
		if (attempts > 30) { finishRestore(); return; }
    const opener = findLayerMenuOpener();
    if (!opener) {
      if (attempts >= 30) finishRestore();
      return;
    }

    const ensureLayerSheet = (kind) => {
      const option = findLayerOption(kind, layers[kind]);
      if (!option && !layerSheetOpened) { opener.click(); layerSheetOpened = true; }
      return option;
    };
    if (step === "heatmap") {
      if (!layers.heatmap) { step = "sportMap"; return; }
      const option = ensureLayerSheet("heatmap");
      if (!option) return;
      if (!option.classList.contains("selected")) option.click();
      step = layers.heatmapSport && layers.heatmap !== "None" ? "heatmapSport" : "reopenLayers";
      layerSheetOpened = false;
      return;
    }
    if (step === "heatmapSport") {
      const sport = findHeatmapSport(layers.heatmapSport);
      if (!sport) return;
      if (!heatmapSportIsSelected(layers.heatmapSport)) sport.click();
      step = "reopenLayers";
      return;
    }
    if (step === "reopenLayers") {
      opener.click();
      layerSheetOpened = true;
      step = "sportMap";
      return;
    }
    if (step === "sportMap") {
      if (!layers.sportMap) { step = "mapType"; return; }
      const option = ensureLayerSheet("sportMap");
      if (!option) return;
      if (!option.classList.contains("selected")) option.click();
      step = "mapType";
      return;
    }
    if (step === "mapType") {
      if (!layers.mapType) {
        layersRestoredThisLoad = true;
        finishRestore();
        return;
      }
      const option = ensureLayerSheet("mapType");
      if (!option) return;
      if (!option.classList.contains("selected")) option.click();
      layersRestoredThisLoad = true;
      finishRestore();
    } else if (attempts >= 30) {
      finishRestore();
    }
  }, 350);
}

async function refresh(shouldRestore = false) {
  const [rules, options, colours] = await Promise.all([contentSettings.getRules(), contentSettings.getOptions(), contentSettings.getColours()]);
  createPanel();
  renderLegend(rules, options.maximumTrailLevel, colours);
	const panel = document.querySelector("#krb-panel");
	const enabled = options.visualsEnabled !== false;
	const toggle = panel.querySelector(".krb-panel__toggle");
	toggle.setAttribute("aria-checked", String(enabled));
	toggle.textContent = enabled ? "On" : "Off";
	panel.classList.toggle("krb-panel--disabled", !enabled);
	if (!enabled) document.getElementById(STYLE_ID)?.remove();
  sendMapConfig(rules, options, colours);
  if (shouldRestore) restoreLayers(options);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.trailRules || changes.trailOptions || changes.trailColours)) refresh(false);
});

document.addEventListener("click", rememberLayerClick, true);
document.addEventListener("click", rememberHeatmapSport, true);
installMapBridge();
refresh(true);
})();
