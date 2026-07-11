const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxImsH4sWBlEbYaiEl4X7mUmAsuzr3j8hRJeg7Hlq6fXSQRh79XCGB8PoX7arfbPrnbXQ/exec";
const SIGNAGE_API_TOKEN = "SIGNAGE_API_TOKEN_PLACEHOLDER";

const MODE_OPTIONS = {
  outing: [
    ["gakudo", "学童"],
    ["school", "学校"],
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

const VOICE_KEY_MAP = {
  "outing:gakudo:five_min": "ZUNDA_OUTING_5MIN",
  "outing:gakudo:depart": "ZUNDA_OUTING_NOW",
  "outing:school:five_min": "ZUNDA_OUTING_5MIN",
  "outing:school:depart": "ZUNDA_OUTING_NOW",
  "outing:lesson:five_min": "ZUNDA_OUTING_5MIN",
  "outing:lesson:depart": "ZUNDA_OUTING_NOW",
  "kitchen:ramen3:done": "ZUNDA_TIMER_RAMEN_DONE",
  "kitchen:ramen5:done": "ZUNDA_TIMER_RAMEN_DONE",
  "kitchen:timer3:done": "ZUNDA_TIMER_DONE",
  "kitchen:timer5:done": "ZUNDA_TIMER_DONE"
};

const VOICE_BASE_URL = "../../assets/voice/";
const voiceFileStatusCache = new Map();

const $ = (id) => document.getElementById(id);

const ALERT_DEVICE_STORAGE_KEY = "SIGNAGE_ALERT_DEVICE_ID";
const ALERT_DEVICE_OPTIONS = ["living", "fire", "pc", "off"];
const ALERT_DEVICE_LABELS = {
  living: "living（Alert有効）",
  fire: "fire（Alert無効）",
  pc: "pc（Alert無効）",
  off: "off（Alert停止）"
};

const REQUIRED_DOM_IDS = [
  "deviceSettingsButton",
  "deviceSettingsPanel",
  "deviceSelect",
  "deviceCurrentLabel",
  "deviceSaveButton",
  "deviceCancelButton",
  "alertForm",
  "category",
  "mode",
  "date",
  "timeField",
  "timeLabel",
  "time",
  "durationField",
  "durationMin",
  "notifyField",
  "notify5min",
  "target",
  "voiceStatus",
  "messageField",
  "message",
  "clearToday",
  "reloadList",
  "showHistory",
  "listDate",
  "alertList",
  "status"
];

let isInitialized = false;
const ALERT_DEVICE_ID = resolveAlertDevice();
const ALERT_CHECK_ENABLED = ALERT_DEVICE_ID === "living";
console.log(`[alert device]\ndevice=${ALERT_DEVICE_ID}\nenabled=${ALERT_CHECK_ENABLED}`);

function initialize() {
  if (isInitialized) return;
  isInitialized = true;

  if (!validateInitialDom()) return;

  initializeAlertDeviceControls();
  $("date").value = todayYmd();
  bindEvents();
  updateModeOptions();
  updateTimeMode();
  loadAlerts();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

function validateInitialDom() {
  const missingIds = REQUIRED_DOM_IDS.filter((id) => !$(id));
  const timeModeInputs = document.querySelectorAll('input[name="timeMode"]');
  const checkedTimeMode = document.querySelector('input[name="timeMode"]:checked');

  if (timeModeInputs.length === 0) {
    console.warn('[alert admin] Missing required DOM selector: input[name="timeMode"]');
  }
  if (!checkedTimeMode) {
    console.warn('[alert admin] Missing checked DOM selector: input[name="timeMode"]:checked');
  }
  if (missingIds.length > 0) {
    console.warn("[alert admin] Missing required DOM ids:", missingIds);
  }

  const isValid = missingIds.length === 0 && timeModeInputs.length > 0 && !!checkedTimeMode;
  if (!isValid) {
    const status = $("status");
    if (status) {
      status.textContent = "DOM initialization failed";
      status.classList.toggle("error", true);
    }
  }
  return isValid;
}

function normalizeAlertDevice(value) {
  const device = String(value || "").trim();
  return ALERT_DEVICE_OPTIONS.includes(device) ? device : "";
}

function defaultAlertDevice() {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return "pc";
  return "living";
}

function resolveAlertDevice() {
  const qs = new URLSearchParams(location.search);
  const fromUrl = normalizeAlertDevice(qs.get("alertDevice"));
  if (fromUrl) {
    localStorage.setItem(ALERT_DEVICE_STORAGE_KEY, fromUrl);
    return fromUrl;
  }

  const stored = normalizeAlertDevice(localStorage.getItem(ALERT_DEVICE_STORAGE_KEY));
  return stored || defaultAlertDevice();
}

function initializeAlertDeviceControls() {
  const button = $("deviceSettingsButton");
  const panel = $("deviceSettingsPanel");
  const select = $("deviceSelect");
  const current = $("deviceCurrentLabel");
  const save = $("deviceSaveButton");
  const cancel = $("deviceCancelButton");

  const closePanel = () => {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };
  const openPanel = () => {
    select.value = ALERT_DEVICE_ID;
    updateAlertDeviceCurrentLabel();
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    select.focus();
  };
  const togglePanel = () => {
    if (panel.hidden) openPanel();
    else closePanel();
  };

  select.value = ALERT_DEVICE_ID;
  updateAlertDeviceCurrentLabel();

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePanel();
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  select.addEventListener("change", updateAlertDeviceCurrentLabel);

  cancel.addEventListener("click", closePanel);

  save.addEventListener("click", () => {
    const nextDevice = normalizeAlertDevice(select.value) || "off";
    localStorage.setItem(ALERT_DEVICE_STORAGE_KEY, nextDevice);
    location.reload();
  });

  document.addEventListener("click", closePanel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanel();
  });

  function updateAlertDeviceCurrentLabel() {
    const device = normalizeAlertDevice(select.value) || ALERT_DEVICE_ID;
    current.textContent = `現在: ${ALERT_DEVICE_LABELS[device] || device}`;
  }
}

function bindEvents() {
  $("category").addEventListener("change", () => {
    applyCategoryDefaults();
    updateModeOptions();
    updateTimeMode();
  });

  document.querySelectorAll('input[name="timeMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      updateTimeMode();
      updateVoiceStatus();
    });
  });

  $("mode").addEventListener("change", () => {
    syncDurationFromMode();
    updateVoiceStatus();
  });
  $("date").addEventListener("change", loadAlerts);
  $("durationMin").addEventListener("input", () => {
    updateQuickTimerActive();
    updateVoiceStatus();
  });
  $("notify5min").addEventListener("change", updateVoiceStatus);
  $("message").addEventListener("input", updateVoiceStatus);
  document.querySelectorAll("[data-duration]").forEach((button) => {
    button.addEventListener("click", () => {
      $("durationMin").value = button.dataset.duration || "3";
      updateQuickTimerActive();
      updateVoiceStatus();
    });
  });
  $("showHistory").addEventListener("change", loadAlerts);
  $("reloadList").addEventListener("click", loadAlerts);
  $("clearToday").addEventListener("click", clearTodayAlerts);
  $("alertForm").addEventListener("submit", saveAlert);
}

function applyCategoryDefaults() {
  const category = $("category").value;
  if (category === "outing") {
    setTimeMode("absolute");
    $("notify5min").checked = true;
  } else if (category === "kitchen") {
    setTimeMode("relative");
    $("notify5min").checked = false;
  }
}

function setTimeMode(value) {
  const input = document.querySelector(`input[name="timeMode"][value="${value}"]`);
  if (input) input.checked = true;
}

function updateModeOptions() {
  const category = $("category").value;
  $("mode").innerHTML = (MODE_OPTIONS[category] || MODE_OPTIONS.custom)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  syncDurationFromMode();
  updateVoiceStatus();
}

function updateTimeMode() {
  const category = $("category").value;
  if (category === "kitchen") {
    setTimeMode("relative");
  }
  const timeMode = document.querySelector('input[name="timeMode"]:checked').value;
  $("timeField").classList.toggle("is-hidden", timeMode !== "absolute");
  $("durationField").classList.toggle("is-hidden", timeMode !== "relative");
  $("durationField").classList.toggle("is-emphasis", category === "kitchen");
  $("notifyField").classList.toggle("is-hidden", category === "kitchen");
  $("timeLabel").textContent = category === "outing" ? "出発時刻" : "時刻";
  $("time").disabled = timeMode !== "absolute";
  $("durationMin").disabled = timeMode !== "relative";
  $("notify5min").disabled = category === "kitchen";
  updateQuickTimerActive();
  updateVoiceStatus();
}

function syncDurationFromMode() {
  const mode = $("mode").value;
  const match = mode.match(/(\d+)$/);
  if (match) $("durationMin").value = match[1];
  updateQuickTimerActive();
}

function updateQuickTimerActive() {
  const duration = String(Number($("durationMin").value || 0));
  document.querySelectorAll("[data-duration]").forEach((button) => {
    button.classList.toggle("active", button.dataset.duration === duration);
  });
}

async function saveAlert(event) {
  event.preventDefault();
  const voiceSummary = await getCurrentVoiceSummary();
  console.log("[alert admin save voice]", {
    selectedSound: voiceSummary.selectedSound || "",
    message: $("message").value.trim(),
    usePresetSound: !!voiceSummary.usePresetSound,
    entries: (voiceSummary.entries || []).map((entry) => ({
      label: entry.label,
      key: entry.key,
      fileStatus: entry.fileStatus || ""
    }))
  });
  if (voiceSummary.requiresMessage && !$("message").value.trim()) {
    setStatus("定型音声がないため、読み上げメッセージを入力してください。", true);
    $("messageField").classList.add("is-required");
    $("message").focus();
    return;
  }

  setStatus("saving...");
  const date = normalizeDateForApi($("date").value);

  const params = new URLSearchParams({
    action: "setAlert",
    category: $("category").value,
    mode: $("mode").value,
    date,
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

async function updateVoiceStatus() {
  const status = $("voiceStatus");
  status.className = "voice-status wide";
  status.textContent = "音声状態を確認中...";

  try {
    const summary = await getCurrentVoiceSummary();
    renderVoiceSummary(summary);
    updateMessageRequirement(summary);
  } catch (error) {
    status.classList.add("warn");
    status.textContent = "⚠ 音声状態を確認できません";
    const detail = document.createElement("small");
    detail.textContent = error.message || "fetch failed";
    status.appendChild(detail);
    updateMessageRequirement({ requiresMessage: $("category").value === "custom" });
  }
}

async function getCurrentVoiceSummary() {
  const category = $("category").value;
  const mode = $("mode").value;
  const entries = getVoiceEntries(category, mode);

  if (category === "custom") {
    return {
      type: "tts",
      entries: [],
      requiresMessage: true,
      selectedSound: "",
      usePresetSound: false,
      message: "読み上げメッセージで通知します"
    };
  }

  if (!entries.length) {
    return {
      type: "missing",
      entries: [],
      requiresMessage: true,
      selectedSound: "",
      usePresetSound: false,
      message: "⚠ 定型音声なし。読み上げメッセージを入力してください。"
    };
  }

  const checkedEntries = [];
  for (const entry of entries) {
    checkedEntries.push({
      ...entry,
      fileStatus: await checkVoiceFile(entry.key)
    });
  }

  const hasMissing = checkedEntries.some((entry) => entry.fileStatus === "missing");
  const hasUnknown = checkedEntries.some((entry) => entry.fileStatus === "unknown");
  return {
    type: hasMissing ? "missing_file" : hasUnknown ? "unknown" : "wav",
    entries: checkedEntries,
    requiresMessage: hasMissing,
    selectedSound: checkedEntries.map((entry) => entry.key).filter(Boolean).join(","),
    usePresetSound: !hasMissing && checkedEntries.some((entry) => entry.key),
    message: hasMissing
      ? "⚠ 定型音声ファイルなし。読み上げメッセージを入力してください。"
      : hasUnknown
        ? "⚠ 定型音声ファイルを確認できません"
        : "✅ 定型音声あり"
  };
}

function getVoiceEntries(category, mode) {
  if (category === "outing") {
    const entries = [];
    if ($("notify5min").checked) {
      entries.push({ label: "5分前", key: VOICE_KEY_MAP[`${category}:${mode}:five_min`] || "" });
    }
    entries.push({ label: "出発時刻", key: VOICE_KEY_MAP[`${category}:${mode}:depart`] || "" });
    return entries.filter((entry) => entry.key);
  }

  if (category === "kitchen") {
    const key = VOICE_KEY_MAP[`${category}:${mode}:done`] || "";
    return key ? [{ label: "完了", key }] : [];
  }

  return [];
}

async function checkVoiceFile(key) {
  if (!key) return "missing";
  if (voiceFileStatusCache.has(key)) return voiceFileStatusCache.get(key);

  try {
    const response = await fetch(`${VOICE_BASE_URL}${encodeURIComponent(key)}.wav`, {
      cache: "no-store"
    });
    const status = response.ok ? "ok" : "missing";
    voiceFileStatusCache.set(key, status);
    return status;
  } catch (error) {
    voiceFileStatusCache.set(key, "unknown");
    return "unknown";
  }
}

function renderVoiceSummary(summary) {
  const status = $("voiceStatus");
  status.className = "voice-status wide";

  if (summary.type === "tts") {
    status.classList.add("tts");
    status.textContent = summary.message;
    return;
  }

  if (summary.type === "wav") {
    status.classList.add("ok");
  } else {
    status.classList.add("warn");
  }

  status.textContent = summary.message;
  if (summary.usePresetSound) {
    const note = document.createElement("small");
    note.textContent = "定型音声ありONの場合、定型音声を優先します。自由文を読み上げたい場合は定型音声をOFFにしてください。";
    status.appendChild(note);
  }
  summary.entries.forEach((entry) => {
    const line = document.createElement("small");
    const mark = entry.fileStatus === "ok" ? "✅" : entry.fileStatus === "missing" ? "⚠" : "確認できません";
    line.textContent = `${entry.label}: ${mark} ${entry.key}`;
    status.appendChild(line);
  });
}

function updateMessageRequirement(summary = null) {
  const requiresMessage = summary
    ? summary.requiresMessage
    : $("category").value === "custom";
  $("messageField").classList.toggle("is-required", requiresMessage);
}

async function loadAlerts() {
  const date = normalizeDateForApi($("date").value || todayYmd());
  $("listDate").textContent = date;
  setStatus("loading...");

  const params = new URLSearchParams({
    action: "listAlerts",
    date,
    token: SIGNAGE_API_TOKEN
  });

  try {
    const json = await callApi(params);
    console.log("[listAlerts response]", json);
    if (!json.ok) throw new Error(json.error || "listAlerts failed");
    const alerts = extractAlertsFromResponse(json);
    const visibleAlerts = filterAlertsForDisplay(alerts);
    console.log("[listAlerts render]", {
      count: visibleAlerts.length,
      total: alerts.length,
      showHistory: $("showHistory").checked,
      debug: json.debug || null
    });
    renderAlerts(visibleAlerts);
    setStatus("ready");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function clearTodayAlerts() {
  const date = normalizeDateForApi($("date").value || todayYmd());
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
  const url = `${GAS_API_URL}?${params.toString()}`;
  console.log("[alert API]", url);
  const response = await fetch(url, { cache: "no-store" });
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
      <div class="itemTime">${escapeHtml(displayAlertTime(alert))}</div>
      <div class="itemMain">
        <strong>${escapeHtml(displayAlertLabel(alert))}</strong>
        <small>${escapeHtml(displayAlertKind(alert.kind))}</small>
      </div>
      <div class="itemMeta">
        <span class="statusBadge ${escapeHtml(statusClassName(alert.status))}">${escapeHtml(alert.status || "")}</span>
        <small>${escapeHtml(alert.category || "")}/${escapeHtml(alert.kind || "")}</small>
      </div>
    </article>
  `).join("");
}

function displayAlertLabel(alert) {
  const label = String(alert.label || "").trim();
  const mode = String(alert.mode || "").trim();
  if (alert.category === "outing") {
    if (mode === "gakudo") return "学童";
    if (mode === "school") return "学校";
    if (mode === "lesson") return "習い事";
  }
  return label || mode || alert.message || alert.key || "";
}

function displayAlertKind(kind) {
  return ({
    five_min: "5分前",
    depart: "出発時刻",
    done: "完了",
    custom: "通知"
  })[String(kind || "")] || String(kind || "");
}

function statusClassName(status) {
  const normalized = String(status || "").toLowerCase();
  return ["waiting", "played", "disabled", "expired"].includes(normalized)
    ? `status-${normalized}`
    : "";
}

function filterAlertsForDisplay(alerts) {
  if ($("showHistory").checked) return alerts;
  return alerts.filter((alert) => String(alert.status || "").toLowerCase() === "waiting");
}

function extractAlertsFromResponse(json) {
  if (Array.isArray(json?.alerts)) return json.alerts;
  if (Array.isArray(json?.alarms)) return json.alarms;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.data?.alerts)) return json.data.alerts;
  return [];
}

function displayAlertTime(alert) {
  const date = normalizeDateForApi($("date").value || todayYmd());
  const fireTime = normalizeTimeText(alert.fire_time);
  const fireDateTime = String(alert.fire_datetime || "");
  const m = fireDateTime.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (m && m[1] === date) return m[2];
  if (m) return `${m[1]} ${m[2]}`;
  if (fireTime) return fireTime;
  return fireDateTime || "";
}

function normalizeTimeText(value) {
  const s = String(value || "").trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function setStatus(text, isError = false) {
  const status = $("status");
  if (!status) {
    console.warn("[alert admin] Missing required DOM id: status");
    return;
  }
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeDateForApi(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (!m) return todayYmd();
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
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
