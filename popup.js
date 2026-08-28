const popupSettings = globalThis.KrbSettings;

const rulesElement = document.querySelector("#rules");
const status = document.querySelector("#status");

function render(rules) {
  rulesElement.replaceChildren(...popupSettings.LEVELS.map((level) => {
    const row = document.createElement("label");
    row.className = "rule";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.style.background = popupSettings.HIGHLIGHT_COLOURS[level];
    badge.textContent = level;
    const select = document.createElement("select");
    select.name = level;
    select.innerHTML = `
      <option value="highlight">Colour / highlight</option>
      <option value="avoid">Dark red — avoid</option>
      <option value="off">Do not highlight</option>`;
    select.value = rules[level];
    select.addEventListener("change", save);
    row.append(badge, select);
    return row;
  }));
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

document.querySelector("#restore").addEventListener("click", async () => {
  await chrome.storage.sync.set({ trailRules: popupSettings.DEFAULT_RULES, trailOptions: popupSettings.DEFAULT_OPTIONS });
  render(popupSettings.DEFAULT_RULES);
  document.querySelector("#maximumLevel").value = popupSettings.DEFAULT_OPTIONS.maximumTrailLevel;
  document.querySelector("#rememberLayers").checked = popupSettings.DEFAULT_OPTIONS.rememberLayers;
  status.textContent = "Suggested rules restored.";
});

async function initialise() {
  const [rules, options] = await Promise.all([popupSettings.getRules(), popupSettings.getOptions()]);
  render(rules);
  document.querySelector("#maximumLevel").value = options.maximumTrailLevel;
  document.querySelector("#rememberLayers").checked = options.rememberLayers;
  document.querySelector("#maximumLevel").addEventListener("change", saveOptions);
  document.querySelector("#rememberLayers").addEventListener("change", saveOptions);
}

initialise();
