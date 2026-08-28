(() => {
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

function sendMapConfig(rules, options) {
  window.postMessage({ type: "KRB_MAP_CONFIG", config: { rules, maximumTrailLevel: options.maximumTrailLevel } }, location.origin);
}

function createPanel() {
  if (document.querySelector("#krb-panel")) return;
  const panel = document.createElement("details");
  panel.id = "krb-panel";
  panel.open = true;
  panel.innerHTML = `<summary><span class="krb-title"></span><span class="krb-caret">⌃</span></summary><div class="krb-legend"></div>`;
  document.documentElement.append(panel);
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

function renderLegend(rules, maximumTrailLevel) {
  const legend = document.querySelector("#krb-panel .krb-legend");
  if (!legend) return;
  legend.replaceChildren(...contentSettings.LEVELS.map((level) => {
    const mode = contentSettings.LEVELS.indexOf(level) > contentSettings.LEVELS.indexOf(maximumTrailLevel) ? "off" : rules[level];
    const item = document.createElement("div");
    item.className = `krb-level ${mode === "off" ? "krb-muted" : ""} ${mode === "avoid" ? "krb-avoid" : ""}`;
    const dot = document.createElement("span");
    dot.className = "krb-dot";
    dot.style.background = mode === "avoid" ? AVOID_COLOUR : contentSettings.HIGHLIGHT_COLOURS[level];
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

function closeLayerSheetWhenAvailable() {
  let closeAttempts = 0;
  const closeTimer = window.setInterval(() => {
    closeAttempts += 1;
    const heading = [...document.querySelectorAll("p")].find((element) => element.textContent?.trim() === "Customize map");
    const closeButton = heading?.parentElement?.querySelector('button[aria-label="Close"][aria-disabled="false"]');
    if (closeButton) {
      closeButton.click();
      window.clearInterval(closeTimer);
    } else if (closeAttempts >= 15) {
      window.clearInterval(closeTimer);
    }
  }, 250);
}

async function restoreLayers(options) {
  if (!options.rememberLayers || layersRestoredThisLoad) return;
  const layers = options.rememberedLayers || {};
  if (!Object.keys(layers).length) return;
  window.clearInterval(restoreTimer);
  restoringLayers = true;
  let attempts = 0;
  let layerSheetOpened = false;
  let step = "heatmap";
  const finishRestore = () => {
    restoringLayers = false;
    window.clearInterval(restoreTimer);
  };
  restoreTimer = window.setInterval(() => {
    attempts += 1;
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
        closeLayerSheetWhenAvailable();
        return;
      }
      const option = ensureLayerSheet("mapType");
      if (!option) return;
      if (!option.classList.contains("selected")) option.click();
      layersRestoredThisLoad = true;
      finishRestore();
      closeLayerSheetWhenAvailable();
    } else if (attempts >= 30) {
      finishRestore();
    }
  }, 350);
}

async function refresh(shouldRestore = false) {
  const [rules, options] = await Promise.all([contentSettings.getRules(), contentSettings.getOptions()]);
  createPanel();
  renderLegend(rules, options.maximumTrailLevel);
  sendMapConfig(rules, options);
  if (shouldRestore) restoreLayers(options);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.trailRules || changes.trailOptions)) refresh(false);
});

document.addEventListener("click", rememberLayerClick, true);
document.addEventListener("click", rememberHeatmapSport, true);
installMapBridge();
refresh(true);
})();
