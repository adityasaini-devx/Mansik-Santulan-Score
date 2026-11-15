/* Mental Health Score Predictor — frontend logic (vanilla JS) */
"use strict";

/* ===== Configuration ===== */
const API_URL = "http://127.0.0.1:8000/predict";

// Visual scale for the gauge only. Change if your model's score range differs.
const SCORE_MAX = 10;

// Numeric input definitions. `name` is the exact JSON field name sent to the API.
// Ranges mirror the backend (Pydantic) constraints.
const SLIDERS = [
  { name: "age",                     label: "Age",                    min: 10, max: 100, step: 1,   value: 21,  unit: "years", integer: true },
  { name: "avg_daily_usage_hours",   label: "Average daily usage",    min: 0,  max: 24,  step: 0.1, value: 5.5, unit: "hours" },
  // Backend defines only a minimum (>= 0), so this is a number field, not a capped slider.
  { name: "daily_unlocks",           label: "Daily unlocks",          min: 0,  step: 1,   value: 170, unit: "times", integer: true, type: "number" },
  { name: "study_hours",             label: "Study hours per day",    min: 0,  max: 24,  step: 0.1, value: 4,   unit: "hours" },
  { name: "physical_activity_hours", label: "Physical activity",      min: 0,  max: 24,  step: 0.1, value: 1,   unit: "hours per day" },
  { name: "sleep_hours_per_night",   label: "Sleep per night",        min: 0,  max: 24,  step: 0.1, value: 7,   unit: "hours" },
];

// Allowed categorical values (exact spelling/capitalisation, as in the backend schema).
const ALLOWED = {
  gender:             ["Male", "Female"],
  academic_level:     ["Undergraduate", "Graduate", "High School"],
  most_used_platform: ["Facebook", "LinkedIn", "Instagram", "Snapchat", "Twitter", "YouTube", "TikTok", "LINE", "KakaoTalk", "VKontakte", "WhatsApp", "WeChat"],
  purpose_of_use:     ["Networking", "Education", "Entertainment", "News"],
  stress_level:       ["Medium", "Low", "Very High", "High"],
};

// Countries the backend keeps as-is; every other country is grouped to "Other" server-side.
const PRIMARY_COUNTRIES = ["Other", "India", "USA", "Canada", "Australia", "UK", "Germany", "Mexico", "Turkey", "France"];

// Search suggestions only. Users may type any other country name; it is sent as entered.
const OTHER_COUNTRIES = [
  "Afghanistan","Albania","Algeria","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahrain","Bangladesh",
  "Belarus","Belgium","Bhutan","Bolivia","Bosnia","Brazil","Bulgaria","Canada","Chile","China","Colombia",
  "Costa Rica","Croatia","Cyprus","Czech Republic","Denmark","Ecuador","Egypt","Estonia","Ethiopia","Finland",
  "France","Georgia","Germany","Ghana","Greece","Hong Kong","Hungary","Iceland","India","Indonesia","Iraq",
  "Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Kyrgyzstan","Latvia",
  "Lebanon","Liechtenstein","Lithuania","Luxembourg","Malaysia","Maldives","Malta","Mexico","Moldova","Monaco",
  "Montenegro","Morocco","Nepal","Netherlands","New Zealand","Nigeria","Norway","Oman","Pakistan","Panama",
  "Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Saudi Arabia","Serbia",
  "Singapore","Slovakia","Slovenia","South Africa","South Korea","Spain","Sri Lanka","Sweden","Switzerland",
  "Syria","Taiwan","Tajikistan","Thailand","Trinidad","Turkey","UAE","UK","USA","Uganda","Ukraine","Uruguay",
  "Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"
];
// Predefined options first, then the remaining suggestions (de-duplicated).
const COUNTRIES = [...PRIMARY_COUNTRIES, ...OTHER_COUNTRIES.filter((c) => !PRIMARY_COUNTRIES.includes(c))];

/* ===== DOM references ===== */
const form      = document.getElementById("predict-form");
const errorBox  = document.getElementById("form-error");
const predictBtn= document.getElementById("predict-btn");
const resultBox = document.getElementById("result");
const resultEmpty = document.getElementById("result-empty");
const resultContent = document.getElementById("result-content");
const gaugeFill = document.getElementById("gauge-fill");
const scoreEl   = document.getElementById("score-value");
const countryIn = document.getElementById("country");
const countryList = document.getElementById("country-list");
const CIRC = 2 * Math.PI * 86; // gauge circumference

/* ===== Sliders ===== */
function formatValue(s, v) {
  return `${s.integer ? Math.round(v) : Number(v).toFixed(1).replace(/\.0$/, "")} ${s.unit}`;
}

function buildSliders() {
  SLIDERS.forEach((s) => {
    const host = document.querySelector(`[data-slider="${s.name}"]`);
    host.className = "field";
    if (s.type === "number") {
      host.innerHTML = `
        <label for="${s.name}">${s.label} (${s.unit})</label>
        <input type="number" id="${s.name}" name="${s.name}" min="${s.min}" step="${s.step}" value="${s.value}" inputmode="numeric" required>`;
      return;
    }
    host.innerHTML = `
      <div class="slider-head">
        <label for="${s.name}">${s.label}</label>
        <output class="slider-value" for="${s.name}"></output>
      </div>
      <input type="range" id="${s.name}" name="${s.name}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}">
      <div class="slider-range"><span>${s.min}</span><span>${s.max} ${s.unit.split(" ")[0]}</span></div>`;
    const input = host.querySelector("input");
    const out = host.querySelector("output");
    const update = () => {
      out.textContent = formatValue(s, input.value);
      // Drives the filled portion of the track
      input.style.setProperty("--pct", ((input.value - s.min) / (s.max - s.min)) * 100 + "%");
      input.setAttribute("aria-valuetext", out.textContent);
    };
    input.addEventListener("input", update);
    update();
  });
}

/* ===== Searchable country dropdown ===== */
let activeIdx = -1;

function esc(t) { return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function renderCountries(filter = "") {
  const typed = filter.trim();
  const q = typed.toLowerCase();
  const matches = COUNTRIES.filter((c) => c.toLowerCase().includes(q));
  let html = matches.map((c, i) => `<li role="option" id="c-${i}" data-value="${esc(c)}">${esc(c)}</li>`).join("");
  // Any other country name is allowed: offer the typed text as its own option.
  if (typed && !COUNTRIES.some((c) => c.toLowerCase() === q)) {
    html += `<li role="option" data-value="${esc(typed)}">Use &ldquo;${esc(typed)}&rdquo;</li>`;
  }
  if (!matches.length) html = `<li class="empty">No countries found</li>` + html;
  countryList.innerHTML = html;
  activeIdx = -1;
}
const countryCard = countryIn.closest(".card");

function openList() {
  countryList.hidden = false;
  countryIn.setAttribute("aria-expanded", "true");
  countryCard.classList.add("dropdown-open");   // lifts the card above the next sections
  // Flip above the input when there isn't room below and there is more room above
  countryList.classList.remove("up");
  const r = countryIn.getBoundingClientRect();
  const need = Math.min(countryList.scrollHeight, 230) + 16;
  const below = window.innerHeight - r.bottom, above = r.top;
  if (below < need && above > below) countryList.classList.add("up");
}
function closeList() {
  countryList.hidden = true;
  countryIn.setAttribute("aria-expanded", "false");
  countryCard.classList.remove("dropdown-open");
}
function chooseCountry(value) { countryIn.value = value; closeList(); clearInvalid(countryIn); }
function highlight(i) {
  const items = [...countryList.querySelectorAll("li[data-value]")];
  items.forEach((li) => li.removeAttribute("aria-selected"));
  if (!items.length) return;
  activeIdx = (i + items.length) % items.length;
  items[activeIdx].setAttribute("aria-selected", "true");
  items[activeIdx].scrollIntoView({ block: "nearest" });
}

countryIn.addEventListener("focus", () => { renderCountries(countryIn.value); openList(); });
// Clicking the already-focused field (e.g. after Escape or a selection) reopens the menu
countryIn.addEventListener("click", () => { if (countryList.hidden) { renderCountries(countryIn.value); openList(); } });
countryIn.addEventListener("input", () => { renderCountries(countryIn.value); openList(); });
countryIn.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); openList(); highlight(activeIdx + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); highlight(activeIdx - 1); }
  else if (e.key === "Enter" && !countryList.hidden && activeIdx >= 0) {
    e.preventDefault();
    chooseCountry(countryList.querySelectorAll("li[data-value]")[activeIdx].dataset.value);
  } else if (e.key === "Escape") closeList();
});
countryList.addEventListener("mousedown", (e) => {
  e.preventDefault();                         // don't blur the input (keeps scrollbar usable)
  const li = e.target.closest("li[data-value]");
  if (li) chooseCountry(li.dataset.value);
});
// Click/tap outside the combobox closes the menu
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".combo")) closeList();
});
// Keep the flip direction correct if the viewport changes while open
window.addEventListener("resize", () => { if (!countryList.hidden) openList(); });
countryIn.addEventListener("blur", closeList);

/* ===== Validation ===== */
function clearInvalid(el) { el.closest(".field")?.classList.remove("invalid"); }
form.addEventListener("change", (e) => clearInvalid(e.target));

/* Returns a canonical country (fixes casing of the backend's grouped countries) */
function canonicalCountry(raw) {
  const t = raw.trim().replace(/\s+/g, " ");
  return PRIMARY_COUNTRIES.find((c) => c.toLowerCase() === t.toLowerCase()) || t;
}

function markInvalid(el, bad) { el.closest(".field")?.classList.toggle("invalid", bad); }

function validate() {
  const problems = [];

  // Categorical dropdowns: must be one of the exact allowed values
  Object.keys(ALLOWED).forEach((name) => {
    const bad = !ALLOWED[name].includes(form[name].value);
    markInvalid(form[name], bad);
    if (bad) problems.push(name);
  });

  // Country: any non-empty string
  const country = canonicalCountry(countryIn.value);
  markInvalid(countryIn, country.length === 0);
  if (country) countryIn.value = country; else problems.push("country");

  // Numeric fields: range / integer checks
  SLIDERS.forEach((s) => {
    const raw = form[s.name].value;
    const v = Number(raw);
    let bad = raw === "" || !Number.isFinite(v) || v < s.min || (s.max !== undefined && v > s.max);
    if (s.integer && !Number.isInteger(v)) bad = true;
    markInvalid(form[s.name], bad);
    if (bad) problems.push(s.name);
  });

  return problems.length === 0;
}

/* ===== Collect payload (exact API field names) ===== */
// Round to 1 decimal to avoid float artefacts from the 0.1 slider step
const round1 = (v) => Math.round(Number(v) * 10) / 10;

function collectPayload() {
  const data = {
    age: Number(form.age.value),
    gender: form.gender.value,
    country: canonicalCountry(countryIn.value),
    academic_level: form.academic_level.value,
    most_used_platform: form.most_used_platform.value,
    purpose_of_use: form.purpose_of_use.value,
    avg_daily_usage_hours: round1(form.avg_daily_usage_hours.value),
    daily_unlocks: Number(form.daily_unlocks.value),
    study_hours: round1(form.study_hours.value),
    physical_activity_hours: round1(form.physical_activity_hours.value),
    sleep_hours_per_night: round1(form.sleep_hours_per_night.value),
    stress_level: form.stress_level.value,
  };
  return data;
}

/* ===== UI helpers ===== */
function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
function hideError() { errorBox.hidden = true; }
function setLoading(on) {
  predictBtn.disabled = on;
  predictBtn.classList.toggle("loading", on);
  predictBtn.querySelector(".btn-label").textContent = on ? "Predicting…" : "Predict Mental Health Score";
}

/* Result card is always visible; switch between empty and filled states */
function setResultVisible(show) {
  resultEmpty.hidden = show;
  resultContent.hidden = !show;
}

function showResult(score) {
  scoreEl.textContent = score.toFixed(2);
  setResultVisible(true);
  gaugeFill.style.strokeDashoffset = CIRC; // reset, then animate
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const frac = Math.min(Math.max(score / SCORE_MAX, 0), 1);
    gaugeFill.style.strokeDashoffset = CIRC * (1 - frac);
  }));
  if (window.matchMedia("(max-width: 900px)").matches) {
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/* ===== API communication & error classification ===== */
class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

// Turn FastAPI's 422 `detail` array into "field: message; field: message"
function formatValidationDetail(detail) {
  if (Array.isArray(detail)) {
    return detail.map((d) => {
      const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== "body").join(".") : "";
      return field ? `${field}: ${d.msg}` : d.msg;
    }).join("; ");
  }
  return typeof detail === "string" ? detail : "";
}

// A failed fetch() (TypeError) looks identical for "server down" and "CORS blocked".
// Probe the server with a no-cors request: if it answers, the server is up and the
// browser blocked the real response (CORS headers missing, e.g. on a crashed request).
async function probeServer() {
  try { await fetch(new URL(API_URL).origin + "/", { mode: "no-cors" }); return true; }
  catch (_) { return false; }
}

async function requestPrediction(payload) {
  console.groupCollapsed("[predict] POST " + API_URL);
  console.log("Page origin:", location.origin, "| payload:", payload);
  try {
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      const serverUp = await probeServer();
      console.error("fetch failed:", netErr, "| server reachable:", serverUp);
      if (serverUp) {
        throw new ApiError("blocked",
          "The backend is running, but the browser blocked its response. This happens when the CORS headers " +
          "are missing, and FastAPI omits them when the request crashes with an unhandled error (HTTP 500). " +
          "Check the uvicorn terminal for a traceback.");
      }
      throw new ApiError("network",
        "Could not reach the prediction server at " + API_URL + ". Start it with " +
        "'uvicorn main:app --reload --host 127.0.0.1 --port 8000' from the folder containing main.py.");
    }

    const text = await res.text();
    console.log("Status:", res.status, res.statusText, "| body:", text);

    if (!res.ok) {
      let detail;
      try { detail = JSON.parse(text).detail; } catch (_) { /* body not JSON */ }
      if (res.status === 404) throw new ApiError("endpoint", "Endpoint not found (404). The backend has no POST /predict route at " + API_URL + ".");
      if (res.status === 405) throw new ApiError("endpoint", "Method not allowed (405). /predict must accept POST requests.");
      if (res.status === 422) throw new ApiError("validation", "The server rejected the input (422): " + (formatValidationDetail(detail) || "validation failed") + ".");
      if (res.status >= 500) throw new ApiError("server", "The server failed while predicting (HTTP " + res.status + "). " + (typeof detail === "string" ? detail + " " : "") + "Check the uvicorn terminal for the traceback.");
      throw new ApiError("http", "Unexpected response from the server (HTTP " + res.status + ").");
    }

    let data;
    try { data = JSON.parse(text); }
    catch (_) { throw new ApiError("invalid-json", "The server replied with invalid JSON. Check that " + API_URL + " is your FastAPI /predict route."); }

    const score = Number(data.predicted_mental_health_score);
    if (data.predicted_mental_health_score === undefined || data.predicted_mental_health_score === null || !Number.isFinite(score)) {
      throw new ApiError("invalid-json", "The response did not contain a numeric 'predicted_mental_health_score'.");
    }
    return score;
  } finally {
    console.groupEnd();
  }
}

/* ===== Submit ===== */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();
  setResultVisible(false);

  if (!validate()) {
    showError("Please correct the highlighted fields: choose every dropdown option, and keep numbers within their allowed range.");
    return;
  }

  setLoading(true);
  try {
    const score = await requestPrediction(collectPayload());
    showResult(score);
  } catch (err) {
    console.error("[predict] " + (err.kind || "error") + ":", err.message);
    showError(err.message);
  } finally {
    setLoading(false);
  }
});

/* ===== Predict again / reset ===== */
document.getElementById("again-btn").addEventListener("click", () => {
  setResultVisible(false);
  document.getElementById("predict").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("reset-btn").addEventListener("click", () => {
  form.reset();
  SLIDERS.forEach((s) => {            // form.reset() restores values; refresh labels/fill
    form[s.name].dispatchEvent(new Event("input"));
  });
  form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  hideError();
  setResultVisible(false);
  document.getElementById("predict").scrollIntoView({ behavior: "smooth" });
});

/* ===== Animated star particles (background) ===== */
function initStars() {
  const canvas = document.getElementById("stars");
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w, h, stars;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(140, Math.round((w * h) / 12000));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.2 + 0.3,
      v: Math.random() * 0.12 + 0.02,      // slow upward drift
      p: Math.random() * Math.PI * 2,      // twinkle phase
    }));
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const a = 0.35 + 0.45 * Math.sin(t / 1200 + s.p);
      ctx.fillStyle = `rgba(214, 205, 255, ${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      if (!reduce) { s.y -= s.v; if (s.y < -2) { s.y = h + 2; s.x = Math.random() * w; } }
    }
    if (!reduce) requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(draw);
}

/* ===== Init ===== */
buildSliders();
renderCountries();
initStars();
