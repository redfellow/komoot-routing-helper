const popupSettings = globalThis.KrbSettings;

const rulesElement = document.querySelector("#rules");
const status = document.querySelector("#status");

function render(rules, colours) {
  rulesElement.replaceChildren(...popupSettings.LEVELS.map(function (level) {
    const row = document.createElement("div");
    row.className = "rule";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.style.background = colours[level];
    badge.textContent = level;
    const select = document.createElement("select");
    select.name = level;
	select.setAttribute("aria-label", `${level} display rule`);
    select.innerHTML = `
      <option value="highlight">Colour / highlight</option>
      <option value="avoid">Dark red — avoid</option>
      <option value="off">Do not highlight</option>`;
    select.value = rules[level];
    select.addEventListener("change", save);
    const picker = document.createElement("input");
		picker.type = "color";
		picker.name = level;
		picker.value = colours[level];
		picker.className = "rule__colour";
		picker.setAttribute("aria-label", `${level} highlight colour`);
		picker.title = `${level} highlight colour`;
		picker.addEventListener("input", function () {
			badge.style.background = picker.value;
		});
		picker.addEventListener("change", saveColours);
		row.append(badge, select, picker);
    return row;
  }));
}

async function saveColours() {
	const trailColours = Object.fromEntries([...rulesElement.querySelectorAll('input[type="color"]')]
		.map((picker) => [picker.name, picker.value]));
	await chrome.storage.sync.set({ trailColours });
	status.textContent = "Colours saved — the planner updates automatically.";
}

async function save() {
  const trailRules = Object.fromEntries([...rulesElement.querySelectorAll("select")]
    .map((select) => [select.name, select.value]));
  await chrome.storage.sync.set({ trailRules });
  status.textContent = "Saved — the planner updates automatically.";
  window.setTimeout(() => { status.textContent = ""; }, 2200);
}

async function saveOptions() {
  const existing = await popupSettings.getOptions();
  await chrome.storage.sync.set({
    trailOptions: {
      ...existing,
      maximumTrailLevel: document.querySelector("#maximumLevel").value,
      rememberLayers: document.querySelector("#rememberLayers").checked
    }
  });
  status.textContent = "Settings saved.";
  window.setTimeout(() => { status.textContent = ""; }, 2200);
}

document.querySelector("#restore").addEventListener("click", async function () {
  await chrome.storage.sync.set({ trailRules: popupSettings.DEFAULT_RULES, trailColours: popupSettings.HIGHLIGHT_COLOURS, trailOptions: popupSettings.DEFAULT_OPTIONS });
  render(popupSettings.DEFAULT_RULES, popupSettings.HIGHLIGHT_COLOURS);
  document.querySelector("#maximumLevel").value = popupSettings.DEFAULT_OPTIONS.maximumTrailLevel;
  document.querySelector("#rememberLayers").checked = popupSettings.DEFAULT_OPTIONS.rememberLayers;
  status.textContent = "Suggested rules restored.";
});

async function initialise() {
  const [rules, options, colours] = await Promise.all([popupSettings.getRules(), popupSettings.getOptions(), popupSettings.getColours()]);
  render(rules, colours);
  document.querySelector("#maximumLevel").value = options.maximumTrailLevel;
  document.querySelector("#rememberLayers").checked = options.rememberLayers;
  document.querySelector("#maximumLevel").addEventListener("change", saveOptions);
  document.querySelector("#rememberLayers").addEventListener("change", saveOptions);
}

initialise();
