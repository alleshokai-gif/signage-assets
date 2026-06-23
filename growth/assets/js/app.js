const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwwQ3VgW4YP2oKBWn0yBnkAn4mmv9e4qSKAp73Nz8GZ3Ziuy9Q7d97y1t2jJOriGO_KTA/exec";

const state = {
  children: [],
  curves: { height: [], weight: [] },
  selectedChildId: "",
  mode: "height",
  chart: null,
  currentView: "chart",
  inputView: "measurement",
  isSubmitting: false,
  pendingSelectedChildId: ""
};

const els = {};
const JSONP_TIMEOUT_MS = 15000;
let growthDataTimeoutId = null;

window.handleGrowthData = function(data) {
  if (growthDataTimeoutId) {
    clearTimeout(growthDataTimeoutId);
    growthDataTimeoutId = null;
  }

  showMessage("", "");
  initialize(data);
};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  loadGrowthData();
});

function bindElements() {
  els.status = document.getElementById("status");
  els.mainTabs = Array.from(document.querySelectorAll(".main-tab"));
  els.subTabs = Array.from(document.querySelectorAll(".sub-tab"));
  els.chartViews = Array.from(document.querySelectorAll(".chart-view"));
  els.inputViews = Array.from(document.querySelectorAll(".input-view"));
  els.childSelect = document.getElementById("childSelect");
  els.measurementChildSelect = document.getElementById("measurementChildSelect");
  els.modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));
  els.measurementForm = document.getElementById("measurementForm");
  els.childForm = document.getElementById("childForm");
  els.measurementDate = document.getElementById("measurementDate");
  els.heightInput = document.getElementById("heightInput");
  els.weightInput = document.getElementById("weightInput");
  els.measurementSubmit = document.getElementById("measurementSubmit");
  els.childNameInput = document.getElementById("childNameInput");
  els.childSexInput = document.getElementById("childSexInput");
  els.childBirthDateInput = document.getElementById("childBirthDateInput");
  els.fatherHeightInput = document.getElementById("fatherHeightInput");
  els.motherHeightInput = document.getElementById("motherHeightInput");
  els.childSubmit = document.getElementById("childSubmit");
  els.steppers = Array.from(document.querySelectorAll(".stepper"));
  els.chartTitle = document.getElementById("chartTitle");
  els.curveNote = document.getElementById("curveNote");
  els.chartCanvas = document.getElementById("growthChart");
  els.messagePanel = document.getElementById("messagePanel");
  els.messageTitle = document.getElementById("messageTitle");
  els.messageBody = document.getElementById("messageBody");
  els.latestDate = document.getElementById("latestDate");
  els.latestHeight = document.getElementById("latestHeight");
  els.latestWeight = document.getElementById("latestWeight");
  els.latestSds = document.getElementById("latestSds");
}

function bindEvents() {
  els.measurementDate.max = formatDateInputValue(new Date());

  els.mainTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = button.dataset.view;
      renderView();
    });
  });

  els.subTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.inputView = button.dataset.inputView;
      renderInputView();
    });
  });

  els.childSelect.addEventListener("change", () => {
    state.selectedChildId = els.childSelect.value;
    els.measurementChildSelect.value = state.selectedChildId;
    render();
  });

  els.measurementChildSelect.addEventListener("change", () => {
    state.selectedChildId = els.measurementChildSelect.value;
    els.childSelect.value = state.selectedChildId;
    render();
  });

  els.modeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.mode = input.value;
      render();
    });
  });

  els.measurementForm.addEventListener("submit", handleMeasurementSubmit);
  els.childForm.addEventListener("submit", handleChildSubmit);

  els.steppers.forEach((stepper) => {
    const input = document.getElementById(stepper.dataset.stepper);
    const step = Number(stepper.dataset.step || input.step || 1);

    stepper.querySelectorAll("[data-step-direction]").forEach((button) => {
      button.addEventListener("click", () => {
        const direction = Number(button.dataset.stepDirection);
        adjustNumberInput(input, step * direction);
      });
    });
  });
}

function loadGrowthData() {
  setStatus("読み込み中");
  showMessage("", "");

  const url = GAS_API_URL + "?callback=handleGrowthData";
  const script = document.createElement("script");

  script.src = url;
  script.async = true;
  script.onerror = () => {
    if (growthDataTimeoutId) {
      clearTimeout(growthDataTimeoutId);
      growthDataTimeoutId = null;
    }
    handleGrowthDataError(new Error("JSONP load failed"));
  };

  growthDataTimeoutId = setTimeout(() => {
    growthDataTimeoutId = null;
    handleGrowthDataError(new Error("JSONP callback timed out"));
  }, JSONP_TIMEOUT_MS);

  document.head.appendChild(script);
}

function initialize(payload) {
  try {
    const previousSelectedChildId = state.pendingSelectedChildId || state.selectedChildId;
    const normalized = normalizePayload(payload);

    if (!normalized.children.length) {
      throw new Error("子供データがありません");
    }

    state.children = normalized.children;
    state.curves = normalized.curves;
    state.selectedChildId = state.children.some((child) => child.id === previousSelectedChildId)
      ? previousSelectedChildId
      : state.children[0].id;
    state.pendingSelectedChildId = "";
    populateChildSelect();
    render();
    renderView();
    setStatus("読み込み完了");
  } catch (error) {
    handleGrowthDataError(error);
  }
}

function handleGrowthDataError(error) {
  setStatus("取得失敗", true);
  showMessage(
    "データ取得失敗",
    `GAS APIから成長データを取得できませんでした。GAS_API_URLとWebアプリの公開設定を確認してください。詳細: ${error.message}`
  );
  els.childSelect.innerHTML = '<option value="">取得失敗</option>';
  els.childSelect.disabled = true;
}

function normalizePayload(payload) {
  const source = payload && payload.data ? payload.data : payload;
  const rawChildren = Array.isArray(source.children) ? source.children : buildChildrenFromRecords(source.records || source.measurements || []);
  const curves = normalizeCurves(source.sds || source.sdsCurves || source.curves || {}, source.rows || []);
  const children = rawChildren.map((child, index) => normalizeChild(child, index, curves));

  return { children, curves };
}

function buildChildrenFromRecords(records) {
  const map = new Map();

  records.forEach((record, index) => {
    const childId = String(record.childId || record.child_id || record.id || record.name || record.childName || "child");
    const child = map.get(childId) || {
      id: childId,
      name: record.childName || record.name || `子供${index + 1}`,
      sex: record.sex || record.gender || "",
      birthDate: record.birthDate || record.birth_date || "",
      measurements: []
    };

    child.measurements.push(record);
    map.set(childId, child);
  });

  return Array.from(map.values());
}

function normalizeChild(child, index, fallbackCurves) {
  const birthDate = child.birthDate || child.birth_date || "";
  const measurements = Array.isArray(child.measurements) ? child.measurements : Array.isArray(child.rows) ? child.rows : [];
  const curves = normalizeCurves(child.sds || child.sdsCurves || child.curves || {}, measurements);

  return {
    id: String(child.id || child.childId || child.name || `child-${index + 1}`),
    name: child.name || child.childName || `子供${index + 1}`,
    sex: child.sex || child.gender || "",
    birthDate,
    curves: hasCurveData(curves) ? curves : fallbackCurves,
    measurements: measurements.map((row) => normalizeMeasurement(row, birthDate)).filter(Boolean).sort((a, b) => a.ageMonths - b.ageMonths)
  };
}

function normalizeMeasurement(row, birthDate) {
  const date = row.date || row.recordDate || row.record_date || row.measuredAt || row.measured_at || row.measurementDate || "";
  const ageMonths = numberOrNull(row.ageMonths ?? row.age_months ?? row.months ?? calculateAgeMonths(birthDate, date));
  const height = numberOrNull(row.height ?? row.heightCm ?? row.height_cm);
  const weight = numberOrNull(row.weight ?? row.weightKg ?? row.weight_kg);
  const heightSds = numberOrNull(row.heightSds ?? row.height_sds ?? row.sdsHeight);
  const weightSds = numberOrNull(row.weightSds ?? row.weight_sds ?? row.sdsWeight);

  if (ageMonths === null || (height === null && weight === null)) {
    return null;
  }

  return { date, ageMonths, height, weight, heightSds, weightSds };
}

function normalizeCurves(rawCurves, rows) {
  const structuredCurves = {
    height: normalizeMetricCurves(rawCurves.height || rawCurves.heightCm || rawCurves.stature || []),
    weight: normalizeMetricCurves(rawCurves.weight || rawCurves.weightKg || [])
  };
  const rowCurves = normalizeCurvesFromRows(rows);

  return {
    height: structuredCurves.height.length ? structuredCurves.height : rowCurves.height,
    weight: structuredCurves.weight.length ? structuredCurves.weight : rowCurves.weight
  };
}

function hasCurveData(curves) {
  return Boolean(curves && ((curves.height && curves.height.length) || (curves.weight && curves.weight.length)));
}

function normalizeCurvesFromRows(rows) {
  const curveSpecs = {
    height: [
      { key: "height_m2sd", sds: -2 },
      { key: "height_m1sd", sds: -1 },
      { key: "height_mean", sds: 0 },
      { key: "height_p1sd", sds: 1 },
      { key: "height_p2sd", sds: 2 }
    ],
    weight: [
      { key: "weight_m2sd", sds: -2 },
      { key: "weight_m1sd", sds: -1 },
      { key: "weight_mean", sds: 0 },
      { key: "weight_p1sd", sds: 1 },
      { key: "weight_p2sd", sds: 2 }
    ]
  };
  const sourceRows = Array.isArray(rows) ? rows : [];

  return Object.fromEntries(Object.entries(curveSpecs).map(([metric, specs]) => [
    metric,
    specs.map((spec) => ({
      label: formatSdsLabel(spec.sds),
      sds: spec.sds,
      points: sourceRows.map((row) => {
        const ageMonths = numberOrNull(row.ageMonths ?? row.age_months ?? row.months ?? row.month ?? row.x);
        const value = numberOrNull(row[spec.key]);
        return ageMonths === null || value === null ? null : { x: ageMonths, y: value };
      }).filter(Boolean).sort((a, b) => a.x - b.x)
    })).filter((curve) => curve.points.length)
  ]));
}

function normalizeMetricCurves(raw) {
  if (Array.isArray(raw)) {
    return raw.map((curve) => ({
      label: curve.label || formatSdsLabel(curve.sds),
      sds: numberOrNull(curve.sds),
      points: normalizeCurvePoints(curve.points || curve.values || curve.data || [])
    })).filter((curve) => curve.points.length);
  }

  return Object.entries(raw || {}).map(([label, points]) => ({
    label: formatSdsLabel(label),
    sds: numberOrNull(label),
    points: normalizeCurvePoints(points)
  })).filter((curve) => curve.points.length);
}

function normalizeCurvePoints(points) {
  return points.map((point) => {
    const ageMonths = numberOrNull(point.ageMonths ?? point.age_months ?? point.months ?? point.x);
    const value = numberOrNull(point.value ?? point.y ?? point.height ?? point.weight);
    return ageMonths === null || value === null ? null : { x: ageMonths, y: value };
  }).filter(Boolean).sort((a, b) => a.x - b.x);
}

function populateChildSelect() {
  const options = state.children.map((child) => (
    `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`
  )).join("");
  els.childSelect.innerHTML = options;
  els.measurementChildSelect.innerHTML = options;
  els.childSelect.value = state.selectedChildId;
  els.measurementChildSelect.value = state.selectedChildId;
  els.childSelect.disabled = false;
  els.measurementChildSelect.disabled = false;
}

function render() {
  const child = getSelectedChild();
  if (!child) {
    return;
  }

  updateSummary(child);
  renderChart(child);
}

function getSelectedChild() {
  return state.children.find((child) => child.id === state.selectedChildId) || state.children[0];
}

function updateSummary(child) {
  if (!child.measurements.length) {
    els.latestDate.textContent = "-";
    els.latestHeight.textContent = "-";
    els.latestWeight.textContent = "-";
    els.latestSds.textContent = "-";
    return;
  }

  const latest = child.measurements[child.measurements.length - 1];
  els.latestDate.textContent = latest.date || `${formatAge(latest.ageMonths)}`;
  els.latestHeight.textContent = latest.height === null ? "-" : `${latest.height.toFixed(1)} cm`;
  els.latestWeight.textContent = latest.weight === null ? "-" : `${latest.weight.toFixed(1)} kg`;

  const sdsParts = [];
  if (latest.heightSds !== null) {
    sdsParts.push(`身長 ${latest.heightSds.toFixed(2)}`);
  }
  if (latest.weightSds !== null) {
    sdsParts.push(`体重 ${latest.weightSds.toFixed(2)}`);
  }
  els.latestSds.textContent = sdsParts.length ? sdsParts.join(" / ") : "-";
}

function renderChart(child) {
  const metricLabel = state.mode === "height" ? "身長" : state.mode === "weight" ? "体重" : "身長＋体重";
  els.chartTitle.textContent = `${child.name} - ${metricLabel}`;

  const datasets = [];
  const curves = child.curves || state.curves;
  if (state.mode === "height" || state.mode === "both") {
    datasets.push(...buildCurveDatasets(curves, "height", "身長SDS", "y"));
    datasets.push(buildMeasurementDataset(child.measurements, "height", "身長", "#2563eb", "y"));
  }

  if (state.mode === "weight" || state.mode === "both") {
    datasets.push(...buildCurveDatasets(curves, "weight", "体重SDS", state.mode === "both" ? "y1" : "y"));
    datasets.push(buildMeasurementDataset(child.measurements, "weight", "体重", "#f97316", state.mode === "both" ? "y1" : "y"));
  }

  const visibleCurveCount = datasets.filter((dataset) => dataset.isSdsCurve).length;
  els.curveNote.textContent = visibleCurveCount ? `SDS曲線 ${visibleCurveCount}本を表示` : "SDS曲線データなし";

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new Chart(els.chartCanvas, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      parsing: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            title(items) {
              const point = items[0].raw;
              return `月齢 ${formatAge(point.x)}`;
            }
          }
        }
      },
      scales: buildScales(datasets)
    }
  });
}

function buildCurveDatasets(curves, metric, labelPrefix, yAxisID) {
  const palette = {
    "-3": "#e2e8f0",
    "-2": "#cbd5e1",
    "-1": "#94a3b8",
    "0": "#475569",
    "1": "#94a3b8",
    "2": "#cbd5e1",
    "3": "#e2e8f0"
  };
  const metricCurves = curves && Array.isArray(curves[metric]) ? curves[metric] : [];

  return metricCurves.map((curve) => ({
    label: `${labelPrefix} ${curve.label}`,
    data: curve.points,
    borderColor: palette[String(curve.sds)] || "#94a3b8",
    backgroundColor: "transparent",
    borderWidth: curve.sds === 0 ? 2 : 1,
    borderDash: curve.sds === 0 ? [] : [4, 4],
    pointRadius: 0,
    tension: 0.25,
    yAxisID,
    isSdsCurve: true
  }));
}

function buildMeasurementDataset(measurements, metric, label, color, yAxisID) {
  const data = measurements.map((row) => ({
    x: row.ageMonths,
    y: row[metric],
    date: row.date
  })).filter((point) => point.y !== null);

  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 3,
    pointRadius: 4,
    pointHoverRadius: 6,
    tension: 0.2,
    yAxisID
  };
}

function renderView() {
  const isInput = state.currentView === "input";

  els.mainTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.currentView);
  });
  els.chartViews.forEach((view) => {
    view.hidden = isInput;
  });
  els.inputViews.forEach((view) => {
    view.hidden = !isInput;
  });
  renderInputView();
}

function renderInputView() {
  els.subTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.inputView === state.inputView);
  });
  els.measurementForm.hidden = state.inputView !== "measurement";
  els.childForm.hidden = state.inputView !== "child";
}

async function handleMeasurementSubmit(event) {
  event.preventDefault();
  if (state.isSubmitting) {
    return;
  }

  const payload = {
    action: "addMeasurement",
    childId: els.measurementChildSelect.value,
    measuredDate: els.measurementDate.value,
    heightCm: els.heightInput.value.trim(),
    weightKg: els.weightInput.value.trim()
  };
  const validationError = validateMeasurementPayload(payload);
  if (validationError) {
    showMessage("入力エラー", validationError);
    return;
  }

  state.pendingSelectedChildId = payload.childId;
  await submitGrowthData(payload, () => {
    els.measurementForm.reset();
    els.measurementChildSelect.value = state.pendingSelectedChildId;
  });
}

async function handleChildSubmit(event) {
  event.preventDefault();
  if (state.isSubmitting) {
    return;
  }

  const payload = {
    action: "addChild",
    name: els.childNameInput.value.trim(),
    sex: els.childSexInput.value,
    birthDate: els.childBirthDateInput.value,
    heightFather: els.fatherHeightInput.value.trim(),
    heightMother: els.motherHeightInput.value.trim()
  };
  const validationError = validateChildPayload(payload);
  if (validationError) {
    showMessage("入力エラー", validationError);
    return;
  }

  await submitGrowthData(payload, (result) => {
    els.childForm.reset();
    if (result.childId) {
      state.pendingSelectedChildId = String(result.childId);
    }
  });
}

async function submitGrowthData(payload, onSuccess) {
  setSubmitting(true);
  showMessage("", "");
  setStatus("保存中");

  try {
    const response = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }

    if (onSuccess) {
      onSuccess(result);
    }
    setStatus("保存完了");
    loadGrowthData();
  } catch (error) {
    setStatus("保存失敗", true);
    showMessage("保存失敗", `GASへの送信に失敗しました。詳細: ${error.message}`);
  } finally {
    setSubmitting(false);
  }
}

function validateMeasurementPayload(payload) {
  if (!payload.childId) {
    return "子どもを選択してください。";
  }
  if (!payload.measuredDate) {
    return "測定日を入力してください。";
  }
  if (isFutureDate(payload.measuredDate)) {
    return "測定日は未来日にできません。";
  }
  if (payload.heightCm === "" && payload.weightKg === "") {
    return "身長または体重を入力してください。";
  }
  if (payload.heightCm !== "" && numberOrNull(payload.heightCm) === null) {
    return "身長は数値で入力してください。";
  }
  if (payload.weightKg !== "" && numberOrNull(payload.weightKg) === null) {
    return "体重は数値で入力してください。";
  }
  return "";
}

function validateChildPayload(payload) {
  if (!payload.name) {
    return "名前を入力してください。";
  }
  if (!payload.sex) {
    return "性別を選択してください。";
  }
  if (!payload.birthDate) {
    return "生年月日を入力してください。";
  }
  if (payload.heightFather !== "" && numberOrNull(payload.heightFather) === null) {
    return "父身長は数値で入力してください。";
  }
  if (payload.heightMother !== "" && numberOrNull(payload.heightMother) === null) {
    return "母身長は数値で入力してください。";
  }
  return "";
}

function setSubmitting(isSubmitting) {
  state.isSubmitting = isSubmitting;
  els.measurementSubmit.disabled = isSubmitting;
  els.childSubmit.disabled = isSubmitting;
  els.measurementForm.querySelectorAll("input, select, button").forEach((element) => {
    element.disabled = isSubmitting;
  });
  els.childForm.querySelectorAll("input, select, button").forEach((element) => {
    element.disabled = isSubmitting;
  });
  if (!isSubmitting) {
    els.measurementChildSelect.disabled = !state.children.length;
  }
}

function adjustNumberInput(input, delta) {
  const current = numberOrNull(input.value) || 0;
  const next = Math.max(0, Math.round((current + delta) * 10) / 10);
  input.value = next.toFixed(1);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function isFutureDate(value) {
  const target = parseLocalDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target && target.getTime() > today.getTime();
}

function buildScales(datasets) {
  const scales = {
    x: {
      type: "linear",
      title: { display: true, text: "月齢" },
      ticks: {
        callback(value) {
          return formatAge(value);
        }
      }
    },
    y: {
      title: { display: true, text: state.mode === "weight" ? "体重 kg" : "身長 cm" },
      beginAtZero: false
    }
  };

  if (state.mode === "height" || state.mode === "both") {
    Object.assign(scales.y, buildAxisBounds(datasets, "y"));
  }

  if (state.mode === "both") {
    scales.y1 = {
      position: "right",
      title: { display: true, text: "体重 kg" },
      min: 0,
      max: 125,
      ticks: {
        stepSize: 10,
        callback(value) {
          return Number(value) <= 70 ? value : "";
        }
      },
      grid: { drawOnChartArea: false }
    };
  }

  return scales;
}

function buildAxisBounds(datasets, yAxisID) {
  const values = datasets
    .filter((dataset) => dataset.yAxisID === yAxisID)
    .flatMap((dataset) => dataset.data.map((point) => point.y))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return {};
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max(2, (max - min) * 0.06);

  return {
    min: Math.max(0, Math.floor((min - padding) / 5) * 5),
    max: Math.ceil((max + padding) / 5) * 5
  };
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle("error", isError);
}

function showMessage(title, body) {
  const visible = Boolean(title || body);
  els.messagePanel.hidden = !visible;
  els.messageTitle.textContent = title;
  els.messageBody.textContent = body;
}

function calculateAgeMonths(birthDate, date) {
  if (!birthDate || !date) {
    return null;
  }

  const born = new Date(birthDate);
  const measured = new Date(date);
  if (Number.isNaN(born.getTime()) || Number.isNaN(measured.getTime())) {
    return null;
  }

  const years = measured.getFullYear() - born.getFullYear();
  const months = measured.getMonth() - born.getMonth();
  const dayOffset = (measured.getDate() - born.getDate()) / 30.4375;
  return Math.max(0, Math.round((years * 12 + months + dayOffset) * 10) / 10);
}

function parseLocalDate(value) {
  if (!value) {
    return null;
  }

  const parts = String(value).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatAge(months) {
  const value = Number(months);
  if (!Number.isFinite(value)) {
    return "-";
  }

  const years = Math.floor(value / 12);
  const rest = Math.round(value % 12);
  return years ? `${years}歳${rest}か月` : `${rest}か月`;
}

function formatSdsLabel(value) {
  const number = numberOrNull(value);
  if (number === null) {
    return String(value);
  }
  return number > 0 ? `+${number}SD` : `${number}SD`;
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
