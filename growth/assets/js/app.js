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

const COMPARE_METRICS = {
  height: {
    label: "身長",
    unit: "cm",
    getValue: (row) => row.height
  },
  weight: {
    label: "体重",
    unit: "kg",
    getValue: (row) => row.weight
  }
};

const COMPARE_COLORS = ["#2563eb", "#f97316", "#16a34a", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

const COMPARE_SDS_BAND_COLORS = {
  male: "rgba(37, 99, 235, 0.08)",
  female: "rgba(219, 39, 119, 0.08)",
  unknown: "rgba(148, 163, 184, 0.07)"
};

const compareSdsBackgroundPlugin = {
  id: "compareSdsBackground",
  beforeDatasetsDraw(chart, args, options) {
    const bands = Array.isArray(options?.bands) ? options.bands : [];
    if (!bands.length || !chart.chartArea || !chart.scales.x || !chart.scales.y) {
      return;
    }

    const { ctx, chartArea } = chart;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    ctx.save();
    bands.forEach((band) => {
      drawSdsBand(ctx, chartArea, xScale, yScale, band);
    });
    ctx.restore();
  }
};

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
  els.compareViews = Array.from(document.querySelectorAll(".compare-view"));
  els.inputViews = Array.from(document.querySelectorAll(".input-view"));
  els.childSelect = document.getElementById("childSelect");
  els.measurementChildSelect = document.getElementById("measurementChildSelect");
  els.modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));
  els.compareModeInputs = Array.from(document.querySelectorAll('input[name="compareMode"]'));
  els.compareChildren = document.getElementById("compareChildren");
  els.compareWarning = document.getElementById("compareWarning");
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
  return child.measurements.some((row) => row.height !== null || row.weight !== null);
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
  const sdsState = getCompareSdsState(children, state.compareMode);
  const measurementDatasets = children.map((child, index) => buildCompareMeasurementDataset(child, metric, index)).filter(Boolean);
  const datasets = measurementDatasets;
  const selectedCount = state.compareSelectedChildIds.length;

  els.compareWarning.hidden = selectedCount <= 3;
  els.compareChartTitle.textContent = `${metric.label}比較`;
  els.compareNote.textContent = getCompareNote(measurementDatasets.length, sdsState);

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new Chart(els.compareChartCanvas, {
    type: "line",
    data: { datasets },
    plugins: [compareSdsBackgroundPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      parsing: false,
      plugins: {
        legend: {
          position: "bottom"
        },
        compareSdsBackground: {
          bands: sdsState.bands || []
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
              const value = Number.isFinite(point.y) ? `${point.y.toFixed(1)} ${metric.unit}` : "-";
              return [`測定日: ${point.date || "-"}`, `${metric.label}: ${value}`];
            }
          }
        }
      },
      scales: buildCompareScales(datasets, metric, sdsState.bands || [])
    }
  });
}

function getSelectedCompareChildren() {
  return state.compareSelectedChildIds
    .map((id) => state.children.find((child) => child.id === id))
    .filter(Boolean);
}

function getCompareNote(measurementCount, sdsState) {
  if (!measurementCount) {
    return "比較する子供を選択してください";
  }
  if (sdsState.reason) {
    return sdsState.reason;
  }
  return `${measurementCount}人の実測値を表示 / SDS帯は背景に表示`;
}

function getCompareSdsState(children, metricKey) {
  if (!children.length) {
    return { visible: false, bands: [], reason: "" };
  }

  const sexKeys = children.map((child) => normalizeSexKey(child.sex));
  const bands = buildCompareSdsBands(children, metricKey);
  if (!bands.length) {
    return { visible: false, bands: [], reason: "SDS帯データなし" };
  }

  if (sexKeys.some((sex) => !sex)) {
    return { visible: true, bands, reason: "性別が判定できない子供を含むため、SDS帯は参考表示" };
  }

  if (new Set(sexKeys).size > 1) {
    return { visible: true, bands, reason: "男女混在のため、SDS帯は参考表示" };
  }

  return { visible: true, bands, reason: "" };
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

function getChildCurvesForCompare(child, metricKey) {
  const sexCurves = getCurvesForSex(normalizeSexKey(child.sex));
  const curves = sexCurves || child.curves || state.curves;
  return curves && Array.isArray(curves[metricKey]) ? curves[metricKey] : [];
}

function buildCompareSdsBands(children, metricKey) {
  const bands = [];
  const seenSexes = new Set();

  children.forEach((child) => {
    const sexKey = normalizeSexKey(child.sex) || "unknown";
    if (seenSexes.has(sexKey)) {
      return;
    }

    const curves = getChildCurvesForCompare(child, metricKey);
    const lower = findSdsCurve(curves, -1);
    const upper = findSdsCurve(curves, 1);
    if (!lower || !upper) {
      return;
    }

    seenSexes.add(sexKey);
    bands.push({
      sexKey,
      lower: lower.points,
      upper: upper.points,
      color: COMPARE_SDS_BAND_COLORS[sexKey] || COMPARE_SDS_BAND_COLORS.unknown
    });
  });

  return bands;
}

function findSdsCurve(curves, sds) {
  return curves.find((curve) => curve.sds === sds);
}

function drawSdsBand(ctx, chartArea, xScale, yScale, band) {
  const lower = buildSdsBoundaryPoints(band.lower, xScale, yScale);
  const upper = buildSdsBoundaryPoints(band.upper, xScale, yScale);
  if (lower.length < 2 || upper.length < 2) {
    return;
  }

  ctx.beginPath();
  upper.forEach((point, index) => {
    const x = clamp(point.x, chartArea.left, chartArea.right);
    const y = clamp(point.y, chartArea.top, chartArea.bottom);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  [...lower].reverse().forEach((point) => {
    ctx.lineTo(
      clamp(point.x, chartArea.left, chartArea.right),
      clamp(point.y, chartArea.top, chartArea.bottom)
    );
  });

  ctx.closePath();
  ctx.fillStyle = band.color;
  ctx.fill();
}

function buildSdsBoundaryPoints(points, xScale, yScale) {
  const scaleMinX = numberOrNull(xScale.min);
  const scaleMaxX = numberOrNull(xScale.max);
  if (scaleMinX === null || scaleMaxX === null || scaleMinX === scaleMaxX) {
    return [];
  }

  const sorted = (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);

  if (sorted.length < 2) {
    return [];
  }

  const minX = Math.max(scaleMinX, sorted[0].x);
  const maxX = Math.min(scaleMaxX, sorted[sorted.length - 1].x);
  if (minX >= maxX) {
    return [];
  }

  const xs = [
    minX,
    ...sorted.map((point) => point.x).filter((x) => x > minX && x < maxX),
    maxX
  ];

  return xs.map((x) => {
    const y = interpolateSdsY(sorted, x);
    return y === null ? null : {
      x: xScale.getPixelForValue(x),
      y: yScale.getPixelForValue(y)
    };
  }).filter(Boolean);
}

function interpolateSdsY(points, x) {
  if (!points.length) {
    return null;
  }
  if (x <= points[0].x) {
    return points[0].y;
  }

  const last = points[points.length - 1];
  if (x >= last.x) {
    return last.y;
  }

  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (x > right.x) {
      continue;
    }
    if (right.x === left.x) {
      return right.y;
    }
    const ratio = (x - left.x) / (right.x - left.x);
    return left.y + (right.y - left.y) * ratio;
  }

  return last.y;
}

function buildCompareMeasurementDataset(child, metric, index) {
  const color = COMPARE_COLORS[index % COMPARE_COLORS.length];
  const data = child.measurements.map((row) => {
    const value = metric.getValue(row);
    return value === null ? null : {
      x: row.ageMonths,
      y: value,
      date: row.date,
      childName: child.name
    };
  }).filter(Boolean);

  if (!data.length) {
    return null;
  }

  return {
    label: child.name,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 3,
    pointRadius: 4,
    pointHoverRadius: 6,
    tension: 0.2,
    yAxisID: "y",
    isCompareMeasurement: true,
    order: 1
  };
}

function buildCompareScales(datasets, metric, sdsBands = []) {
  const axisDatasets = [
    ...datasets,
    ...buildSdsBandAxisDatasets(sdsBands)
  ];

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
      title: { display: true, text: `${metric.label} ${metric.unit}` },
      beginAtZero: false,
      ...buildAxisBounds(axisDatasets, "y")
    }
  };
}

function buildSdsBandAxisDatasets(sdsBands) {
  return (Array.isArray(sdsBands) ? sdsBands : []).flatMap((band) => [
    { data: band.lower || [], yAxisID: "y" },
    { data: band.upper || [], yAxisID: "y" }
  ]);
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
