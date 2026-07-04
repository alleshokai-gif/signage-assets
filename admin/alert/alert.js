const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxImsH4sWBlEbYaiEl4X7mUmAsuzr3j8hRJeg7Hlq6fXSQRh79XCGB8PoX7arfbPrnbXQ/exec";
const SIGNAGE_API_TOKEN = "SIGNAGE_API_TOKEN_PLACEHOLDER";

const MODE_OPTIONS = {
  outing: [
    ["gakudo", "学童出発"],
    ["school", "学校出発"],
    ["lesson", "習い事"],
    ["custom", "自由"]
  ],
  kitchen: [
    ["ramen3", "ラーメン3分"],
    ["ramen5", "ラーメン5分"],
    ["timer3", "3分タイマー"],
    ["timer5", "5分タイマー"],
    ["custom", "自由"]
  ],
  custom: [
    ["custom", "自由"]
  ]
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("date").value = todayYmd();
  bindEvents();
  updateModeOptions();
  updateTimeMode();
  loadAlerts();
});

function bindEvents() {
  $("category").addEventListener("change", () => {
    updateModeOptions();
    updateTimeMode();
  });

  document.querySelectorAll('input[name="timeMode"]').forEach((input) => {
    input.addEventListener("change", updateTimeMode);
  });

  $("mode").addEventListener("change", syncDurationFromMode);
  $("date").addEventListener("change", loadAlerts);
  $("reloadList").addEventListener("click", loadAlerts);
  $("clearToday").addEventListener("click", clearTodayAlerts);
  $("alertForm").addEventListener("submit", saveAlert);
}

function updateModeOptions() {
  const category = $("category").value;
  $("mode").innerHTML = (MODE_OPTIONS[category] || MODE_OPTIONS.custom)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  syncDurationFromMode();
}

function updateTimeMode() {
  const category = $("category").value;
  if (category === "kitchen") {
    document.querySelector('input[name="timeMode"][value="relative"]').checked = true;
  }
  const timeMode = document.querySelector('input[name="timeMode"]:checked').value;
  $("time").disabled = timeMode !== "absolute";
  $("durationMin").disabled = timeMode !== "relative";
  $("notify5min").disabled = category === "kitchen";
}

function syncDurationFromMode() {
  const mode = $("mode").value;
  const match = mode.match(/(\d+)$/);
  if (match) $("durationMin").value = match[1];
}

async function saveAlert(event) {
  event.preventDefault();
  setStatus("saving...");

  const params = new URLSearchParams({
    action: "setAlert",
    category: $("category").value,
    mode: $("mode").value,
    date: $("date").value,
    time: $("time").value,
    durationMin: $("durationMin").value,
    notify5min: String($("notify5min").checked),
    target: $("target").value.trim(),
    message: $("message").value.trim(),
    token: SIGNAGE_API_TOKEN
  });

  try {
    const json = await callApi(params);
    if (!json.ok) throw new Error(json.error || "setAlert failed");
    setStatus(`saved: ${json.created || 0}`);
    await loadAlerts();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadAlerts() {
  const date = $("date").value || todayYmd();
  $("listDate").textContent = date;
  setStatus("loading...");

  const params = new URLSearchParams({
    action: "listAlerts",
    date,
    token: SIGNAGE_API_TOKEN
  });

  try {
    const json = await callApi(params);
    if (!json.ok) throw new Error(json.error || "listAlerts failed");
    renderAlerts(json.alerts || []);
    setStatus("ready");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function clearTodayAlerts() {
  const date = $("date").value || todayYmd();
  if (!confirm(`${date} の未再生アラートを無効化しますか？`)) return;
  setStatus("clearing...");

  const params = new URLSearchParams({
    action: "clearAlerts",
    date,
    token: SIGNAGE_API_TOKEN
  });

  try {
    const json = await callApi(params);
    if (!json.ok) throw new Error(json.error || "clearAlerts failed");
    setStatus(`disabled: ${json.disabled || 0}`);
    await loadAlerts();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function callApi(params) {
  const response = await fetch(`${GAS_API_URL}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    $("alertList").innerHTML = `<div class="item"><span>予約なし</span></div>`;
    return;
  }

  $("alertList").innerHTML = alerts.map((alert) => `
    <article class="item">
      <div>
        <strong>${escapeHtml(alert.fire_time || "")}</strong><br>
        <small>${escapeHtml(alert.status || "")}</small>
      </div>
      <div>
        <strong>${escapeHtml(alert.label || alert.mode || "")}</strong><br>
        <small>${escapeHtml(alert.message || alert.key || "")}</small>
      </div>
      <div>
        <small>${escapeHtml(alert.category || "")}/${escapeHtml(alert.kind || "")}</small>
      </div>
    </article>
  `).join("");
}

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
