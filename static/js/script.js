/* ============================================================
   ROADSENSE AI — script.js
   Structured clearly: each section does one job.
============================================================ */

/* Quick DOM helpers */
const el  = id  => document.getElementById(id);
const all = sel => document.querySelectorAll(sel);


/* ============================================================
   SECTION 1 — LOADER
   Draws a 3D road on canvas + runs the progress animation
============================================================ */
function runLoader() {
  const canvas = el("loaderCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  /* Resize canvas to fill the screen */
  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const cx = canvas.width  / 2; // centre X
  const cy = canvas.height / 2; // centre Y

  let dashOffset = 0; // animates road dashes scrolling toward viewer
  let frame = 0;

  /* Status messages that cycle during load */
  const statuses = [
    "Initialising systems…",
    "Loading ML model…",
    "Connecting city network…",
    "Calibrating risk vectors…",
    "System ready."
  ];
  let statusIndex = 0;
  const statusInterval = setInterval(() => {
    statusIndex = Math.min(statusIndex + 1, statuses.length - 1);
    if (el("loaderStatus")) el("loaderStatus").textContent = statuses[statusIndex];
  }, 600);

  function drawRoad() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;
    dashOffset += 6; // how fast dashes scroll

    /* Dark background gradient — sky to road */
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0,   "#030810");
    bgGrad.addColorStop(0.5, "#060f12");
    bgGrad.addColorStop(1,   "#0a1a14");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* Road surface — dark grey trapezoid converging at vanishing point */
    const vanishX = cx;
    const vanishY = cy - 60; // slightly above centre
    const roadBaseHalfWidth = canvas.width * 0.42;

    ctx.beginPath();
    ctx.moveTo(vanishX - 8, vanishY);   // top-left (narrow at horizon)
    ctx.lineTo(vanishX + 8, vanishY);   // top-right
    ctx.lineTo(cx + roadBaseHalfWidth, canvas.height + 20); // bottom-right
    ctx.lineTo(cx - roadBaseHalfWidth, canvas.height + 20); // bottom-left
    ctx.closePath();

    const roadGrad = ctx.createLinearGradient(0, vanishY, 0, canvas.height);
    roadGrad.addColorStop(0,   "rgba(0,20,16,0.6)");
    roadGrad.addColorStop(1,   "rgba(0,30,22,0.95)");
    ctx.fillStyle = roadGrad;
    ctx.fill();

    /* Road edge lines glowing teal */
    function drawEdgeLine(side) {
      const sign = side === "left" ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(vanishX + sign * 8, vanishY);
      ctx.lineTo(cx + sign * roadBaseHalfWidth, canvas.height + 20);
      ctx.strokeStyle = "rgba(0,229,204,0.5)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#00e5cc";
      ctx.shadowBlur  = 12;
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }
    drawEdgeLine("left");
    drawEdgeLine("right");

    /* Centre dashes that scroll toward viewer — gives 3D road-rushing effect */
    const numDashes = 12;
    for (let i = 0; i < numDashes; i++) {
      /* t goes from 0 (near horizon) to 1 (at viewer) */
      const t = ((i / numDashes) + (dashOffset % canvas.height) / canvas.height) % 1;
      const tSquared = Math.pow(t, 2.5); /* perspective squish near horizon */

      const dashY     = vanishY + (canvas.height - vanishY) * t;
      const dashWidth = 4 * tSquared * 50;   // dash grows as it comes closer
      const dashH     = 40 * tSquared;        // dash height grows too
      const dashX     = cx - dashWidth / 2;
      const alpha     = t * 0.8; // fades at horizon

      ctx.fillStyle = `rgba(0,229,204,${alpha})`;
      ctx.shadowColor = "#00e5cc";
      ctx.shadowBlur  = 8 * t;
      ctx.fillRect(dashX, dashY - dashH / 2, dashWidth, dashH);
      ctx.shadowBlur = 0;
    }

    /* Faint horizontal grid lines for depth */
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const gridY = vanishY + (canvas.height - vanishY) * t;
      const spread = roadBaseHalfWidth * t;
      ctx.beginPath();
      ctx.moveTo(cx - spread, gridY);
      ctx.lineTo(cx + spread, gridY);
      ctx.strokeStyle = `rgba(0,229,204,${0.04 * t})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    /* Ambient glow at vanishing point */
    const vpGlow = ctx.createRadialGradient(vanishX, vanishY, 0, vanishX, vanishY, 200);
    vpGlow.addColorStop(0,   "rgba(0,229,204,0.12)");
    vpGlow.addColorStop(1,   "transparent");
    ctx.fillStyle = vpGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (frame < 200) requestAnimationFrame(drawRoad); // ~3.3 seconds at 60fps
    else clearInterval(statusInterval);
  }

  drawRoad();
}


/* ============================================================
   SECTION 2 — CLOCK
   Updates the top-right system time every second
============================================================ */
function startClock() {
  function tick() {
    const now  = new Date();
    const hh   = String(now.getHours()).padStart(2,"0");
    const mm   = String(now.getMinutes()).padStart(2,"0");
    const ss   = String(now.getSeconds()).padStart(2,"0");
    if (el("systemTime")) el("systemTime").textContent = `${hh}:${mm}:${ss}`;
  }
  tick();
  setInterval(tick, 1000);
}


/* ============================================================
   SECTION 3 — TAB SWITCHING
   Switches between Predict / Analysis / Heatmap / SafeRoute
============================================================ */
const PAGE_META = {
  predict:   { title: "SYSTEM CONTROL",    sub: "RISK PREDICTION MODULE" },
  analysis:  { title: "ROUTE SAFETY ANALYSIS", sub: "GRAPHICAL RISK BREAKDOWN" },
  heatmap:   { title: "NETWORK HEATMAP",   sub: "STATE RISK INDEX" },
  saferoute: { title: "ROUTE PLANNER",     sub: "SAFEROUTE AI MODULE" },
  admin:     { title: "ADMIN DASHBOARD",   sub: "ROAD STATUS & MODEL MANAGEMENT" },
};

function setupTabs() {
  all(".nav-icon").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;

      all(".nav-icon").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      all(".tab-page").forEach(p => p.classList.remove("active"));
      el("tab-" + tabName).classList.add("active");

      const meta = PAGE_META[tabName];
      if (meta) {
        el("pageTitle").textContent    = meta.title;
        el("pageSubtitle").textContent = meta.sub;
      }

      /* Mobile: scroll content area back to top when switching tabs */
      const mainContent = document.querySelector(".main-content");
      if (mainContent) mainContent.scrollTop = 0;
      window.scrollTo(0, 0);

      /* SafeRoute: Google Maps needs a resize trigger after becoming visible.
         Without this the map renders grey/blank on mobile. */
      if (tabName === "saferoute" && typeof google !== "undefined" && gMap) {
        setTimeout(() => google.maps.event.trigger(gMap, "resize"), 150);
      }

      /* Admin: require password before opening */
      if (tabName === "admin") {
        if (!window._adminUnlocked) {
          showAdminLogin();
          return; /* don't switch tab yet */
        }
        loadRoadStatus();
      }

      /* Heatmap: SVG map uses container dimensions — rebuild when tab opens
         so it fills the correct mobile size (not desktop size from initial load) */
      if (tabName === "heatmap") {
        setTimeout(() => loadHeatmap(), 150);
      }
    });
  });
}


/* ============================================================
   SECTION 4 — SEGMENTED CONTROLS
   Handles Day/Night, Low/Med/High, Male/Female toggles
============================================================ */
function wireSegControl(groupId, hiddenInputId) {
  const group = el(groupId);
  if (!group) return;

  group.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      group.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      el(hiddenInputId).value = btn.dataset.val;
    });
  });
}

/* Wire all toggle groups */
wireSegControl("timeToggle",    "timeInput");
wireSegControl("speedToggle",   "speedInput");
wireSegControl("genderToggle",  "genderInput");
wireSegControl("alcoholToggle", "alcoholInput");
wireSegControl("srTimeToggle",  "srTimeInput");
wireSegControl("srSpeedToggle", "srSpeedInput");

/* Programmatically set a seg control (used by weather auto-fill) */
function setSegValue(groupId, hiddenInputId, value) {
  const group = el(groupId);
  if (!group) return;
  group.querySelectorAll(".seg-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === value);
  });
  el(hiddenInputId).value = value;
}


/* ============================================================
   SECTION 5 — CIRCULAR GAUGE (canvas)
   Draws the animated arc gauge that shows risk %
============================================================ */
function drawGauge(canvasId, percentage, color) {
  const canvas = el(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W   = canvas.width;
  const H   = canvas.height;
  const cx  = W / 2;
  const cy  = H / 2;
  const r   = Math.min(W, H) * 0.38; // radius = 38% of smallest dimension

  ctx.clearRect(0, 0, W, H);

  /* Background arc (grey track) */
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth   = 10;
  ctx.lineCap     = "round";
  ctx.stroke();

  /* Glow ring behind the fill arc */
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + (Math.PI * 1.5 * percentage / 100));
  ctx.strokeStyle = color;
  ctx.lineWidth   = 14;
  ctx.globalAlpha = 0.15;
  ctx.stroke();
  ctx.globalAlpha = 1;

  /* Main coloured fill arc */
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + (Math.PI * 1.5 * percentage / 100));
  ctx.strokeStyle = color;
  ctx.lineWidth   = 10;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 16;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  /* Small tick marks around the arc */
  for (let i = 0; i <= 10; i++) {
    const angle = Math.PI * 0.75 + (Math.PI * 1.5 * i / 10);
    const inner = r - 16;
    const outer = r - 10;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth   = 1;
    ctx.stroke();
  }
}

/* Animated gauge — smoothly counts up from 0 to target */
function animateGauge(canvasId, targetPct, color, labelId, pctId) {
  let current = 0;
  const step  = targetPct / 40; // 40 frames to reach target
  const timer = setInterval(() => {
    current = Math.min(current + step, targetPct);
    drawGauge(canvasId, current, color);
    if (pctId)   el(pctId).textContent   = Math.round(current) + "%";
    if (labelId) el(labelId).textContent = getGaugeLabel(targetPct);
    if (current >= targetPct) clearInterval(timer);
  }, 16); // ~60fps
}

function getGaugeLabel(pct) {
  if (pct < 35) return "LOW RISK";
  if (pct < 65) return "MODERATE";
  return "HIGH RISK";
}

/* Idle gauge — just draws the ring with no fill */
function drawIdleGauge() {
  const canvas = el("idleGauge");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const cx  = canvas.width  / 2;
  const cy  = canvas.height / 2;
  const r   = Math.min(canvas.width, canvas.height) * 0.38;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
  ctx.strokeStyle = "rgba(0,229,204,0.12)";
  ctx.lineWidth   = 10;
  ctx.lineCap     = "round";
  ctx.stroke();

  /* Animated rotating dash */
  const angle = Date.now() / 800;
  ctx.beginPath();
  ctx.arc(cx, cy, r, angle, angle + 0.5);
  ctx.strokeStyle = "rgba(0,229,204,0.5)";
  ctx.lineWidth   = 10;
  ctx.shadowColor = "#00e5cc";
  ctx.shadowBlur  = 12;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  requestAnimationFrame(drawIdleGauge);
}


/* ============================================================
   SECTION 6 — STATE / CITY DROPDOWNS
   Fetches state→city data from Flask, populates dropdowns
============================================================ */
let cityData = {}; // Global: { "Delhi": ["Delhi", "Delhi Urban", ...], ... }

async function loadCityData() {
  const res  = await fetch("/api/cities");
  cityData   = await res.json();

  const stateDropdown = el("stateSelect");
  stateDropdown.innerHTML = '<option value="">— Select State —</option>';

  Object.keys(cityData).sort().forEach(state => {
    const opt = document.createElement("option");
    opt.value = state; opt.textContent = state;
    stateDropdown.appendChild(opt);
  });
}

el("stateSelect").addEventListener("change", function () {
  const cityDropdown = el("citySelect");
  cityDropdown.innerHTML = '<option value="">— Select City —</option>';

  (cityData[this.value] || []).forEach(city => {
    const opt = document.createElement("option");
    opt.value = city; opt.textContent = city;
    cityDropdown.appendChild(opt);
  });

  const firstCity = (cityData[this.value] || [])[0];
  if (firstCity) {
    const dateIn = el("travelDateInput");
    fetchWeather(firstCity, "predict", dateIn ? dateIn.value : null);
  }

  const rtype = document.querySelector('select[name="road_type"]');
  if (rtype) fetchRoadStatus(this.value, el("citySelect").value, rtype.value);
});

// citySelect change is handled below
const roadTypeSelectEl = document.querySelector('select[name="road_type"]');
roadTypeSelectEl && roadTypeSelectEl.addEventListener("change", function () {
  fetchRoadStatus(el("stateSelect").value, el("citySelect").value, this.value);
});

el("citySelect") && el("citySelect").addEventListener("change", function () {
  if (this.value) {
    const dateIn = el("travelDateInput");
    fetchWeather(this.value, "predict", dateIn ? dateIn.value : null);
  }
  const rtype = document.querySelector('select[name="road_type"]');
  if (rtype) fetchRoadStatus(el("stateSelect").value, this.value, rtype.value);
});


/* ============================================================
   ROAD STATUS AUTO-FILL — state + city + road_type
============================================================ */
async function fetchRoadStatus(state, city, roadType) {
  const roadCondHidden = el("roadCondHidden");
  const roadCondManual = el("roadCondManualWrap");
  const roadCondSelect = el("roadCondSelect");
  const chipEl         = el("roadStatusChip");

  // Reset
  if (roadCondManual) roadCondManual.style.display = "none";
  if (roadCondHidden) { roadCondHidden.disabled = false; roadCondHidden.value = "Dry"; }
  if (chipEl)         chipEl.style.display = "none";

  if (!state || !roadType) {
    if (roadCondManual) roadCondManual.style.display = "";
    if (roadCondHidden) roadCondHidden.disabled = true;
    return;
  }

  try {
    const url  = `/api/road-status-lookup?state=${encodeURIComponent(state)}&city=${encodeURIComponent(city || "")}&road_type=${encodeURIComponent(roadType)}`;
    const res  = await fetch(url);
    const data = await res.json();
    const entry = (data.entries || [])[0];

    if (!entry) {
      if (roadCondManual) roadCondManual.style.display = "";
      if (roadCondHidden) roadCondHidden.disabled = true;
      return;
    }

    if (roadCondHidden) { roadCondHidden.value = entry.condition; roadCondHidden.disabled = false; }
    if (roadCondManual) roadCondManual.style.display = "none";

    if (chipEl) {
      chipEl.style.display = "flex";
      chipEl.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Road data from admin &nbsp;·&nbsp; <strong>${entry.road_type}</strong> &nbsp;·&nbsp; <strong>${entry.condition}</strong>
        ${entry.updated ? `<span style="opacity:.5;font-size:10px;margin-left:4px">· ${entry.updated}</span>` : ""}
        <button id="roadStatusOverrideBtn" style="margin-left:8px;background:none;border:none;color:var(--accent);cursor:pointer;font-size:10px;padding:0;opacity:.7">unlock</button>
      `;
      el("roadStatusOverrideBtn") && el("roadStatusOverrideBtn").addEventListener("click", () => {
        if (roadCondManual) roadCondManual.style.display = "";
        if (roadCondHidden) roadCondHidden.disabled = true;
        if (roadCondSelect && entry.condition) roadCondSelect.value = entry.condition;
        chipEl.style.display = "none";
      });
    }
  } catch(e) {
    if (roadCondManual) roadCondManual.style.display = "";
    if (roadCondHidden) roadCondHidden.disabled = true;
  }
}


/* ============================================================
   SECTION 7 — LIVE WEATHER AUTO-FILL
   Fetches real Google Weather, shows chip, fills controls
============================================================ */
let predictWeather  = null;
let saferouteWeather = null;

async function fetchWeather(cityName, target, date) {
  try {
    let url = `/api/weather?city=${encodeURIComponent(cityName)}`;
    if (date) url += `&date=${date}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (target === "predict") {
      predictWeather = data;
      showWeatherChip("weatherChip", "weatherChipText", data);
    } else {
      saferouteWeather = data;
      showWeatherChip("srWeatherChip", "srWeatherChipText", data);
    }
  } catch {
    autoSetTime(target);
  }
}

function showWeatherChip(chipId, textId, data) {
  const chip = el(chipId);
  if (data.source === "google" || data.source === "google_forecast") {
    let text = data.description || "Weather";
    if (data.forecast_day > 0) text = "📅 Day +" + data.forecast_day + ": " + text;
    if (data.temp     != null) text += " · " + data.temp + "°C";
    if (data.humidity != null) text += " · 💧" + data.humidity + "%";
    if (data.rain_prob > 0)    text += " · " + data.rain_prob + "% rain";
    el(textId).textContent = text;
    chip.style.display = "flex";
    const note = el("dateForecastNote");
    if (note) note.style.display = (data.forecast_day > 0) ? "block" : "none";
  } else {
    autoSetTime(chipId.includes("sr") ? "saferoute" : "predict");
    chip.style.display = "none";
  }
}

function autoSetTime(target) {
  const hour  = new Date().getHours();
  const value = (hour >= 6 && hour < 18) ? "Day" : "Night";
  if (target === "predict")   setSegValue("timeToggle",   "timeInput",   value);
  else                        setSegValue("srTimeToggle",  "srTimeInput", value);
}

function applyWeather(data, target) {
  if (!data) return;
  if (target === "predict") {
    el("weatherSelect").value = data.weather || "Clear";
    if (data.time) setSegValue("timeToggle", "timeInput", data.time);
    const lightSel = document.querySelector('select[name="lighting"]');
    if (lightSel) lightSel.value = data.time === "Night" ? "Dark" : "Daylight";
    if (data.weather === "Rainy" || data.weather === "Stormy") {
      const roadHidden = el("roadCondHidden");
      const roadManual = el("roadCondSelect");
      const manualWrap = el("roadCondManualWrap");
      // Only override if not already locked by admin data
      if (manualWrap && manualWrap.style.display !== "none" && roadManual) roadManual.value = "Wet";
      if (roadHidden && !roadHidden.disabled) roadHidden.value = "Wet";
    }
    el("weatherChip").style.display = "none";
  } else {
    el("srWeather").value = data.weather || "Clear";
    if (data.time) setSegValue("srTimeToggle", "srTimeInput", data.time);
    if (data.weather === "Stormy" || data.weather === "Foggy") {
      setSegValue("srSpeedToggle", "srSpeedInput", "Low");
    } else if (data.weather === "Rainy") {
      setSegValue("srSpeedToggle", "srSpeedInput", "Moderate");
    }
    el("srWeatherChip").style.display = "none";
  }
}

el("applyWeatherBtn").addEventListener("click",   () => applyWeather(predictWeather,   "predict"));
el("srApplyWeatherBtn").addEventListener("click", () => applyWeather(saferouteWeather, "saferoute"));

/* SafeRoute origin field — fetch weather as user types (debounced) */
let weatherTimer = null;
el("srOrigin").addEventListener("input", function () {
  clearTimeout(weatherTimer);
  if (this.value.trim().length >= 3) {
    weatherTimer = setTimeout(() => fetchWeather(this.value.trim(), "saferoute"), 800);
  } else {
    el("srWeatherChip").style.display = "none";
  }
});
el("srOrigin").addEventListener("blur", function () {
  if (this.value.trim().length >= 3) fetchWeather(this.value.trim(), "saferoute");
});


/* ============================================================
   SECTION 8 — PREDICTION FORM
   Submits form, calls /api/predict, renders all results
============================================================ */
el("predictForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const btn = el("predictBtn");
  setLoading(btn, true);
  el("errorBanner").style.display = "none";

  // If manual surface select is visible, sync its value to the hidden input
  const manualWrap   = el("roadCondManualWrap");
  const roadCondSel  = el("roadCondSelect");
  const roadCondHid  = el("roadCondHidden");
  if (manualWrap && manualWrap.style.display !== "none" && roadCondSel && roadCondHid) {
    roadCondHid.value    = roadCondSel.value;
    roadCondHid.disabled = false;
  }

  /* Collect all form values */
  const payload = {};
  for (const [k, v] of new FormData(this).entries()) payload[k] = v;

  try {
    const res  = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    renderPredictionResults(data);

  } catch (err) {
    el("errorMsg").textContent       = err.message || "Prediction failed.";
    el("errorBanner").style.display  = "flex";
  } finally {
    setLoading(btn, false);
  }
});

function setLoading(btn, on) {
  btn.disabled = on;
  btn.querySelector(".exec-normal").style.display  = on ? "none" : "flex";
  btn.querySelector(".exec-loading").style.display = on ? "flex"  : "none";
}

el("resetBtn").addEventListener("click", () => {
  el("resultsWrap").style.display  = "none";
  el("welcomePanel").style.display = "flex";
  el("errorBanner").style.display  = "none";
});


/* ============================================================
   SECTION 9 — RENDER PREDICTION RESULTS
   Updates gauge, severity card, 3 analysis cards, insights
============================================================ */
let latestResult = null; // Store globally so Analysis tab can use it

function renderPredictionResults(data) {
  latestResult = data; // Save for Analysis tab charts
  const { severity, probabilities, state_risk, local_score, insights, shap } = data;

  /* Switch from welcome to results */
  el("welcomePanel").style.display = "none";
  el("resultsWrap").style.display  = "block";

  /* ── Severity card ── */
  const severityCard = el("severityCard");
  const sevEl        = el("severityValue");

  sevEl.className = `readout-value is-${severity.toLowerCase()}`;
  sevEl.textContent = severity.toUpperCase();

  const descMap = {
    Fatal:   "Life-threatening conditions detected. Avoid travel if possible.",
    Serious: "Elevated risk — significant injuries possible. Drive with caution.",
    Minor:   "Low risk conditions — standard safety precautions apply.",
  };
  el("severityDesc").textContent = descMap[severity] || "";

  /* ── Circular gauge ── */
  const fatalPct = Math.round((probabilities.Fatal || 0) * 100);
  const colorMap = { Minor: "#2ed573", Serious: "#ffa502", Fatal: "#ff4757" };
  const gaugeColor = colorMap[severity] || "#00e5cc";

  el("gaugePct").style.color = gaugeColor;
  el("gaugePct").style.textShadow = `0 0 20px ${gaugeColor}`;

  animateGauge("resultGauge", fatalPct + (probabilities.Serious || 0) * 50, gaugeColor, "gaugeLabel", "gaugePct");

  /* ── Probability bars (left card) ── */
  const probContainer = el("probBars");
  probContainer.innerHTML = "";
  [
    { label:"MINOR",   cls:"prob-row-minor",   val: probabilities.Minor   },
    { label:"SERIOUS", cls:"prob-row-serious",  val: probabilities.Serious },
    { label:"FATAL",   cls:"prob-row-fatal",    val: probabilities.Fatal   },
  ].forEach(bar => {
    const pct = Math.round((bar.val || 0) * 100);
    const row = document.createElement("div");
    row.className = `prob-row ${bar.cls}`;
    row.innerHTML = `
      <div class="prob-row-top">
        <span class="prob-name">${bar.label}</span>
        <span class="prob-pct">${pct}%</span>
      </div>
      <div class="prob-track"><div class="prob-fill" data-w="${pct}"></div></div>`;
    probContainer.appendChild(row);
  });
  /* Badge on the prob card */
  el("probBadge").textContent = severity === "Fatal" ? "HIGH IMPACT" : severity === "Serious" ? "ELEVATED" : "NOMINAL";
  el("probBadge").style.color = gaugeColor;
  el("probBadge").style.background = `${gaugeColor}22`;
  el("probBadge").style.borderColor = `${gaugeColor}44`;

  /* Animate bars after a tick so CSS transition fires */
  setTimeout(() => {
    probContainer.querySelectorAll(".prob-fill").forEach(f => f.style.width = f.dataset.w + "%");
  }, 80);

  /* ── Mini stat rows (middle card = Traffic / Risk Intelligence) ── */
  const riskContainer = el("riskScores");
  const stateColor    = getRiskColor(state_risk, 1, 3);
  const localColor    = getRiskColor(local_score, 0, 2.4);
  const stateBarW     = Math.round(((state_risk - 1) / 2) * 100);
  const localBarW     = Math.round((local_score / 2.4) * 100);

  riskContainer.innerHTML = `
    <div class="mini-stat-row">
      <span class="mini-stat-label">STATE RISK</span>
      <div class="mini-stat-bar"><div class="mini-stat-fill" style="width:0%;background:${stateColor}" data-w="${stateBarW}"></div></div>
      <span class="mini-stat-value" style="color:${stateColor}">${state_risk}</span>
    </div>
    <div class="mini-stat-row">
      <span class="mini-stat-label">LOCAL SCORE</span>
      <div class="mini-stat-bar"><div class="mini-stat-fill" style="width:0%;background:${localColor}" data-w="${localBarW}"></div></div>
      <span class="mini-stat-value" style="color:${localColor}">${local_score.toFixed(2)}</span>
    </div>`;
  el("riskBadge").textContent = getRiskZone(state_risk, 1, 3).toUpperCase();

  setTimeout(() => {
    riskContainer.querySelectorAll(".mini-stat-fill").forEach(f => f.style.width = f.dataset.w + "%");
  }, 80);

  /* ── SHAP bars (right card) ── */
  const shapContainer = el("shapBars");
  shapContainer.innerHTML = "";
  if (shap && shap.length) {
    const topVal = shap[0].value || 1;
    shap.forEach(item => {
      const w = Math.round((item.value / topVal) * 100);
      const row = document.createElement("div");
      row.className = "shap-row";
      row.innerHTML = `
        <div class="shap-row-top">
          <span class="shap-feature">${item.feature}</span>
          <span class="shap-val">${(item.value * 100).toFixed(1)}%</span>
        </div>
        <div class="shap-track"><div class="shap-fill" data-w="${w}"></div></div>`;
      shapContainer.appendChild(row);
    });
    setTimeout(() => {
      shapContainer.querySelectorAll(".shap-fill").forEach(f => f.style.width = f.dataset.w + "%");
    }, 100);
  }

  /* ── Insights (as pills in the strip) ── */
  const ticker = el("insightsList");
  ticker.innerHTML = "";
  (insights || []).forEach((text, i) => {
    const pill = document.createElement("span");
    pill.className = "insight-pill";
    pill.textContent = text;
    pill.style.animationDelay = (i * 0.08) + "s";
    ticker.appendChild(pill);
  });

  /* ── Populate the Analysis tab charts ── */
  buildAnalysisCharts(data);

  /* Remove empty note from analysis tab */
  const noteEl = el("analysisEmptyNote");
  if (noteEl) noteEl.style.display = "none";
}


/* ============================================================
   SECTION 10 — ANALYSIS TAB CHARTS
   Radar + Bar chart using Canvas API (no extra libraries needed)
============================================================ */
function buildAnalysisCharts(data) {
  const { probabilities, state_risk, local_score, shap } = data;

  /* ── Radar Chart: shap values as spider web ── */
  drawRadarChart(shap || []);

  /* ── Bar chart: severity probabilities ── */
  drawBarChart(probabilities);

  /* ── State gauge arc ── */
  drawMiniGauge("stateGauge", state_risk, 1, 3, "#00e5cc");
  el("stateRiskVal").textContent = state_risk.toFixed(2);

  /* ── Local donut ── */
  drawDonut("localDonut", local_score, 2.4, "#ffa502");
  el("localScoreVal").textContent = local_score.toFixed(2);

  /* ── Context cards ── */
  buildContextCards(data);
}

function drawRadarChart(shapItems) {
  const canvas = el("radarChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width; const H = canvas.height;
  const cx = W / 2; const cy = H / 2;
  const r = Math.min(W, H) * 0.35;

  ctx.clearRect(0, 0, W, H);

  const items = shapItems.slice(0, 6); // Max 6 spokes
  const n = items.length || 1;

  /* Draw background web rings */
  for (let ring = 1; ring <= 5; ring++) {
    const ringR = r * ring / 5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      const x = cx + Math.cos(angle) * ringR;
      const y = cy + Math.sin(angle) * ringR;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(0,229,204,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* Draw spoke lines */
  items.forEach((_, i) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.strokeStyle = "rgba(0,229,204,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  /* Draw filled polygon */
  const topVal = items[0]?.value || 1;
  ctx.beginPath();
  items.forEach((item, i) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const dist  = (item.value / topVal) * r;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle   = "rgba(0,229,204,0.12)";
  ctx.strokeStyle = "#00e5cc";
  ctx.lineWidth   = 2;
  ctx.shadowColor = "#00e5cc"; ctx.shadowBlur = 8;
  ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  /* Labels */
  items.forEach((item, i) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const lx = cx + Math.cos(angle) * (r + 22);
    const ly = cy + Math.sin(angle) * (r + 22);
    ctx.fillStyle   = "rgba(90,122,119,0.9)";
    ctx.font        = "9px Rajdhani, sans-serif";
    ctx.textAlign   = "center";
    ctx.fillText(item.feature.split(" ")[0].toUpperCase(), lx, ly);
  });
}

function drawBarChart(probs) {
  const canvas = el("barChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width; const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const bars = [
    { label: "MINOR",   value: probs.Minor   || 0, color: "#2ed573" },
    { label: "SERIOUS", value: probs.Serious || 0, color: "#ffa502" },
    { label: "FATAL",   value: probs.Fatal   || 0, color: "#ff4757" },
  ];

  const barW   = 60;
  const gap    = (W - bars.length * barW) / (bars.length + 1);
  const maxH   = H - 60;

  bars.forEach((bar, i) => {
    const x = gap + i * (barW + gap);
    const h = bar.value * maxH;
    const y = maxH - h + 20;

    /* Glow background */
    const grad = ctx.createLinearGradient(x, y, x, maxH + 20);
    grad.addColorStop(0, bar.color + "cc");
    grad.addColorStop(1, bar.color + "22");

    /* Animated height using requestAnimationFrame would be complex here,
       so we draw at full height and let the card animation give motion */
    ctx.fillStyle = grad;
    ctx.shadowColor = bar.color; ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, h, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    /* Grid line */
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 4, maxH + 20); ctx.lineTo(x + barW + 4, maxH + 20); ctx.stroke();

    /* Value label */
    ctx.fillStyle = bar.color;
    ctx.font = "bold 13px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(Math.round(bar.value * 100) + "%", x + barW / 2, y - 6);

    /* Name label */
    ctx.fillStyle = "rgba(90,122,119,0.8)";
    ctx.font = "10px Rajdhani, sans-serif";
    ctx.fillText(bar.label, x + barW / 2, H - 8);
  });
}

function drawMiniGauge(canvasId, value, min, max, color) {
  const canvas = el(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width; const H = canvas.height;
  const cx = W / 2; const cy = H * 0.65;
  const r  = Math.min(W, H) * 0.42;
  const pct = (value - min) / (max - min);

  ctx.clearRect(0, 0, W, H);

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * pct);
  ctx.strokeStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.stroke(); ctx.shadowBlur = 0;
}

function drawDonut(canvasId, value, max, color) {
  const canvas = el(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width; const H = canvas.height;
  const cx = W / 2; const cy = H * 0.6;
  const r  = Math.min(W, H) * 0.38;
  const pct = value / max;

  ctx.clearRect(0, 0, W, H);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 14; ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.strokeStyle = color;
  ctx.lineWidth = 14; ctx.lineCap = "round";
  ctx.shadowColor = color; ctx.shadowBlur = 14;
  ctx.stroke(); ctx.shadowBlur = 0;
}

function buildContextCards(data) {
  const container = el("contextRows");
  if (!container) return;
  container.innerHTML = "";

  const cards = [
    {
      icon: "🌧️",
      iconBg: "rgba(0,181,255,0.15)",
      name: "Atmospheric Conditions",
      detail: `Weather: ${data.weather || "—"} · Rain Risk: ${Math.round((data.probabilities?.Fatal || 0) * 100)}% impact`,
      score: data.probabilities?.Fatal > 0.5 ? "High Impact" : "Nominal",
      color: data.probabilities?.Fatal > 0.5 ? "#ff4757" : "#2ed573",
    },
    {
      icon: "🚗",
      iconBg: "rgba(0,229,204,0.15)",
      name: "Traffic Density",
      detail: `Congestion Index: ${Math.round((data.local_score || 0) / 2.4 * 100)}% of max`,
      score: data.local_score > 1.5 ? "High" : data.local_score > 0.8 ? "Moderate" : "Low",
      color: getRiskColor(data.local_score, 0, 2.4),
    },
    {
      icon: "🛡️",
      iconBg: "rgba(255,165,2,0.15)",
      name: "Structural Integrity",
      detail: `State risk index: ${data.state_risk} / 3.0`,
      score: getRiskZone(data.state_risk, 1, 3),
      color: getRiskColor(data.state_risk, 1, 3),
    },
  ];

  cards.forEach((card, i) => {
    const row = document.createElement("div");
    row.className = "context-row";
    row.style.animationDelay = (i * 0.1) + "s";
    row.innerHTML = `
      <div class="context-icon" style="background:${card.iconBg}">${card.icon}</div>
      <div class="context-info">
        <div class="context-name">${card.name}</div>
        <div class="context-detail">${card.detail}</div>
      </div>
      <div class="context-score" style="color:${card.color}">${card.score}</div>`;
    container.appendChild(row);
  });
}


/* ============================================================
   SECTION 11 — HEATMAP
   SVG dot map of India with risk-colored circles per state
============================================================ */
const STATE_COORDS = {
  "Andhra Pradesh":[15.9,79.7],"Arunachal Pradesh":[27.1,93.6],"Assam":[26.2,92.9],
  "Bihar":[25.6,85.1],"Chandigarh":[30.7,76.8],"Chhattisgarh":[21.3,81.7],
  "Delhi":[28.6,77.2],"Goa":[15.3,74.0],"Gujarat":[22.3,71.2],"Haryana":[29.1,76.1],
  "Himachal Pradesh":[31.1,77.2],"Jammu and Kashmir":[33.7,76.9],"Jammu & Kashmir":[33.7,76.9],
  "Jharkhand":[23.6,85.3],"Karnataka":[15.3,75.7],"Kerala":[10.9,76.3],
  "Madhya Pradesh":[22.9,78.7],"Maharashtra":[19.7,75.7],"Manipur":[24.7,93.9],
  "Meghalaya":[25.5,91.4],"Mizoram":[23.2,92.7],"Nagaland":[26.2,94.6],
  "Odisha":[20.9,85.1],"Puducherry":[11.9,79.8],"Punjab":[31.1,75.3],
  "Rajasthan":[27.0,74.2],"Sikkim":[27.5,88.5],"Tamil Nadu":[11.1,78.7],
  "Telangana":[17.4,78.5],"Tripura":[23.7,91.7],"Uttar Pradesh":[26.8,80.9],
  "Uttarakhand":[30.1,79.3],"West Bengal":[22.9,87.9],
};

async function loadHeatmap() {
  const res      = await fetch("/api/state-risks");
  const riskData = await res.json();

  buildStateList(riskData);
  buildMapSVG(riskData);
}

function buildStateList(riskData) {
  const list = el("heatmapStateList");
  list.innerHTML = "";
  Object.entries(riskData).sort((a,b) => b[1]-a[1]).forEach(([state, score]) => {
    const item = document.createElement("div");
    item.className = "state-list-item";
    item.innerHTML = `
      <span class="state-list-name">${state}</span>
      <span class="state-list-score" style="color:${getRiskColor(score,1,3)}">${score.toFixed(1)}</span>`;
    item.addEventListener("click", () => jumpToState(state));
    list.appendChild(item);
  });
}

function buildMapSVG(riskData) {
  const container = el("indiaMapContainer");

  /* When the heatmap tab is hidden, offsetWidth/Height are 0.
     Use the container's parent size or a sensible mobile fallback. */
  const W = container.offsetWidth  || container.parentElement?.offsetWidth  || 360;
  const H = container.offsetHeight || container.parentElement?.offsetHeight || 320;

  const LAT_MIN=8,LAT_MAX=37,LNG_MIN=68,LNG_MAX=97;
  function toXY(lat,lng) {
    return [
      ((lng-LNG_MIN)/(LNG_MAX-LNG_MIN))*W*0.88+W*0.06,
      H-((lat-LAT_MIN)/(LAT_MAX-LAT_MIN))*H*0.88-H*0.06
    ];
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  svg.setAttribute("class","india-map-svg");

  /* Glow filter */
  const defs = document.createElementNS("http://www.w3.org/2000/svg","defs");
  defs.innerHTML = `<filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg.appendChild(defs);

  const tooltip = document.createElement("div");
  tooltip.className = "map-tooltip";
  document.body.appendChild(tooltip);

  Object.entries(STATE_COORDS).forEach(([state, coords]) => {
    const score = riskData[state] || 1.5;
    const color = getRiskColor(score,1,3);
    const [cx,cy] = toXY(coords[0],coords[1]);
    const isSmall = ["Delhi","Chandigarh","Goa","Puducherry","Sikkim"].includes(state);
    const r = isSmall ? 6 : 13;

    const circle = document.createElementNS("http://www.w3.org/2000/svg","circle");
    circle.setAttribute("cx",cx); circle.setAttribute("cy",cy); circle.setAttribute("r",r);
    circle.setAttribute("fill",color); circle.setAttribute("opacity","0.85");
    circle.setAttribute("filter","url(#glow)"); circle.setAttribute("class","state-circle");

    circle.addEventListener("mouseenter",() => {
      tooltip.style.display = "block";
      tooltip.innerHTML = `<strong>${state}</strong><br>Risk: ${score.toFixed(1)} — ${getRiskZone(score,1,3)}`;
    });
    circle.addEventListener("mousemove",e => {
      tooltip.style.left = (e.clientX+14)+"px";
      tooltip.style.top  = (e.clientY-10)+"px";
    });
    circle.addEventListener("mouseleave",() => tooltip.style.display="none");
    circle.addEventListener("click",() => jumpToState(state));

    const label = document.createElementNS("http://www.w3.org/2000/svg","text");
    label.setAttribute("x",cx); label.setAttribute("y",cy+r+10);
    label.setAttribute("text-anchor","middle"); label.setAttribute("font-size","7");
    label.setAttribute("fill","rgba(0,229,204,0.5)"); label.setAttribute("font-family","Rajdhani,sans-serif");
    label.textContent = state.split(" ")[0];

    svg.appendChild(circle); svg.appendChild(label);
  });

  container.innerHTML = ""; container.appendChild(svg);
}

function jumpToState(stateName) {
  /* Switch to predict tab */
  all(".nav-icon").forEach(b => b.classList.remove("active"));
  all(".tab-page").forEach(p => p.classList.remove("active"));
  document.querySelector('[data-tab="predict"]').classList.add("active");
  el("tab-predict").classList.add("active");
  el("pageTitle").textContent    = PAGE_META.predict.title;
  el("pageSubtitle").textContent = PAGE_META.predict.sub;

  /* Set state dropdown */
  const dd = el("stateSelect");
  for (const opt of dd.options) {
    if (opt.value.toLowerCase() === stateName.toLowerCase()) {
      dd.value = opt.value;
      dd.dispatchEvent(new Event("change"));
      break;
    }
  }
}


/* ============================================================
   SECTION 12 — SAFEROUTE (Google Maps)
============================================================ */
let gMap      = null;
let polylines = [];

function initGoogleMaps() {
  const mapEl = el("routeMap");
  if (!mapEl) return;
  gMap = new google.maps.Map(mapEl, {
    center: {lat:22.5, lng:80.0}, zoom: 5,
    styles: darkMapStyles(),
    mapTypeControl: false, streetViewControl: false,
    fullscreenControl: false, /* saves space on mobile */
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_BOTTOM
    },
  });

  /* When phone rotates or window resizes, trigger a map resize
     so it fills the new dimensions correctly */
  window.addEventListener("resize", () => {
    if (gMap) {
      setTimeout(() => google.maps.event.trigger(gMap, "resize"), 200);
    }
  });
}

el("srAnalyseBtn").addEventListener("click", async function () {
  const origin = el("srOrigin").value.trim();
  const dest   = el("srDest").value.trim();
  if (!origin || !dest) { alert("Enter both origin and destination."); return; }

  setLoading(this, true);
  el("srErrorBanner").style.display = "none";
  el("routeResults").style.display  = "none";

  try {
    const res  = await fetch("/api/route-risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin, destination: dest,
        time:    el("srTimeInput").value,
        weather: el("srWeather").value,
        speed:   el("srSpeedInput").value,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderRoutes(data.routes);
  } catch (err) {
    el("srErrorMsg").textContent       = err.message;
    el("srErrorBanner").style.display = "flex";
  } finally {
    setLoading(this, false);
  }
});

function renderRoutes(routes) {
  polylines.forEach(p => p.setMap(null));
  polylines = [];
  el("mapPlaceholder").style.display = "none";

  const cardsContainer = el("routeCards");
  cardsContainer.innerHTML = "";

  const COLORS = ["#2ed573","#ffa502","#ff4757","#7bed9f"];

  routes.forEach((route, i) => {
    const isSafest = route.rank === 0;
    const color    = COLORS[i % COLORS.length];
    const badgeText = i===0 ? "✓ SAFEST" : i===1 ? "⚠ MODERATE" : "✕ RISKY";
    const badgeCls  = i===0 ? "badge-safest" : i===1 ? "badge-moderate" : "badge-risky";
    const riskPct   = Math.min(Math.round(((route.risk_score-1)/2)*100),100);

    const chips = (route.segments||[]).map(s =>
      `<span class="city-chip chip-${s.severity.toLowerCase()}">${s.city}</span>`
    ).join("");

    const card = document.createElement("div");
    card.className = `route-card${isSafest?" is-safest":""}`;
    card.style.animationDelay = (i*0.08)+"s";
    card.innerHTML = `
      <div class="route-card-top">
        <span class="route-card-name">via ${route.summary||"Route "+(i+1)}</span>
        <span class="route-badge ${badgeCls}">${badgeText}</span>
      </div>
      <div class="route-card-meta">
        <span>🛣 ${route.distance}km</span>
        <span>⏱ ${route.duration}min</span>
        <span>⚡ ${route.risk_score.toFixed(2)}</span>
      </div>
      <div class="route-risk-bar">
        <div class="risk-track"><div class="risk-fill" data-w="${riskPct}" style="background:${color};width:0%"></div></div>
      </div>
      <div class="city-chips">${chips}</div>`;

    card.addEventListener("click", () => highlightRoute(i));
    cardsContainer.appendChild(card);
    setTimeout(() => card.querySelectorAll(".risk-fill").forEach(f=>f.style.width=f.dataset.w+"%"), 100);

    if (gMap && route.polyline) {
      const path = google.maps.geometry.encoding.decodePath(route.polyline);
      const poly = new google.maps.Polyline({
        path, map: gMap, strokeColor: color,
        strokeOpacity: isSafest?1.0:0.5, strokeWeight: isSafest?5:3,
        zIndex: isSafest?10:1,
      });
      polylines.push(poly);

      if (i===0 && path.length) {
        const bounds = new google.maps.LatLngBounds();
        path.forEach(p=>bounds.extend(p));
        gMap.fitBounds(bounds, 60);
      }
    }
  });

  el("routeResults").style.display = "block";
}

function highlightRoute(idx) {
  polylines.forEach((p,i) => p.setOptions({
    strokeOpacity: i===idx?1.0:0.2, strokeWeight: i===idx?6:2, zIndex: i===idx?20:1,
  }));
  all(".route-card").forEach((c,i) => {
    c.style.outline = i===idx ? "1px solid var(--teal)" : "none";
  });
}

function darkMapStyles() {
  return [
    {elementType:"geometry",      stylers:[{color:"#000000"}]},
    {elementType:"labels.text.stroke", stylers:[{color:"#04100e"}]},
    {elementType:"labels.text.fill",   stylers:[{color:"#3a5a55"}]},
    {featureType:"road",          elementType:"geometry",        stylers:[{color:"#0d1e1a"}]},
    {featureType:"road.highway",  elementType:"geometry",        stylers:[{color:"#122a24"}]},
    {featureType:"water",         elementType:"geometry",        stylers:[{color:"#06111d"}]},
    {featureType:"poi",           elementType:"geometry",        stylers:[{color:"#080f0c"}]},
    {featureType:"administrative",elementType:"geometry.stroke", stylers:[{color:"#1a3530"}]},
  ];
}


/* ============================================================
   SECTION 12a — ADMIN LOGIN MODAL
============================================================ */
const ADMIN_PASSWORD = "roadsense@admin"; // Change this to your preferred password

window._adminUnlocked = false;

function showAdminLogin() {
  el("adminLoginOverlay").style.display = "flex";
  el("adminPassInput").value = "";
  el("adminPassError").style.display = "none";
  setTimeout(() => el("adminPassInput").focus(), 100);
}

function hideAdminLogin() {
  el("adminLoginOverlay").style.display = "none";
}

function tryAdminLogin() {
  const val = el("adminPassInput").value;
  if (val === ADMIN_PASSWORD) {
    window._adminUnlocked = true;
    hideAdminLogin();
    /* Now actually switch to admin tab */
    all(".nav-icon").forEach(b => b.classList.remove("active"));
    all(".tab-page").forEach(p => p.classList.remove("active"));
    document.querySelector("[data-tab=admin]").classList.add("active");
    el("tab-admin").classList.add("active");
    el("pageTitle").textContent    = PAGE_META.admin.title;
    el("pageSubtitle").textContent = PAGE_META.admin.sub;
    loadRoadStatus();
  } else {
    el("adminPassError").style.display = "block";
    el("adminPassInput").value = "";
    el("adminPassInput").focus();
  }
}

el("adminPassSubmit") && el("adminPassSubmit").addEventListener("click", tryAdminLogin);
el("adminPassCancel") && el("adminPassCancel").addEventListener("click", () => {
  hideAdminLogin();
  /* Revert nav icon to previously active tab */
  const prevActive = document.querySelector(".nav-icon.was-active") || document.querySelector("[data-tab=predict]");
  prevActive.click();
});
el("adminPassInput") && el("adminPassInput").addEventListener("keydown", e => {
  if (e.key === "Enter") tryAdminLogin();
  if (e.key === "Escape") { hideAdminLogin(); }
});

/* ============================================================
   SECTION 12b — ADVANCED FILTER TOGGLE
============================================================ */
(function setupAdvFilter() {
  const toggle = el("advFilterToggle");
  const body   = el("advFilterBody");
  if (!toggle || !body) return;
  toggle.addEventListener("click", () => {
    const open = body.classList.toggle("open");
    toggle.classList.toggle("open", open);
  });
})();

/* ── Travel date: restrict to today → today+10, wire forecast fetch ── */
(function setupTravelDate() {
  const dateIn = el("travelDateInput");
  if (!dateIn) return;

  const today = new Date();
  const max   = new Date(today);
  max.setDate(today.getDate() + 10);

  const fmt = d => d.toISOString().split("T")[0];
  dateIn.min   = fmt(today);
  dateIn.max   = fmt(max);
  dateIn.value = fmt(today);

  dateIn.addEventListener("change", () => {
    const city = el("citySelect").value;
    if (!city) return;
    const note = el("dateForecastNote");
    const isToday = dateIn.value === fmt(new Date());
    if (note) note.style.display = isToday ? "none" : "block";
    fetchWeather(city, "predict", dateIn.value);
  });
})();


/* ============================================================
   SECTION 12c — ADMIN DASHBOARD
============================================================ */
let roadStatusData = []; // In-memory store for road_status.csv data

// ── Admin date: cap to today ──────────────────────────────────────────────────
(function() {
  const d = el("adminDate");
  if (d) {
    const today = new Date().toISOString().split("T")[0];
    d.max   = today;
    d.value = today;
  }
})();

// ── Autocomplete helper ───────────────────────────────────────────────────────
const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh",
  "Chhattisgarh","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh",
  "Jammu & Kashmir","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha",
  "Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal"
];

const CITY_STATE_LIST = [
  {city:"Jammu",state:"Jammu & Kashmir"},{city:"Samba",state:"Jammu & Kashmir"},{city:"Rajouri",state:"Jammu & Kashmir"},{city:"Srinagar",state:"Jammu & Kashmir"},{city:"Anantnag",state:"Jammu & Kashmir"},{city:"Baramulla",state:"Jammu & Kashmir"},{city:"Kupwara",state:"Jammu & Kashmir"},
  {city:"Delhi",state:"Delhi"},{city:"Noida",state:"Uttar Pradesh"},{city:"Gurgaon",state:"Haryana"},{city:"Faridabad",state:"Haryana"},{city:"Ghaziabad",state:"Uttar Pradesh"},
  {city:"Jaipur",state:"Rajasthan"},{city:"Udaipur",state:"Rajasthan"},{city:"Jodhpur",state:"Rajasthan"},{city:"Kota",state:"Rajasthan"},{city:"Bikaner",state:"Rajasthan"},{city:"Ajmer",state:"Rajasthan"},
  {city:"Lucknow",state:"Uttar Pradesh"},{city:"Kanpur",state:"Uttar Pradesh"},{city:"Varanasi",state:"Uttar Pradesh"},{city:"Agra",state:"Uttar Pradesh"},{city:"Meerut",state:"Uttar Pradesh"},{city:"Prayagraj",state:"Uttar Pradesh"},{city:"Bareilly",state:"Uttar Pradesh"},{city:"Gorakhpur",state:"Uttar Pradesh"},
  {city:"Mumbai",state:"Maharashtra"},{city:"Pune",state:"Maharashtra"},{city:"Nagpur",state:"Maharashtra"},{city:"Nashik",state:"Maharashtra"},{city:"Aurangabad",state:"Maharashtra"},{city:"Thane",state:"Maharashtra"},
  {city:"Bangalore",state:"Karnataka"},{city:"Mysore",state:"Karnataka"},{city:"Hubli",state:"Karnataka"},{city:"Mangalore",state:"Karnataka"},
  {city:"Chennai",state:"Tamil Nadu"},{city:"Coimbatore",state:"Tamil Nadu"},{city:"Madurai",state:"Tamil Nadu"},{city:"Salem",state:"Tamil Nadu"},{city:"Tiruchirappalli",state:"Tamil Nadu"},
  {city:"Hyderabad",state:"Telangana"},{city:"Warangal",state:"Telangana"},{city:"Karimnagar",state:"Telangana"},
  {city:"Kolkata",state:"West Bengal"},{city:"Howrah",state:"West Bengal"},{city:"Durgapur",state:"West Bengal"},{city:"Siliguri",state:"West Bengal"},
  {city:"Patna",state:"Bihar"},{city:"Gaya",state:"Bihar"},{city:"Muzaffarpur",state:"Bihar"},
  {city:"Ranchi",state:"Jharkhand"},{city:"Jamshedpur",state:"Jharkhand"},
  {city:"Bhopal",state:"Madhya Pradesh"},{city:"Indore",state:"Madhya Pradesh"},{city:"Gwalior",state:"Madhya Pradesh"},{city:"Jabalpur",state:"Madhya Pradesh"},{city:"Ujjain",state:"Madhya Pradesh"},
  {city:"Ahmedabad",state:"Gujarat"},{city:"Surat",state:"Gujarat"},{city:"Vadodara",state:"Gujarat"},{city:"Rajkot",state:"Gujarat"},
  {city:"Chandigarh",state:"Chandigarh"},{city:"Shimla",state:"Himachal Pradesh"},{city:"Manali",state:"Himachal Pradesh"},{city:"Dharamshala",state:"Himachal Pradesh"},{city:"Solan",state:"Himachal Pradesh"},
  {city:"Dehradun",state:"Uttarakhand"},{city:"Haridwar",state:"Uttarakhand"},{city:"Rishikesh",state:"Uttarakhand"},
  {city:"Amritsar",state:"Punjab"},{city:"Ludhiana",state:"Punjab"},{city:"Jalandhar",state:"Punjab"},{city:"Patiala",state:"Punjab"},
  {city:"Panaji",state:"Goa"},{city:"Margao",state:"Goa"},
  {city:"Raipur",state:"Chhattisgarh"},{city:"Bilaspur",state:"Chhattisgarh"},{city:"Durg",state:"Chhattisgarh"},
  {city:"Imphal",state:"Manipur"},{city:"Aizawl",state:"Mizoram"},{city:"Shillong",state:"Meghalaya"},
  {city:"Gangtok",state:"Sikkim"},{city:"Itanagar",state:"Arunachal Pradesh"},{city:"Agartala",state:"Tripura"},{city:"Kohima",state:"Nagaland"},
  {city:"Vishakhapatnam",state:"Andhra Pradesh"},{city:"Vijayawada",state:"Andhra Pradesh"},{city:"Tirupati",state:"Andhra Pradesh"},
  {city:"Kochi",state:"Kerala"},{city:"Thiruvananthapuram",state:"Kerala"},{city:"Kozhikode",state:"Kerala"},
  {city:"Bhubaneswar",state:"Odisha"},{city:"Cuttack",state:"Odisha"},{city:"Rourkela",state:"Odisha"},
  {city:"Guwahati",state:"Assam"},{city:"Dibrugarh",state:"Assam"},{city:"Puducherry",state:"Puducherry"}
];

const COMMON_ROADS = [
  "NH 1","NH 2","NH 3","NH 4","NH 5","NH 6","NH 7","NH 8","NH 9","NH 10",
  "NH 11","NH 12","NH 15","NH 17","NH 19","NH 21","NH 24","NH 27","NH 44",
  "NH 48","NH 52","NH 58","NH 66","NH 75","NH 76","SH 1","SH 2","SH 3",
  "Ring Road","Bypass Road","Inner Ring Road","Outer Ring Road",
  "Jammu-Srinagar Highway","Leh-Manali Highway","Express Highway"
];

function acHighlight(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + "<em>" + text.slice(idx, idx + query.length) + "</em>" + text.slice(idx + query.length);
}

function makeAutocomplete(inputId, dropId, getItems) {
  const inp  = el(inputId);
  const drop = el(dropId);
  if (!inp || !drop) return;
  let activeIdx = -1;

  function showDrop(matches, query) {
    if (!matches.length) { drop.classList.remove("open"); return; }
    activeIdx = -1;
    drop.innerHTML = matches.map(m =>
      `<li data-val="${m.val}">${m.html}</li>`
    ).join("");
    drop.classList.add("open");
    drop.querySelectorAll("li").forEach(li => {
      li.addEventListener("mousedown", e => {
        e.preventDefault();
        inp.value = li.dataset.val;
        drop.classList.remove("open");
        inp.dispatchEvent(new CustomEvent("acselect", { detail: li.dataset.val }));
      });
    });
  }

  inp.addEventListener("input", () => {
    const q = inp.value.trim();
    if (!q) { drop.classList.remove("open"); return; }
    showDrop(getItems(q).slice(0, 8), q);
  });

  inp.addEventListener("keydown", e => {
    const items = drop.querySelectorAll("li");
    if (!drop.classList.contains("open") || !items.length) return;
    if      (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx+1, items.length-1); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); }
    else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      inp.value = items[activeIdx].dataset.val;
      drop.classList.remove("open");
      inp.dispatchEvent(new CustomEvent("acselect", { detail: items[activeIdx].dataset.val }));
      return;
    } else if (e.key === "Escape") { drop.classList.remove("open"); return; }
    items.forEach((li, i) => li.classList.toggle("ac-active", i === activeIdx));
    if (activeIdx >= 0) items[activeIdx].scrollIntoView({ block: "nearest" });
  });

  document.addEventListener("click", e => {
    if (!inp.contains(e.target) && !drop.contains(e.target)) drop.classList.remove("open");
  });
}

// ── Cascading dropdowns: State → City (dataset-locked, no free typing) ───────

// Build STATE_CITY_MAP from CITY_STATE_LIST
const STATE_CITY_MAP = {};
CITY_STATE_LIST.forEach(({ city, state }) => {
  if (!STATE_CITY_MAP[state]) STATE_CITY_MAP[state] = [];
  if (!STATE_CITY_MAP[state].includes(city)) STATE_CITY_MAP[state].push(city);
});

// Populate state dropdown from dataset states only
(function populateStateDropdown() {
  const sel = el("adminState");
  if (!sel) return;
  const states = Object.keys(STATE_CITY_MAP).sort();
  // Also add states that appear in INDIAN_STATES but have no cities
  INDIAN_STATES.forEach(s => { if (!STATE_CITY_MAP[s]) STATE_CITY_MAP[s] = []; });
  const allStates = [...new Set([...Object.keys(STATE_CITY_MAP), ...states])].sort();
  allStates.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  });
})();

// When state changes → repopulate city dropdown
el("adminState") && el("adminState").addEventListener("change", function() {
  const cityEl = el("adminCity");
  if (!cityEl) return;
  const cities = STATE_CITY_MAP[this.value] || [];
  cityEl.innerHTML = "";
  if (!cities.length) {
    // State has no cities in dataset — state-level entry only
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "— State level only —";
    cityEl.appendChild(opt);
    cityEl.disabled = true;
    el("adminCityNote") && (el("adminCityNote").textContent = "(state-level)");
  } else {
    const blank = document.createElement("option");
    blank.value = ""; blank.textContent = "— All cities (state-level) —";
    cityEl.appendChild(blank);
    cities.sort().forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      cityEl.appendChild(opt);
    });
    cityEl.disabled = false;
    el("adminCityNote") && (el("adminCityNote").textContent = "(if applicable)");
  }
});

async function loadRoadStatus() {
  try {
    const res  = await fetch("/api/admin/road-status");
    const data = await res.json();
    roadStatusData = data.rows || [];
    renderRoadTable(roadStatusData);
    updateConditionBars(roadStatusData);
    el("rstatRecords").textContent  = roadStatusData.length;
    el("rstatLastTrain").textContent = data.last_trained || "Never";
  } catch (e) {
    /* API not yet available — show empty state gracefully */
    roadStatusData = [];
    renderRoadTable([]);
    el("rstatRecords").textContent = "0";
  }
}

function renderRoadTable(rows) {
  const body = el("roadStatusBody");
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="admin-empty">No entries yet. Add the first one above.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((r, i) => {
    const condClass = { Dry:"cond-dry", Wet:"cond-wet", Damaged:"cond-damaged", "Under Construction":"cond-construct" }[r.condition] || "";
    return `<tr>
      <td>${r.state || "—"}</td>
      <td>${r.city}</td>
      <td class="road-name-cell">${r.road_name}</td>
      <td><span class="cond-badge ${condClass}">${r.condition}</span></td>
      <td class="date-cell">${r.last_updated || "—"}</td>
      <td><button class="admin-del-btn" data-idx="${i}" title="Delete">✕</button></td>
    </tr>`;
  }).join("");

  body.querySelectorAll(".admin-del-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      roadStatusData.splice(idx, 1);
      renderRoadTable(roadStatusData);
      updateConditionBars(roadStatusData);
      el("rstatRecords").textContent = roadStatusData.length;
      saveRoadStatus();
    });
  });
}

function updateConditionBars(rows) {
  const counts = { Dry:0, Wet:0, Damaged:0, "Under Construction":0 };
  rows.forEach(r => { if (counts[r.condition] !== undefined) counts[r.condition]++; });
  const total = rows.length || 1;
  const colors = { Dry:"#2ed573", Wet:"#00b5ff", Damaged:"#ff4757", "Under Construction":"#ffa502" };
  const container = el("conditionBars");
  if (!container) return;
  container.innerHTML = Object.entries(counts).map(([label, count]) => {
    const pct = Math.round((count / total) * 100);
    return `<div class="cond-bar-row">
      <div class="cond-bar-label">${label}</div>
      <div class="cond-bar-track"><div class="cond-bar-fill" style="width:${pct}%;background:${colors[label]}"></div></div>
      <div class="cond-bar-val">${count}</div>
    </div>`;
  }).join("");
}

async function saveRoadStatus() {
  try {
    await fetch("/api/admin/road-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: roadStatusData }),
    });
  } catch(e) { /* silent */ }
}

el("adminAddBtn") && el("adminAddBtn").addEventListener("click", async function() {
  const state     = (el("adminState") ? el("adminState").value : "").trim();
  const city      = (el("adminCity") ? el("adminCity").value : "").trim();
  const roadName  = (el("adminRoadName") ? el("adminRoadName").value : "").trim();
  const condition = el("adminCondition").value;
  const date      = el("adminDate").value || new Date().toISOString().split("T")[0];

  if (!state) { alert("Please select a State."); return; }
  if (!roadName) { alert("Please select a Road Type."); return; }

  setLoading(this, true);

  // Match on state + city + road type (city can be blank = state-level)
  const existing = roadStatusData.findIndex(r =>
    r.state === state &&
    (r.city || "") === city &&
    (r.road_name || "") === roadName
  );
  const entry = { state, city, road_name: roadName, condition, last_updated: date };
  if (existing >= 0) { roadStatusData[existing] = entry; } else { roadStatusData.push(entry); }
  await saveRoadStatus();
  renderRoadTable(roadStatusData);
  updateConditionBars(roadStatusData);
  el("rstatRecords").textContent = roadStatusData.length;

  // Reset — state stays, clear city back to blank
  if (el("adminCity")) { el("adminCity").value = ""; }
  setLoading(this, false);
});

el("retrainBtn") && el("retrainBtn").addEventListener("click", async function() {
  setLoading(this, true);
  const logEl = el("retrainLog");
  const row   = el("retrainStatusRow");
  row.style.display = "block";
  logEl.innerHTML = '<span class="retrain-line">⟳ Initiating retrain sequence…</span>';

  const steps = [
    "📂 Reading road_status.csv…",
    "🔧 Merging with local features…",
    "🤖 Fitting RandomForest model…",
    "💾 Writing model.pkl…",
    "📊 Updating local_features.csv…",
    "✅ Retrain complete.",
  ];

  try {
    /* Show log steps while API call runs */
    let i = 0;
    const logTimer = setInterval(() => {
      if (i < steps.length - 1) {
        logEl.innerHTML += `<span class="retrain-line">${steps[i]}</span>`;
        logEl.scrollTop = logEl.scrollHeight;
        i++;
      }
    }, 600);

    const res  = await fetch("/api/admin/retrain", { method: "POST" });
    const data = await res.json();
    clearInterval(logTimer);

    if (data.error) throw new Error(data.error);
    logEl.innerHTML += `<span class="retrain-line retrain-ok">${steps[steps.length-1]}</span>`;
    el("rstatLastTrain").textContent = new Date().toLocaleDateString("en-IN");
    el("rstatStatus").textContent    = "UPDATED";
    el("rstatStatus").style.color    = "#2ed573";
  } catch(err) {
    logEl.innerHTML += `<span class="retrain-line retrain-err">✕ ${err.message}</span>`;
    el("rstatStatus").textContent = "ERROR";
    el("rstatStatus").style.color = "#ff4757";
  } finally {
    setLoading(this, false);
  }
});


/* ============================================================
   SECTION 13 — HELPERS
============================================================ */
function getRiskColor(v, mn, mx) {
  const t = (v-mn)/(mx-mn);
  if (t<0.35) return "#2ed573";
  if (t<0.65) return "#ffa502";
  return "#ff4757";
}
function getRiskZone(v, mn, mx) {
  const t = (v-mn)/(mx-mn);
  if (t<0.35) return "Stable";
  if (t<0.65) return "Nominal";
  return "Critical";
}


/* ============================================================
   SECTION 14 — APP STARTUP
   Everything that runs when the page first loads
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  runLoader();       // Starts the 3D road canvas animation
  startClock();      // Live system time in top bar
  setupTabs();       // Icon sidebar tab switching
  loadCityData();    // Fetch state→city data for dropdowns
  loadHeatmap();     // Build heatmap SVG + sidebar list
  drawIdleGauge();   // Animated idle ring on welcome screen
  autoSetTime("predict");    // Set Day/Night from system clock
  autoSetTime("saferoute");  // Same for saferoute
});