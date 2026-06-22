const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwwQ3VgW4YP2oKBWn0yBnkAn4mmv9e4qSKAp73Nz8GZ3Ziuy9Q7d97y1t2jJOriGO_KTA/exec";

const state = {
  children: [],
  curves: { height: [], weight: [] },
  selectedChildId: "",
  mode: "height",
  chart: null
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  loadGrowthData();
});

function bindElements() {
  els.status = document.getElementById("status");
  els.childSelect = document.getElementById("childSelect");
  els.modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));
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
  els.childSelect.addEventListener("change", () => {
    state.selectedChildId = els.childSelect.value;
    render();
  });

  els.modeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.mode = input.value;
      render();
    });
  });
}

async function loadGrowthData() {
  setStatus("読み込み中");
  showMessage("", "");

  try {
    const response = await fetch(GAS_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const normalized = normalizePayload(payload);

    if (!normalized.children.length) {
      throw new Error("子供データがありません");
    }

    state.children = normalized.children;
    state.curves = normalized.curves;
    state.selectedChildId = state.children[0].id;
    populateChildSelect();
    render();
    setStatus("読み込み完了");
  } catch (error) {
    setStatus("取得失敗", true);
    showMessage(
      "データ取得失敗",
      `GAS APIから成長データを取得できませんでした。GAS_API_URLとWebアプリの公開設定を確認してください。詳細: ${error.message}`
    );
    els.childSelect.innerHTML = '<option value="">取得失敗</option>';
    els.childSelect.disabled = true;
  }
}

function normalizePayload(payload) {
  const source = payload && payload.data ? payload.data : payload;
  const rawChildren = Array.isArray(source.children) ? source.children : buildChildrenFromRecords(source.records || source.measurements || []);
  const children = rawChildren.map(normalizeChild).filter((child) => child.measurements.length);
  const curves = normalizeCurves(source.sds || source.sdsCurves || source.curves || {});

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

function normalizeChild(child, index) {
  const birthDate = child.birthDate || child.birth_date || "";
  const measurements = Array.isArray(child.measurements) ? child.measurements : [];

  return {
    id: String(child.id || child.childId || child.name || `child-${index + 1}`),
    name: child.name || child.childName || `子供${index + 1}`,
    sex: child.sex || child.gender || "",
    birthDate,
    measurements: measurements.map((row) => normalizeMeasurement(row, birthDate)).filter(Boolean).sort((a, b) => a.ageMonths - b.ageMonths)
  };
}

function normalizeMeasurement(row, birthDate) {
  const date = row.date || row.measuredAt || row.measured_at || row.measurementDate || "";
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

function normalizeCurves(rawCurves) {
  return {
    height: normalizeMetricCurves(rawCurves.height || rawCurves.heightCm || rawCurves.stature || []),
    weight: normalizeMetricCurves(rawCurves.weight || rawCurves.weightKg || [])
  };
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
  els.childSelect.innerHTML = state.children.map((child) => (
    `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`
  )).join("");
  els.childSelect.value = state.selectedChildId;
  els.childSelect.disabled = false;
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
  if (state.mode === "height" || state.mode === "both") {
    datasets.push(...buildCurveDatasets("height", "身長SDS", "y"));
    datasets.push(buildMeasurementDataset(child.measurements, "height", "身長", "#2563eb", "y"));
  }

  if (state.mode === "weight" || state.mode === "both") {
    datasets.push(...buildCurveDatasets("weight", "体重SDS", state.mode === "both" ? "y1" : "y"));
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
      scales: buildScales()
    }
  });
}

function buildCurveDatasets(metric, labelPrefix, yAxisID) {
  const palette = {
    "-3": "#cbd5e1",
    "-2": "#94a3b8",
    "-1": "#64748b",
    "0": "#334155",
    "1": "#64748b",
    "2": "#94a3b8",
    "3": "#cbd5e1"
  };

  return state.curves[metric].map((curve) => ({
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

function buildScales() {
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

  if (state.mode === "both") {
    scales.y1 = {
      position: "right",
      title: { display: true, text: "体重 kg" },
      beginAtZero: false,
      grid: { drawOnChartArea: false }
    };
  }

  return scales;
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
