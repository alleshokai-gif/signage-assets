const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwwQ3VgW4YP2oKBWn0yBnkAn4mmv9e4qSKAp73Nz8GZ3Ziuy9Q7d97y1t2jJOriGO_KTA/exec";

const state = {
  children: [],
  curves: { height: [], weight: [] },
  sexCurves: { male: { height: [], weight: [] }, female: { height: [], weight: [] } },
  selectedChildId: "",
  mode: "height",
  compareMode: "height",
  compareSelectedChildIds: [],
  chart: null,
  currentView: "chart",
  inputView: "measurement",
  isSubmitting: false,
  pendingSelectedChildId: ""
};

const els = {};
const JSONP_TIMEOUT_MS = 15000;
let growthDataTimeoutId = null;
let growthDataRequest = null;

const COMPARE_METRICS = {
  height: {
    key: "height",
    label: "身長",
    unit: "cm",
    decimals: 1,
    getValue: (row) => row.height
  },
  weight: {
    key: "weight",
    label: "体重",
    unit: "kg",
    decimals: 1,
    getValue: (row) => row.weight
  },
  bmi: {
    key: "bmi",
    label: "BMI",
    unit: "",
    decimals: 1,
    getValue: (row) => row.bmi
  }
};

const COMPARE_COLORS = ["#2563eb", "#f97316", "#16a34a", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

window.handleGrowthData = function(data) {
  if (growthDataTimeoutId) {
    clearTimeout(growthDataTimeoutId);
    growthDataTimeoutId = null;
  }

  showMessage("", "");
  const request = growthDataRequest;
  growthDataRequest = null;
  const initialized = initialize(data);

  if (request) {
    cleanupGrowthDataScript(request.script);
    if (initialized) {
      request.resolve(data);
    } else {
      request.reject(new Error("GAS APIから取得したデータを画面に反映できませんでした。"));
    }
  }
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
  els.compareViews = Array.from(document.querySelectorAll(".compare-view"));
  els.inputViews = Array.from(document.querySelectorAll(".input-view"));
  els.childSelect = document.getElementById("childSelect");
  els.measurementChildSelect = document.getElementById("measurementChildSelect");
  els.modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));
  els.compareModeInputs = Array.from(document.querySelectorAll('input[name="compareMode"]'));
  els.compareChildren = document.getElementById("compareChildren");
  els.compareWarning = document.getElementById("compareWarning");
  els.compareSummary = document.getElementById("compareSummary");
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
  els.compareChartTitle = document.getElementById("compareChartTitle");
  els.compareNote = document.getElementById("compareNote");
  els.compareChartCanvas = document.getElementById("compareChart");
  els.messagePanel = document.getElementById("messagePanel");
  els.messageTitle = document.getElementById("messageTitle");
  els.messageBody = document.getElementById("messageBody");
  els.latestDate = document.getElementById("latestDate");
  els.latestHeight = document.getElementById("latestHeight");
  els.latestWeight = document.getElementById("latestWeight");
  els.latestSds = document.getElementById("latestSds");
}

function bindEvents() {
  const today = formatDateInputValue(new Date());
  els.measurementDate.max = today;
  els.measurementDate.value = els.measurementDate.value || today;
  els.childBirthDateInput.max = today;
  els.heightInput.placeholder = "149.7";
  els.weightInput.placeholder = "52.3";
  els.fatherHeightInput.placeholder = "172.0";
  els.motherHeightInput.placeholder = "158.0";

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

  els.compareModeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.compareMode = input.value;
      renderCompareChart();
    });
  });

  els.compareChildren.addEventListener("change", (event) => {
    if (!event.target.matches('input[type="checkbox"][data-compare-child-id]')) {
      return;
    }

    const childId = event.target.dataset.compareChildId;
    if (event.target.checked) {
      state.compareSelectedChildIds = Array.from(new Set([...state.compareSelectedChildIds, childId]));
    } else {
      state.compareSelectedChildIds = state.compareSelectedChildIds.filter((id) => id !== childId);
    }
    renderCompareChart();
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

function reloadGrowthData(options = {}) {
  if (growthDataRequest) {
    growthDataRequest.reject(new Error("JSONP request was replaced"));
    growthDataRequest = null;
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      growthDataRequest = null;
      reject(new Error("JSONP callback timed out"));
    }, JSONP_TIMEOUT_MS + 1000);

    growthDataRequest = {
      script: null,
      resolve: (data) => {
        clearTimeout(timeoutId);
        resolve(data);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    };

    loadGrowthData();
    setStatus(options.statusText || "最新データ取得中...");
  });
}

function cleanupGrowthDataScript(script) {
  if (script && script.parentNode) {
    script.parentNode.removeChild(script);
  }
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
    state.sexCurves = normalized.sexCurves;
    state.selectedChildId = state.children.some((child) => child.id === previousSelectedChildId)
      ? previousSelectedChildId
      : state.children[0].id;
    state.compareSelectedChildIds = getInitialCompareChildIds(state.children, state.compareSelectedChildIds);
    state.pendingSelectedChildId = "";
    populateChildSelect();
    populateCompareChildren();
    render();
    renderView();
    setStatus("読み込み完了");
    return true;
  } catch (error) {
    handleGrowthDataError(error);
    return false;
  }
}

function handleGrowthDataError(error) {
  if (growthDataRequest) {
    const request = growthDataRequest;
    growthDataRequest = null;
    request.reject(error);
  }
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
  const sexCurves = normalizeSexCurves(source.sdsBySex || source.sexCurves || {}, source.rows || []);
  const children = rawChildren.map((child, index) => normalizeChild(child, index, curves, sexCurves));

  return { children, curves, sexCurves };
}

function buildChildrenFromRecords(records) {
  const map = new Map();

  records.forEach((record, index) => {
    const childId = String(record.childId || record.child_id || record.id || record.name || record.childName || "child");
    const child = map.get(childId) || {
      id: childId,
      name: record.childName || record.name || `子供${index + 1}`,
      sex: getRawSexValue(record),
      birthDate: record.birthDate || record.birth_date || "",
      measurements: []
    };

    child.measurements.push(record);
    map.set(childId, child);
  });

  return Array.from(map.values());
}

function normalizeChild(child, index, fallbackCurves, sexCurves) {
  const birthDate = child.birthDate || child.birth_date || "";
  const measurements = Array.isArray(child.measurements) ? child.measurements : Array.isArray(child.rows) ? child.rows : [];
  const curves = normalizeCurves(child.sds || child.sdsCurves || child.curves || {}, measurements);
  const sexKey = normalizeSexKey(getRawSexValue(child));

  return {
    id: String(child.id || child.childId || child.name || `child-${index + 1}`),
    name: child.name || child.childName || `子供${index + 1}`,
    sex: getRawSexValue(child),
    birthDate,
    curves: hasCurveData(curves) ? curves : getCurvesForSex(sexKey, sexCurves) || fallbackCurves,
    measurements: measurements.map((row) => normalizeMeasurement(row, birthDate)).filter(Boolean).sort((a, b) => a.ageMonths - b.ageMonths)
  };
}

function normalizeMeasurement(row, birthDate) {
  const date = row.date || row.recordDate || row.record_date || row.measuredAt || row.measured_at || row.measurementDate || "";
  const ageYears = numberOrNull(row.ageYears ?? row.age_years ?? row.years);
  const ageMonths = numberOrNull(row.ageMonths ?? row.age_months ?? row.months ?? (ageYears === null ? null : ageYears * 12) ?? calculateAgeMonths(birthDate, date));
  const height = numberOrNull(row.height ?? row.heightCm ?? row.height_cm);
  const weight = numberOrNull(row.weight ?? row.weightKg ?? row.weight_kg);
  const bmi = numberOrNull(row.bmi ?? row.BMI) ?? calculateBmi(height, weight);
  const heightSds = numberOrNull(row.heightSds ?? row.height_sds ?? row.sdsHeight);
  const weightSds = numberOrNull(row.weightSds ?? row.weight_sds ?? row.sdsWeight);

  if (ageMonths === null || (height === null && weight === null && bmi === null)) {
    return null;
  }

  return { date, ageMonths, height, weight, bmi, heightSds, weightSds };
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

function createEmptyCurves() {
  return { height: [], weight: [] };
}

function normalizeSexCurves(rawSexCurves, rows) {
  const rowCurves = normalizeSexCurvesFromRows(rows);
  const structuredCurves = {};

  Object.entries(rawSexCurves || {}).forEach(([sex, curves]) => {
    const sexKey = normalizeSexKey(sex);
    if (sexKey) {
      structuredCurves[sexKey] = normalizeCurves(curves, []);
    }
  });

  return {
    male: hasCurveData(structuredCurves.male) ? structuredCurves.male : rowCurves.male,
    female: hasCurveData(structuredCurves.female) ? structuredCurves.female : rowCurves.female
  };
}

function normalizeSexCurvesFromRows(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const result = {
    male: createEmptyCurves(),
    female: createEmptyCurves()
  };
  const sdsSpecs = [
    { key: "-2SD", altKeys: ["m2sd", "minus2sd", "sd_minus_2"], sds: -2 },
    { key: "-1SD", altKeys: ["m1sd", "minus1sd", "sd_minus_1"], sds: -1 },
    { key: "mean", altKeys: ["0SD", "0sd", "average"], sds: 0 },
    { key: "1SD", altKeys: ["p1sd", "plus1sd", "sd_plus_1"], sds: 1 },
    { key: "2SD", altKeys: ["p2sd", "plus2sd", "sd_plus_2"], sds: 2 }
  ];

  ["male", "female"].forEach((sexKey) => {
    ["height", "weight"].forEach((metricKey) => {
      result[sexKey][metricKey] = sdsSpecs.map((spec) => ({
        label: formatSdsLabel(spec.sds),
        sds: spec.sds,
        points: sourceRows.map((row) => {
          const rowSexKey = normalizeSexKey(row.gender ?? row.sex ?? row.genderId ?? row.gender_id);
          const rowMetricKey = normalizeSdsRowMetricKey(row);
          if (rowSexKey !== sexKey || rowMetricKey !== metricKey) {
            return null;
          }

          const ageMonths = numberOrNull(row.month ?? row.months ?? row.ageMonths ?? row.age_months ?? row.x);
          const value = numberOrNull(getFirstPresentValue(row, [spec.key, ...spec.altKeys]));
          return ageMonths === null || value === null ? null : { x: ageMonths, y: value };
        }).filter(Boolean).sort((a, b) => a.x - b.x)
      })).filter((curve) => curve.points.length);
    });
  });

  return result;
}

function normalizeSdsRowMetricKey(row) {
  const type = String(row.type ?? row.metric ?? row.kind ?? "").trim().toLowerCase();
  if (["1", "1.0", "height", "heightcm", "stature", "身長"].includes(type)) {
    return "height";
  }
  if (["2", "2.0", "weight", "weightkg", "体重"].includes(type)) {
    return "weight";
  }
  return "";
}

function getFirstPresentValue(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }
  return null;
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

function populateCompareChildren() {
  els.compareChildren.innerHTML = state.children.map((child) => {
    const hasData = hasAnyMeasurementValue(child);
    const checked = state.compareSelectedChildIds.includes(child.id);
    return `
      <label class="compare-child-option${hasData ? "" : " is-disabled"}">
        <input type="checkbox" data-compare-child-id="${escapeHtml(child.id)}"${checked ? " checked" : ""}${hasData ? "" : " disabled"}>
        <span>${escapeHtml(child.name)}</span>
      </label>
    `;
  }).join("");
}

function getInitialCompareChildIds(children, previousIds) {
  const availableIds = children.filter(hasAnyMeasurementValue).map((child) => child.id);
  const retainedIds = previousIds.filter((id) => availableIds.includes(id));
  return retainedIds.length ? retainedIds : availableIds.slice(0, 3);
}

function hasAnyMeasurementValue(child) {
  return child.measurements.some((row) => row.height !== null || row.weight !== null || row.bmi !== null);
}

function render() {
  const child = getSelectedChild();
  if (!child) {
    return;
  }

  updateSummary(child);
  if (state.currentView === "compare") {
    renderCompareChart();
  } else {
    renderChart(child);
  }
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

function renderCompareChart() {
  if (!els.compareChartCanvas) {
    return;
  }

  const metric = COMPARE_METRICS[state.compareMode] || COMPARE_METRICS.height;
  const children = getSelectedCompareChildren();
  const measurementDatasets = children.map((child, index) => buildCompareMeasurementDataset(child, metric, index)).filter(Boolean);
  const datasets = measurementDatasets;
  const selectedCount = state.compareSelectedChildIds.length;

  els.compareWarning.hidden = selectedCount <= 3;
  els.compareChartTitle.textContent = `${metric.label}比較`;
  els.compareNote.textContent = getCompareNote(measurementDatasets.length);
  renderCompareSummary(children);

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new Chart(els.compareChartCanvas, {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      parsing: false,
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            boxWidth: 14,
            boxHeight: 3,
            padding: 14,
            usePointStyle: true,
            pointStyle: "line"
          }
        },
        tooltip: {
          filter(item) {
            return item.dataset.isCompareMeasurement;
          },
          callbacks: {
            title(items) {
              const point = items[0].raw;
              return `${point.childName} / ${formatAge(point.x)}`;
            },
            label(item) {
              const point = item.raw;
              return [`測定日: ${point.date || "-"}`, `${metric.label}: ${formatMetricValue(point.y, metric)}`];
            }
          }
        }
      },
      scales: buildCompareScales(datasets, metric)
    }
  });
}

function getSelectedCompareChildren() {
  return state.compareSelectedChildIds
    .map((id) => state.children.find((child) => child.id === id))
    .filter(Boolean);
}

function getCompareNote(measurementCount) {
  if (!measurementCount) {
    return "比較する子供を選択してください";
  }
  return `${measurementCount}人の実測値のみを表示`;
}

function renderCompareSummary(children) {
  if (!els.compareSummary) {
    return;
  }

  if (!children.length) {
    els.compareSummary.innerHTML = "";
    return;
  }

  els.compareSummary.innerHTML = children.map((child, index) => {
    const latest = child.measurements[child.measurements.length - 1] || {};
    const color = COMPARE_COLORS[index % COMPARE_COLORS.length];
    return `
      <article class="compare-summary-card" style="--compare-color: ${color}">
        <h3>${escapeHtml(child.name)}</h3>
        <dl>
          <div><dt>最新測定日</dt><dd>${escapeHtml(latest.date || "-")}</dd></div>
          <div><dt>最新身長</dt><dd>${formatNullableNumber(latest.height, "cm")}</dd></div>
          <div><dt>最新体重</dt><dd>${formatNullableNumber(latest.weight, "kg")}</dd></div>
          <div><dt>最新BMI</dt><dd>${formatNullableNumber(latest.bmi, "")}</dd></div>
          <div><dt>身長SDS</dt><dd>${formatSdsValue(latest.heightSds)}</dd></div>
          <div><dt>体重SDS</dt><dd>${formatSdsValue(latest.weightSds)}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

function getRawSexValue(source) {
  return source.sex
    ?? source.gender
    ?? source.sexId
    ?? source.sex_id
    ?? source.genderId
    ?? source.gender_id
    ?? source.sexCode
    ?? source.sex_code
    ?? source["性別"]
    ?? "";
}

function normalizeSexKey(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "1.0", "male", "m", "boy", "男", "男子", "男児", "男性", "男の子"].includes(text)) {
    return "male";
  }
  if (["0", "0.0", "2", "2.0", "female", "f", "girl", "女", "女子", "女児", "女性", "女の子"].includes(text)) {
    return "female";
  }
  return "";
}

function getCurvesForSex(sexKey, sexCurves = state.sexCurves) {
  if (!sexKey || !sexCurves || !hasCurveData(sexCurves[sexKey])) {
    return null;
  }
  return sexCurves[sexKey];
}

function buildCompareMeasurementDataset(child, metric, index) {
  const color = COMPARE_COLORS[index % COMPARE_COLORS.length];
  const data = metric.key === "bmi"
    ? buildBmiComparePoints(child)
    : buildStandardComparePoints(child, metric);

  if (!data.length) {
    return null;
  }

  return {
    label: child.name,
    data,
    borderColor: color,
    backgroundColor: "#ffffff",
    borderWidth: 3.5,
    pointRadius: 4.5,
    pointHoverRadius: 7,
    pointBorderColor: color,
    pointBackgroundColor: "#ffffff",
    pointBorderWidth: 2,
    tension: 0.18,
    yAxisID: "y",
    isCompareMeasurement: true,
    order: 1
  };
}

function buildStandardComparePoints(child, metric) {
  return child.measurements.map((row) => {
    const value = metric.getValue(row);
    return value === null ? null : buildComparePoint(row, child.name, value);
  }).filter(Boolean);
}

function buildBmiComparePoints(child) {
  logBmiDebugRows(child);

  const points = child.measurements.map((row) => {
    const value = getBmiCompareValue(row);
    return value === null ? null : buildComparePoint(row, child.name, value);
  }).filter(Boolean);

  console.log("BMI points", child.name, points.length);
  return points;
}

function logBmiDebugRows(child) {
  if (!["はのん", "ふうが", "りお"].includes(child.name)) {
    return;
  }

  const firstRow = child.measurements[0] || null;
  const latestRow = child.measurements[child.measurements.length - 1] || null;
  console.log("BMI debug child", child.name, "rows", child.measurements.length);
  logBmiDebugRow(child.name, "first", firstRow);
  logBmiDebugRow(child.name, "latest", latestRow);
}

function logBmiDebugRow(childName, label, row) {
  console.log("BMI debug row", childName, label, row);
  console.log("BMI debug keys", childName, label, row ? Object.keys(row) : []);
  console.log("BMI debug values", childName, label, {
    height: row?.height,
    weight: row?.weight,
    height_cm: row?.height_cm,
    weight_kg: row?.weight_kg,
    bmi: row?.bmi,
    parsedHeight: numberOrNull(row?.height_cm ?? row?.heightCm ?? row?.height),
    parsedWeight: numberOrNull(row?.weight_kg ?? row?.weightKg ?? row?.weight),
    parsedBmi: numberOrNull(row?.bmi)
  });
}

function getBmiCompareValue(row) {
  const bmi = numberOrNull(row.bmi);
  if (bmi !== null) {
    return bmi;
  }

  const heightCm = numberOrNull(row.height_cm ?? row.heightCm ?? row.height);
  const weightKg = numberOrNull(row.weight_kg ?? row.weightKg ?? row.weight);
  return calculateBmi(heightCm, weightKg);
}

function buildComparePoint(row, childName, value) {
  if (!Number.isFinite(row.ageMonths) || !Number.isFinite(value)) {
    return null;
  }

  return {
    x: row.ageMonths,
    y: value,
    date: row.date,
    childName
  };
}

function formatMetricValue(value, metric) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  const formatted = value.toFixed(metric.decimals ?? 1);
  return metric.unit ? `${formatted} ${metric.unit}` : formatted;
}

function buildCompareScales(datasets, metric) {
  return {
    x: {
      type: "linear",
      title: { display: true, text: "年齢" },
      ticks: {
        callback(value) {
          return formatAge(value);
        }
      }
    },
    y: {
      title: { display: true, text: metric.unit ? `${metric.label} ${metric.unit}` : metric.label },
      beginAtZero: false,
      ...buildAxisBounds(datasets, "y")
    }
  };
}

function renderView() {
  const isChart = state.currentView === "chart";
  const isCompare = state.currentView === "compare";
  const isInput = state.currentView === "input";

  els.mainTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.currentView);
  });
  els.chartViews.forEach((view) => {
    view.hidden = !isChart;
  });
  els.compareViews.forEach((view) => {
    view.hidden = !isCompare;
  });
  els.inputViews.forEach((view) => {
    view.hidden = !isInput;
  });

  if (isCompare) {
    renderCompareChart();
  } else if (isChart) {
    render();
  } else {
    renderInputView();
  }
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
  setSubmitting(true, "保存中...");
  showMessage("", "");
  setStatus("保存中...");

  try {
    const response = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const result = await parseJsonResponse(response);

    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }

    if (onSuccess) {
      onSuccess(result);
    }
    try {
      await reloadGrowthData({ statusText: "最新データ取得中...", clearMessage: false });
      setStatus("保存完了");
    } catch (reloadError) {
      setStatus("再取得失敗", true);
      showMessage("再取得失敗", `保存は完了しましたが、最新データを再取得できませんでした。詳細: ${reloadError.message}`);
    }
  } catch (error) {
    setStatus("保存失敗", true);
    showMessage("保存失敗", `GASから返ったエラー: ${error.message}`);
  } finally {
    setSubmitting(false);
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`GASの応答をJSONとして読めませんでした。HTTP ${response.status}`);
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
  if (isFutureDate(payload.birthDate)) {
    return "生年月日は未来日にできません。";
  }
  if (payload.heightFather !== "" && numberOrNull(payload.heightFather) === null) {
    return "父身長は数値で入力してください。";
  }
  if (payload.heightMother !== "" && numberOrNull(payload.heightMother) === null) {
    return "母身長は数値で入力してください。";
  }
  return "";
}

function setSubmitting(isSubmitting, label = "保存中...") {
  state.isSubmitting = isSubmitting;
  els.measurementSubmit.disabled = isSubmitting;
  els.childSubmit.disabled = isSubmitting;
  updateSubmitButtonText(els.measurementSubmit, isSubmitting, label);
  updateSubmitButtonText(els.childSubmit, isSubmitting, label);
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

function updateSubmitButtonText(button, isSubmitting, label) {
  if (!button) {
    return;
  }

  if (!button.dataset.idleText) {
    button.dataset.idleText = button.textContent;
  }
  button.textContent = isSubmitting ? label : button.dataset.idleText;
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

function calculateBmi(heightCm, weightKg) {
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg) || heightCm <= 0 || weightKg <= 0) {
    return null;
  }

  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
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

function formatNullableNumber(value, unit, decimals = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const formatted = value.toFixed(decimals);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatSdsValue(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
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
