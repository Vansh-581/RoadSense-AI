# 🚦 RoadSense AI — Complete Code Explanation
### Every file, every function, every line explained in plain English

---

## 📁 PROJECT STRUCTURE — HOW FILES CONNECT

```
road_accident_app/
│
├── app.py                    ← BRAIN — Flask server, all ML logic, all API endpoints
├── model.pkl                 ← Trained Random Forest ML model (read-only, loaded once)
├── encoders.pkl              ← Dictionary of LabelEncoders for 13 features
├── local_data.csv            ← 87 cities with 5 risk factor columns
├── local_features_300_cities.csv ← 225 more cities with same 5 columns
│
├── templates/
│   └── index.html            ← FACE — Everything the user sees (3 tabs)
│
└── static/
    ├── css/style.css         ← SKIN — All visual styling, animations, colors
    └── js/script.js          ← HANDS — All user interactions, API calls, rendering
```

### How they connect:
```
User opens browser
      ↓
Flask (app.py) serves index.html
      ↓
Browser loads style.css (visuals) + script.js (behaviour)
      ↓
script.js calls Flask API endpoints (/api/predict, /api/weather etc.)
      ↓
Flask processes using model.pkl + encoders.pkl + CSV data
      ↓
Returns JSON → script.js renders results in index.html
```

---

# ═══════════════════════════════════════════
# FILE 1: app.py — THE BACKEND BRAIN
# ═══════════════════════════════════════════

## SECTION 1 — IMPORTS (Lines 1–6)

```python
from flask import Flask, request, jsonify, render_template
```
- `Flask` → creates the web server
- `request` → reads incoming data from the browser (form values, JSON)
- `jsonify` → converts Python dict to JSON to send back to browser
- `render_template` → serves the HTML file

```python
import joblib
```
- Used to LOAD the .pkl files (model and encoders)
- joblib is faster than pickle for large numpy arrays (like ML models)

```python
import pandas as pd
import numpy as np
```
- `pandas` → reads CSV files, creates DataFrames for prediction
- `numpy` → used for argmax (finding highest probability class)

```python
import os
```
- Used to build file paths that work on any operating system (Windows/Mac/Linux)

```python
import requests as http_requests
```
- Renamed to avoid conflict with Flask's `request`
- Used to call Google APIs (Weather, Directions, Geocoding) from Python

---

## SECTION 2 — APP STARTUP & FILE LOADING (Lines 8–22)

```python
app = Flask(__name__)
```
- Creates the Flask application. `__name__` tells Flask where to look for template/static folders.

```python
BASE = os.path.dirname(__file__)
```
- Gets the folder path of app.py itself
- Example: `C:\Users\You\road_accident_app`
- This makes all file paths relative to app.py, not wherever you run the script from

```python
model = joblib.load(os.path.join(BASE, "model.pkl"))
```
- Loads the pre-trained RandomForestClassifier from disk into RAM
- This happens ONCE when the server starts — not on every request
- `os.path.join` safely combines path + filename for any OS

```python
encoders = joblib.load(os.path.join(BASE, "encoders.pkl"))
```
- Loads a Python DICTIONARY where each key is a feature name
- Each value is a fitted LabelEncoder that knows how to convert text → number
- Example: `encoders["Weather Conditions"]` knows: Clear=0, Foggy=1, Hazy=2, Rainy=3, Stormy=4

```python
local_df  = pd.read_csv(os.path.join(BASE, "local_data.csv"))
local_df2 = pd.read_csv(os.path.join(BASE, "local_features_300_cities.csv"))
all_local = pd.concat([local_df, local_df2]).drop_duplicates(subset=["city", "state"])
```
- Reads BOTH city CSV files
- `pd.concat` stacks them vertically (like copy-pasting one below the other)
- `drop_duplicates` removes any city that appears in both files
- Result: one unified DataFrame with 237 unique cities and their risk scores

```python
FEATURE_ORDER = [
    "State Name","Time Category","Weather Conditions","Road Type",
    "Road Condition","Lighting Conditions","Traffic Control Presence",
    "Speed Category","Vehicle Type Involved","Age Group",
    "Driver Gender","Driver License Status","Alcohol Involvement",
]
```
- This is CRITICAL — the model was trained with features in this exact order
- If you pass features in wrong order, predictions will be completely wrong
- This list acts as the "column template" for every prediction

---

## SECTION 3 — API KEYS (Lines 24–25)

```python
GOOGLE_API_KEY   = "AIzaSy..."   # Maps + Directions + Geocoding
GOOGLE_WEATHER_KEY = "AIzaSy..."  # Weather API only
```
- Two separate keys because they can have different restrictions
- Maps key handles: Directions API (route finding) + Geocoding API (city → coordinates)
- Weather key handles: Google Weather API (current conditions)

---

## SECTION 4 — DATA STRUCTURES BUILT AT STARTUP (Lines 27–50)

```python
state_city_map = {}
for _, row in all_local.iterrows():
    s, c = row["state"], row["city"]
    state_city_map.setdefault(s, [])
    if c not in state_city_map[s]:
        state_city_map[s].append(c)
```
- Loops through every row in the combined city DataFrame
- Builds a dictionary: `{"Delhi": ["Delhi", "Delhi Urban", ...], "Rajasthan": ["Jaipur", ...]}`
- This is sent to the browser when the page loads so dropdowns can be populated
- `setdefault(s, [])` → if state key doesn't exist yet, create it with empty list

```python
KNOWN_STATE_RISK = {
    "Uttar Pradesh": 2.8,
    "Tamil Nadu":    2.7,
    ...
}
```
- Hand-crafted dictionary of state risk scores based on NCRB road accident data
- Scale: 1.0 (very safe) → 3.0 (very dangerous)
- Uttar Pradesh = 2.8 (highest) because it has India's most road fatalities
- Goa = 1.4 (lowest among included states) due to lower traffic volume

```python
city_state_map = {}
for _, row in all_local.iterrows():
    city_state_map[row["city"].lower()] = row["state"]
```
- Reverse lookup: given a city name → find its state
- Used in SafeRoute to score route waypoints
- `.lower()` makes lookup case-insensitive ("delhi" and "Delhi" both work)

---

## SECTION 5 — HELPER FUNCTIONS

### get_state_risk(state) — Lines 52–53
```python
def get_state_risk(state):
    return KNOWN_STATE_RISK.get(state, 1.5)
```
- Simple lookup: given state name → return its risk score
- `.get(state, 1.5)` → if state not found, return 1.5 as default (medium risk)

### compute_local_score(city) — Lines 55–59
```python
def compute_local_score(city):
    row = all_local[all_local["city"].str.lower() == city.lower()]
    if row.empty: return 0.0
    r = row.iloc[0]
    return float(
        r["animal"]  * 0.30 +   # Animal crossing risk (weight 30%)
        r["terrain"] * 0.25 +   # Terrain difficulty (weight 25%)
        r["traffic"] * 0.25 +   # Traffic density (weight 25%)
        r["school"]  * 0.10 +   # School/pedestrian zones (weight 10%)
        r["crime"]   * 0.10     # Crime/road crime index (weight 10%)
    )
```
- Searches the CSV for the city (case-insensitive)
- If city not found → returns 0.0 (no local adjustment)
- Each factor is scored 0, 1, or 2 in the CSV
- Weighted sum gives a local risk score between 0.0 and 2.0
- Example: Delhi (all max values) = 0*0.30 + 0*0.25 + 2*0.25 + 2*0.10 + 2*0.10 = 0.9

### run_prediction(user_input) — Lines 61–85
This is the CORE PREDICTION ENGINE. Here's what happens step by step:

```python
city = user_input.pop("_city", "")
```
- Removes the "_city" key from input before encoding
- City is not a model feature — it's only used for local score calculation
- `pop` removes and returns the value

```python
input_df = pd.DataFrame([user_input])
```
- Wraps the single dict into a DataFrame with 1 row
- The model expects a DataFrame, not a plain dict

```python
for col in FEATURE_ORDER:
    if col in encoders:
        le  = encoders[col]
        val = input_df[col].values[0]
        if val not in le.classes_: val = le.classes_[0]
        input_df[col] = le.transform([val])
```
- For each feature in the correct order:
  - Gets the LabelEncoder for that feature
  - Reads the current text value (e.g., "Rainy")
  - Safety check: if value isn't in the encoder's known classes, use the first class
  - Transforms text → number (e.g., "Rainy" → 3)

```python
input_df = input_df[FEATURE_ORDER]
```
- Reorders columns to match EXACTLY how model was trained
- This single line prevents "wrong column order" bugs

```python
probs = model.predict_proba(input_df)[0]
fatal_raw, minor_raw, serious_raw = probs[0], probs[1], probs[2]
```
- `predict_proba` returns probabilities for all 3 classes
- Model's internal class order is [0=Fatal, 1=Minor, 2=Serious]
- Example output: [0.55, 0.13, 0.32] → 55% Fatal, 13% Minor, 32% Serious

```python
state_score = get_state_risk(user_input["State Name"])
local_score = compute_local_score(city)
boost       = (state_score - 1.5) * 0.1 + local_score * 0.1
```
- Gets how risky the state is (e.g., 2.4 for Rajasthan)
- Gets local city score (e.g., 0.9 for Delhi)
- Calculates boost: how much to shift probabilities upward
- Formula breakdown:
  - `(2.4 - 1.5) * 0.1 = 0.09` → state contribution
  - `0.9 * 0.1 = 0.09` → local contribution
  - Total boost = 0.18

```python
fatal_adj   = max(fatal_raw   + boost,       0.0)
serious_adj = max(serious_raw + boost * 0.5, 0.0)
minor_adj   = max(minor_raw   - boost * 1.5, 0.0)
```
- Higher risk location → increase fatal & serious probabilities
- Decrease minor probability (if it's more risky, minor outcomes less likely)
- `max(..., 0.0)` → clamp to zero, probabilities can't be negative

```python
total = minor_adj + serious_adj + fatal_adj or 1.0
minor_adj/=total; serious_adj/=total; fatal_adj/=total
```
- After adjustment, probabilities no longer add to 1.0
- Divide each by total to renormalize back to 1.0
- `or 1.0` → safety: if total is 0 (impossible edge case), prevent divide by zero

```python
best_idx = int(np.argmax([fatal_adj, minor_adj, serious_adj]))
severity = ["Fatal","Minor","Serious"][best_idx]
```
- `argmax` finds index of highest value: 0=Fatal, 1=Minor, 2=Serious
- Maps index back to label string

### generate_insights(user_input, state_score, local_score) — Lines 87–111
```python
if weather in ["Rainy","Foggy","Stormy"]:
    insights.append(f"⚠️ {weather} conditions significantly reduce visibility...")
```
- Rule-based system — no ML needed
- Checks each condition and adds relevant warning message
- Returns a list of insight strings shown in the UI
- If no conditions trigger → returns a "conditions are moderate" message as fallback

### get_shap_values(user_input) — Lines 113–131
```python
try:
    import shap
    explainer = shap.TreeExplainer(model)
    sv = explainer.shap_values(input_df)
    ...
except:
    imp = model.feature_importances_
    ...
```
- Tries to use SHAP library first (install with `pip install shap`)
- SHAP = SHapley Additive exPlanations — shows which features pushed prediction up/down
- If SHAP not installed → falls back to model's built-in feature_importances_
- Either way returns top 6 features ranked by importance for THIS prediction
- Sorted descending: most impactful feature first

---

## SECTION 6 — API ROUTES (Flask Endpoints)

### GET / → index() — Line 133
```python
@app.route("/")
def index():
    return render_template("index.html", google_api_key=GOOGLE_API_KEY)
```
- When browser visits localhost:5000, this function runs
- `render_template` reads index.html and injects `google_api_key` as a variable
- In the HTML, `{{ google_api_key }}` is replaced with the actual key string
- This is how the Google Maps script tag gets the API key without hardcoding in HTML

### GET /api/cities → api_cities() — Line 137
```python
@app.route("/api/cities")
def api_cities():
    return jsonify(state_city_map)
```
- Returns the complete state→cities dictionary as JSON
- Called once when page loads by script.js to populate dropdowns
- Example response: `{"Delhi": ["Delhi", "Delhi Urban"], "Rajasthan": ["Jaipur", ...]}`

### GET /api/state-risks → api_state_risks() — Line 141
```python
@app.route("/api/state-risks")
def api_state_risks():
    return jsonify(KNOWN_STATE_RISK)
```
- Returns all state risk scores as JSON
- Used by the Heatmap tab to color each state circle

### POST /api/predict → predict() — Lines 145–174
```python
data = request.get_json(force=True)
```
- Reads the JSON body sent from the browser form
- `force=True` means parse as JSON even if Content-Type header is wrong

```python
user_input = {
    "State Name":  data.get("state", "Delhi"),
    ...
    "_city":       data.get("city", ""),
}
```
- Maps browser field names (like "state") to model feature names (like "State Name")
- `.get("state", "Delhi")` → if field missing, use "Delhi" as default
- `_city` prefixed with underscore = not a model feature, just metadata

```python
shap_input = {k:v for k,v in user_input.items() if not k.startswith("_")}
```
- Creates a copy of user_input WITHOUT the _city key
- Needed because SHAP needs exactly the 13 model features, not 14

```python
result = run_prediction(user_input)
insights = generate_insights(shap_input, result["state_risk"], result["local_score"])
shap_data = get_shap_values(shap_input)
```
- Runs all 3 analyses in sequence
- Note: `user_input` is modified by `run_prediction` (city is popped out)

```python
return jsonify({
    "severity": result["severity"],
    "probabilities": {"Minor": ..., "Serious": ..., "Fatal": ...},
    "state_risk": ..., "local_score": ...,
    "insights": insights,
    "shap": shap_data
})
```
- Packages everything into one JSON response
- Browser's script.js receives this and renders it all

### POST /api/route-risk → route_risk() — Lines 176–234
This is the SafeRoute engine:

```python
dir_url = "https://maps.googleapis.com/maps/api/directions/json"
params = {
    "origin":      origin + ", India",
    "destination": dest   + ", India",
    "alternatives":"true",
    "key":         GOOGLE_API_KEY
}
resp = http_requests.get(dir_url, params=params, timeout=10)
```
- Calls Google Directions API
- `alternatives: true` → asks for multiple route options (2–3 routes)
- Appends ", India" to help geocode correctly

```python
for idx, route in enumerate(dir_data["routes"]):
    legs = route["legs"]
    total_dist = sum(l["distance"]["value"] for l in legs) / 1000
    total_dur  = sum(l["duration"]["value"] for l in legs) // 60
```
- For each alternative route:
  - Sums up distance of all legs in meters → converts to km
  - Sums up duration of all legs in seconds → converts to minutes

```python
waypoints = []
for leg in legs:
    addr  = leg["end_address"]
    parts = [p.strip() for p in addr.split(",")]
    waypoints.append(parts[0])
```
- Google returns addresses like "Jaipur, Rajasthan 302001, India"
- Split by comma → take first part = city name
- These become the "checkpoints" for risk scoring

```python
for wpt in waypoints:
    state = city_state_map.get(wpt.lower(), "Delhi")
    ui = {"State Name": state, "Time Category": time, ...}
    res = run_prediction(ui)
    segment_scores.append({
        "city": wpt,
        "severity": res["severity"],
        "risk_score": round(res["Fatal"]*3 + res["Serious"]*2 + res["Minor"]*1, 3)
    })
```
- For each waypoint city, runs a silent ML prediction
- Risk score formula: Fatal contributes 3 points, Serious 2, Minor 1
- This creates a weighted danger score per city

```python
avg_risk = round(sum(s["risk_score"] for s in segment_scores) / max(len(segment_scores), 1), 3)
```
- Average risk score across all cities on the route
- `max(..., 1)` prevents division by zero if no waypoints found

```python
"polyline": route["overview_polyline"]["points"]
```
- Google returns the route as an encoded polyline string
- This is decoded by the Maps JavaScript API in the browser to draw the line on the map

```python
routes_out.sort(key=lambda r: r["risk_score"])
for i, r in enumerate(routes_out):
    r["rank"] = i
```
- Sorts routes from lowest risk to highest
- Assigns rank 0 = safest, 1 = moderate, 2 = riskiest

### GET /api/weather → get_weather() — Lines 259–318

```python
city = request.args.get("city", "Delhi")
```
- Reads the city from URL query string: `/api/weather?city=Mumbai`

```python
lat, lng = geocode_city(city)
```
- Calls Google Geocoding API to convert city name → coordinates
- `geocode_city` builds URL: `maps.googleapis.com/maps/api/geocode/json?address=Mumbai,India&key=...`
- Returns latitude=19.07 and longitude=72.87 for Mumbai

```python
weather_url = "https://weather.googleapis.com/v1/currentConditions:lookup"
params = {
    "key":                GOOGLE_WEATHER_KEY,
    "location.latitude":  lat,
    "location.longitude": lng,
    "unitsSystem":        "METRIC",
}
```
- Calls Google Weather API with the coordinates
- `METRIC` → returns temperature in Celsius, wind in km/h

```python
condition_type = wd.get("weatherCondition", {}).get("type", "CLEAR")
cat = GWEATHER_MAP.get(condition_type, "Clear")
```
- Google returns codes like "PARTLY_CLOUDY", "LIGHT_RAIN", "THUNDERSTORM"
- `GWEATHER_MAP` translates these to our 5 categories: Clear/Rainy/Foggy/Hazy/Stormy

```python
is_daytime = wd.get("isDaytime", True)
time = "Day" if is_daytime else "Night"
```
- Google tells us if it's currently daytime at that location
- Mapped to our Day/Night toggle value

```python
except Exception as e:
    hour = pd.Timestamp.now().hour
    return jsonify({"weather": "Clear", "time": "Day" if 6<=hour<18 else "Night", "source": "default"})
```
- If ANYTHING goes wrong (API key issue, network error, city not found)
- Falls back gracefully: assume Clear weather, auto-detect Day/Night from system clock
- App never crashes — always returns something useful

---

# ═══════════════════════════════════════════
# FILE 2: index.html — THE FACE
# ═══════════════════════════════════════════

## OVERALL STRUCTURE

```html
<body>
  <div class="bg-mesh">          ← Animated gradient background
  <nav class="topnav">           ← Tab bar at top (Predict / Heatmap / SafeRoute)
  <div id="tab-predict">         ← TAB 1: Prediction form + results panel
  <div id="tab-heatmap">         ← TAB 2: India risk heatmap
  <div id="tab-saferoute">       ← TAB 3: Route risk analyser
  <script>window.GOOGLE_API_KEY = "{{ google_api_key }}"</script>  ← Pass key to JS
  <script src="/static/js/script.js"></script>                     ← Load our JS
  <script src="maps.googleapis.com/maps/api/js?callback=initGoogleMaps">  ← Google Maps
</body>
```

## TOP NAVIGATION BAR

```html
<button class="nav-tab active" data-tab="predict">🔮 Predict</button>
<button class="nav-tab" data-tab="heatmap">🗺️ Heatmap</button>
<button class="nav-tab" data-tab="saferoute">🛣️ SafeRoute</button>
```
- `data-tab="predict"` is read by script.js to know which tab content to show
- `active` class = currently visible tab
- script.js handles clicking: removes `active` from all, adds to clicked one

## TAB 1 — PREDICT TAB

### Input Panel (Left Side)
```html
<form id="predForm" autocomplete="off">
```
- All inputs are inside this form
- `autocomplete="off"` stops browser from suggesting old values

```html
<select id="stateSelect" name="state" required>
  <option value="">— Select State —</option>
</select>
```
- Empty on load — script.js populates options after fetching /api/cities
- `name="state"` → this becomes the key when form data is collected

```html
<div class="toggle-group" id="timeToggle">
  <button type="button" class="tog active" data-val="Day">☀️ Day</button>
  <button type="button" class="tog" data-val="Night">🌙 Night</button>
</div>
<input type="hidden" id="timeInput" name="time" value="Day"/>
```
- Toggle buttons are NOT real form inputs — they're just buttons
- The HIDDEN input stores the actual value ("Day" or "Night")
- When a button is clicked → script.js sets the hidden input value
- `name="time"` → collected by FormData and sent to API

```html
<div class="weather-autofill-bar" id="weatherBar" style="display:none">
  <span id="weatherBarText">Live weather loaded</span>
  <button id="applyWeatherBtn">Apply</button>
</div>
```
- Hidden by default (display:none)
- Shown by script.js after live weather is fetched
- "Apply" button triggers `applyWeatherToForm()` in script.js

```html
<div class="advanced-toggle" id="advToggle">Advanced Options</div>
<div class="advanced-section" id="advSection">
  ... more inputs ...
</div>
```
- Advanced section is collapsed by default (max-height: 0 in CSS)
- Clicking toggle adds `open` class → CSS expands it via transition

```html
<button type="submit" class="predict-btn" id="predictBtn">
  <span class="btn-text">Analyse Risk</span>
  <span class="btn-loader" style="display:none"><span class="spinner"></span></span>
</button>
```
- Two spans inside the button — only one shown at a time
- Normal state: shows "Analyse Risk" text
- Loading state: hides text, shows spinner animation
- Managed by `setLoading()` function in script.js

### Results Panel (Right Side)

```html
<div class="empty-state" id="emptyState">...</div>
<div class="results-content" id="resultsContent" style="display:none">...</div>
```
- Initially shows the empty state (welcoming screen)
- After prediction: empty state hidden, results shown

```html
<div class="severity-card" id="severityCard">
  <div class="severity-icon" id="severityIcon"></div>
  <div class="severity-value" id="severityValue"></div>
</div>
```
- IDs allow script.js to inject content after prediction
- CSS class (`minor-card`, `serious-card`, `fatal-card`) is set by script.js

```html
<div class="prob-bars" id="probBars"></div>
```
- Empty container — script.js generates the bar HTML dynamically

```html
<div class="shap-bars" id="shapBars"></div>
```
- Empty container — script.js injects animated SHAP feature bars

## TAB 2 — HEATMAP TAB

```html
<div class="heatmap-state-list" id="heatmapStateList"></div>
```
- Empty list — script.js populates with state risk items after fetching /api/state-risks

```html
<div id="indiaMapContainer"></div>
```
- Empty container — script.js builds an SVG map and injects it here

## TAB 3 — SAFEROUTE TAB

```html
<input type="text" id="srOrigin" class="sr-input" placeholder="e.g. Delhi"/>
```
- Plain text input — user types a city name
- script.js listens for `input` events (debounced) and `blur` events
- Triggers weather fetch when 3+ characters typed

```html
<div class="weather-autofill-bar" id="srWeatherBar" style="display:none">
  <span id="srWeatherBarText"></span>
  <button id="srApplyWeatherBtn">Apply</button>
</div>
```
- Same weather bar pattern as Predict tab but for SafeRoute

```html
<div id="routeMap"></div>
<div class="map-placeholder" id="mapPlaceholder">...</div>
```
- `routeMap` is where Google Maps renders (initialized by `initGoogleMaps()`)
- `mapPlaceholder` shown before first route search; hidden once routes appear

```html
<script>
  window.GOOGLE_API_KEY = "{{ google_api_key }}";
</script>
```
- Flask injects the API key here at render time
- `window.GOOGLE_API_KEY` makes it globally accessible in script.js

```html
<script async defer src="https://maps.googleapis.com/maps/api/js?key={{ google_api_key }}&callback=initGoogleMaps">
```
- Loads Google Maps JavaScript SDK asynchronously
- `callback=initGoogleMaps` → calls our `initGoogleMaps()` function when ready
- `async defer` → doesn't block page load

---

# ═══════════════════════════════════════════
# FILE 3: script.js — THE HANDS
# ═══════════════════════════════════════════

## SECTION 1 — SHORTHAND HELPERS (Lines 2–3)

```javascript
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
```
- `$("myId")` → shorthand for `document.getElementById("myId")`
- `$$(".myClass")` → shorthand for `document.querySelectorAll(".myClass")`
- Makes code shorter and cleaner throughout

## SECTION 2 — TAB NAVIGATION (Lines 5–13)

```javascript
$$(".nav-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".nav-tab").forEach(b => b.classList.remove("active"));
    $$(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    $("tab-" + btn.dataset.tab).classList.add("active");
  });
});
```
- Selects all 3 nav buttons
- When any is clicked:
  1. Remove `active` from ALL buttons
  2. Remove `active` from ALL tab content divs (hides them via CSS)
  3. Add `active` to clicked button
  4. `btn.dataset.tab` reads the `data-tab` attribute (e.g., "predict")
  5. Shows `tab-predict` div by adding `active` class

## SECTION 3 — TOGGLE GROUP WIRING (Lines 15–31)

```javascript
function wireToggle(groupId, inputId) {
  const g = $(groupId);
  g.querySelectorAll(".tog").forEach(btn => {
    btn.addEventListener("click", () => {
      g.querySelectorAll(".tog").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      $(inputId).value = btn.dataset.val;
    });
  });
}
```
- Generic function that wires up any toggle group
- When a button clicked:
  1. Remove `active` from all buttons in this group
  2. Add `active` to clicked button (visual highlight)
  3. Set the hidden input's value to button's `data-val`
- Called 6 times for all toggle groups in both tabs

## SECTION 4 — CITY DROPDOWNS (Lines 39–63)

```javascript
async function loadCities() {
  const res = await fetch("/api/cities");
  cityMap = await res.json();
  const ss = $("stateSelect");
  ss.innerHTML = '<option value="">— Select State —</option>';
  Object.keys(cityMap).sort().forEach(s => {
    const o = document.createElement("option");
    o.value = s; o.textContent = s; ss.appendChild(o);
  });
}
```
- `async/await` → fetches data without freezing the browser
- `fetch("/api/cities")` → calls Flask endpoint
- After receiving response: sorts states alphabetically
- Creates `<option>` elements dynamically and appends to the select

```javascript
$("stateSelect").addEventListener("change", function () {
  const cs = $("citySelect");
  cs.innerHTML = '<option value="">— Select City —</option>';
  (cityMap[this.value] || []).forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c; cs.appendChild(o);
  });
  const city = (cityMap[this.value] || [])[0];
  if (city) fetchWeather(city, "predict");
});
```
- When state changes: clears city dropdown, fills with cities for that state
- `cityMap[this.value]` → looks up cities for selected state
- `|| []` → if state not found, use empty array (no crash)
- Auto-fetches weather for FIRST city in that state

## SECTION 5 — WEATHER SYSTEM (Lines 65–178)

```javascript
let liveWeatherData   = null;   // stores weather for Predict tab
let srLiveWeatherData = null;   // stores weather for SafeRoute tab
```
- Two separate variables so each tab has its own weather state

```javascript
async function fetchWeather(city, target = "predict") {
  const res  = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
  const data = await res.json();
```
- `encodeURIComponent` → makes city name URL-safe (spaces become %20)
- `target` parameter decides which tab to update

```javascript
  if (data.source === "google") {
    let text = `🌡️ ${data.description}`;
    if (data.temp !== null) text += `, ${data.temp}°C`;
    if (data.humidity !== null) text += ` · 💧${data.humidity}%`;
    if (data.rain_prob > 0) text += ` · 🌧️${data.rain_prob}% rain`;
    $("weatherBarText").textContent = text;
    bar.style.display = "flex";
  }
```
- Builds rich display text from weather data
- Only adds temp/humidity/rain if they're available (not null)
- Shows the green weather bar with Apply button

```javascript
function applyWeatherToForm(data, target) {
  if (target === "predict") {
    $("weatherSelect").value = data.weather || "Clear";
    if (data.time) setToggle("timeToggle", "timeInput", data.time);
    const lightSel = document.querySelector('select[name="lighting"]');
    if (lightSel) lightSel.value = data.time === "Night" ? "Dark" : "Daylight";
    if (data.weather === "Rainy" || data.weather === "Stormy") {
      document.querySelector('select[name="road_condition"]').value = "Wet";
    }
  } else {
    $("srWeather").value = data.weather || "Clear";
    if (data.time) setToggle("srTimeToggle", "srTimeInput", data.time);
    if (data.weather === "Stormy" || data.weather === "Foggy") {
      setToggle("srSpeedToggle", "srSpeedInput", "Low");
    } else if (data.weather === "Rainy") {
      setToggle("srSpeedToggle", "srSpeedInput", "Moderate");
    }
  }
}
```
- Predict tab: sets weather + time + lighting + road condition
- SafeRoute tab: sets weather + time + auto-suggests speed based on conditions
- Stormy/Foggy → suggests Low speed (dangerous)
- Rainy → suggests Moderate speed

```javascript
let srWeatherTimer = null;
$("srOrigin").addEventListener("input", function () {
  clearTimeout(srWeatherTimer);
  if (val.length >= 3) {
    srWeatherTimer = setTimeout(() => fetchWeather(val, "saferoute"), 800);
  }
});
```
- DEBOUNCE pattern: prevents API call on every single keystroke
- Each keystroke cancels the previous timer and starts a new 800ms countdown
- Only fetches weather after user STOPS typing for 800 milliseconds
- `length >= 3` → doesn't fire for 1–2 character inputs

## SECTION 6 — PREDICT FORM SUBMISSION (Lines 187–214)

```javascript
$("predForm").addEventListener("submit", async function(e) {
  e.preventDefault();
```
- `e.preventDefault()` → stops the form from doing a traditional page reload
- We handle submission ourselves via fetch (AJAX)

```javascript
  const payload = {};
  for (const [k,v] of new FormData(this).entries()) payload[k] = v;
```
- `new FormData(this)` → collects ALL form inputs including hidden ones
- Converts to a plain object `{state: "Delhi", time: "Day", ...}`
- Hidden inputs (timeInput, speedInput etc.) are included here

```javascript
  const res = await fetch("/api/predict", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
```
- POST request to Flask
- `JSON.stringify` converts the JS object to a JSON string for the request body

```javascript
function setLoading(btn, on) {
  btn.disabled = on;
  btn.querySelector(".btn-text").style.display   = on ? "none" : "flex";
  btn.querySelector(".btn-loader").style.display = on ? "flex"  : "none";
}
```
- Toggles button between normal and loading state
- `disabled = true` prevents double-clicking
- Shows spinner while API call is in progress

## SECTION 7 — RENDERING RESULTS (Lines 216–270)

```javascript
const SEV_CFG = {
  Minor:   { icon:"✅", cls:"minor-card",   desc:"Low risk..." },
  Serious: { icon:"⚠️", cls:"serious-card", desc:"Elevated risk..." },
  Fatal:   { icon:"🔴", cls:"fatal-card",   desc:"High risk..." },
};
```
- Configuration object for each severity level
- Contains: emoji icon, CSS class to apply, description text

```javascript
card.className = `severity-card ${cfg.cls}`;
$("severityIcon").textContent  = cfg.icon;
$("severityValue").textContent = severity;
```
- Sets the card's CSS class → CSS automatically applies correct color theme
- `minor-card` → green glow, `serious-card` → amber, `fatal-card` → red

```javascript
[["Minor","bar-minor"],["Serious","bar-serious"],["Fatal","bar-fatal"]].forEach(([label,cls]) => {
  const pct = Math.round((probabilities[label]||0)*100);
  d.innerHTML = `...
    <div class="prob-bar-fill" data-pct="${pct}"></div>
  `;
});
setTimeout(() => bars.querySelectorAll(".prob-bar-fill").forEach(el => el.style.width = el.dataset.pct + "%"), 80);
```
- Creates 3 probability bars dynamically
- `data-pct` stores the target width
- `setTimeout` with 80ms → starts at 0% width, then CSS transition animates to target
- Without the timeout, there'd be no animation (browser wouldn't see the 0→pct transition)

```javascript
const maxV = shap[0].value || 1;
shap.forEach(({ feature, value }) => {
  const pct = Math.round((value / maxV) * 100);
```
- SHAP values are normalized: top feature = 100%, others relative to it
- Creates animated bars showing each feature's influence

## SECTION 8 — HEATMAP (Lines 285–408)

```javascript
const STATE_COORDS = {
  "Delhi":          [28.6, 77.2],
  "Maharashtra":    [19.7, 75.7],
  ...
};
```
- Hard-coded lat/lng coordinates for each state's approximate center
- Used to position circles on the SVG map

```javascript
function project(lat, lng) {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * W * 0.9 + W * 0.05;
  const y = H - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * H * 0.9 - H * 0.05;
  return [x, y];
}
```
- Converts real-world latitude/longitude to SVG pixel coordinates
- India bounding box: lat 8°N to 37°N, lng 68°E to 97°E
- The formula maps this range to the SVG canvas size
- Y is inverted: lat increases northward, but SVG y increases downward

```javascript
const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
circle.setAttribute("fill", color);
circle.setAttribute("filter", "url(#glow)");
```
- Creates SVG circle element for each state
- Color is from `riskColor()` function: green/amber/red based on score
- `filter: url(#glow)` applies a blur+merge SVG filter for the glowing effect

```javascript
circle.addEventListener("click", () => selectStateFromHeatmap(state));
```

```javascript
function selectStateFromHeatmap(state) {
  // Switch to predict tab
  document.querySelector('[data-tab="predict"]').classList.add("active");
  $("tab-predict").classList.add("active");
  // Set the state dropdown
  ss.value = opt.value;
  ss.dispatchEvent(new Event("change"));
}
```
- Clicking a state bubble switches to Predict tab
- `dispatchEvent(new Event("change"))` → programmatically triggers the change event
- This causes cities to load AND weather to be fetched automatically

## SECTION 9 — SAFEROUTE (Lines 410–545)

```javascript
function initGoogleMaps() {
  googleMap = new google.maps.Map($("routeMap"), {
    center: {lat: 22.5, lng: 80.0},   // Center of India
    zoom: 5,
    styles: darkMapStyle(),
  });
}
```
- Called by Google Maps SDK after it loads (via `callback=initGoogleMaps` in script tag)
- Creates dark-themed map centered on India
- `darkMapStyle()` returns an array of style overrides for dark theme

```javascript
$("srAnalyseBtn").addEventListener("click", async function() {
  const res = await fetch("/api/route-risk", {
    method: "POST",
    body: JSON.stringify({
      origin, destination: dest,
      time:    $("srTimeInput").value,
      weather: $("srWeather").value,
      speed:   $("srSpeedInput").value,
    })
  });
```
- Sends origin, destination, and current conditions to Flask
- Flask calls Google Directions API + runs ML predictions on waypoints

```javascript
function renderRoutes(routes) {
  mapPolylines.forEach(p => p.setMap(null));
  mapPolylines = [];
```
- First clears any previously drawn routes from the map
- `setMap(null)` removes a polyline from the map

```javascript
  const path = google.maps.geometry.encoding.decodePath(route.polyline);
  const poly = new google.maps.Polyline({
    path, map: googleMap,
    strokeColor: color,
    strokeOpacity: isSafest ? 1.0 : 0.55,
    strokeWeight: isSafest ? 5 : 3,
  });
```
- `decodePath` converts Google's compressed polyline string into array of lat/lng points
- Draws the route line on map
- Safest route: solid (opacity 1.0), thicker (weight 5)
- Other routes: semi-transparent (0.55), thinner (weight 3)

```javascript
  if (i === 0 && path.length) {
    const bounds = new google.maps.LatLngBounds();
    path.forEach(p => bounds.extend(p));
    googleMap.fitBounds(bounds, 60);
  }
```
- Calculates bounding box that fits the entire safest route
- `fitBounds` auto-zooms the map to show the whole route
- `60` = padding in pixels around the route

```javascript
function highlightRoute(idx) {
  mapPolylines.forEach((poly, i) => {
    poly.setOptions({
      strokeOpacity: i===idx ? 1.0 : 0.3,
      strokeWeight:  i===idx ? 6   : 2,
    });
  });
}
```
- When user clicks a route card, highlights that polyline on the map
- Other routes become faded (opacity 0.3)

---

# ═══════════════════════════════════════════
# FILE 4: style.css — THE SKIN
# ═══════════════════════════════════════════

## CSS VARIABLES (Lines 1–20)

```css
:root {
  --bg:         #0b0f19;     /* Dark navy background */
  --surface:    rgba(255,255,255,.045);  /* Very subtle white overlay = glass effect */
  --border:     rgba(255,255,255,.10);   /* Subtle white borders */
  --accent:     #4f8ef7;     /* Blue accent color */
  --minor-clr:  #22c55e;     /* Green for Minor severity */
  --serious-clr:#f59e0b;     /* Amber for Serious severity */
  --fatal-clr:  #ef4444;     /* Red for Fatal severity */
}
```
- CSS variables defined once, used everywhere
- Changing `--accent` updates ALL blue elements across the app
- Makes theming consistent

## ANIMATED BACKGROUND

```css
.bg-mesh {
  position: fixed; inset: 0;
  background:
    radial-gradient(ellipse 60% 60% at 15% 20%, rgba(79,142,247,.12) 0%, transparent 70%),
    radial-gradient(ellipse 50% 50% at 85% 80%, rgba(139,92,246,.10) 0%, transparent 70%),
    radial-gradient(ellipse 40% 40% at 50% 50%, rgba(239,68,68,.06) 0%, transparent 70%);
  animation: meshDrift 18s ease-in-out infinite alternate;
}
```
- 3 overlapping radial gradients: blue top-left, purple bottom-right, red center
- `position: fixed` → stays behind everything
- `inset: 0` → covers entire viewport
- `meshDrift` animation slowly scales and rotates for a living, breathing feel

## GLASSMORPHISM CARDS

```css
.input-panel {
  background: rgba(10,14,25,.75);     /* 75% opaque dark background */
  backdrop-filter: blur(24px) saturate(160%);  /* Blur what's behind */
  border-right: 1px solid var(--border);
}
```
- `backdrop-filter: blur()` = the glass effect — blurs whatever is behind the element
- `saturate(160%)` = slightly boosts colors visible through the glass
- Semi-transparent background + blur = frosted glass look

## SEVERITY CARD GLOW

```css
.severity-card::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 70% 70% at 50% 0%, var(--card-glow) 0%, transparent 70%);
}
.severity-card.minor-card   { --card-glow: rgba(34,197,94,.2); }
.severity-card.serious-card { --card-glow: rgba(245,158,11,.2); }
.severity-card.fatal-card   { --card-glow: rgba(239,68,68,.2); }
```
- `::before` pseudo-element creates the top glow without extra HTML
- Each severity class sets a different `--card-glow` color
- Glow positioned at top center (`at 50% 0%`) → light coming from above effect

## ANIMATED PROBABILITY BARS

```css
.prob-bar-fill {
  width: 0%;                                    /* Start at 0 */
  transition: width 1s cubic-bezier(.4,0,.2,1); /* Animate to target */
}
```
- Bars start at 0% width
- script.js sets `width: 60%` after 80ms → CSS transition animates it smoothly
- `cubic-bezier(.4,0,.2,1)` = Material Design easing curve (fast start, slow end)

## RESPONSIVE LAYOUT

```css
@media (max-width: 900px) {
  .app-shell { grid-template-columns: 1fr; }  /* Stack instead of side-by-side */
  .input-panel { border-right: none; border-bottom: 1px solid var(--border); }
}
```
- Below 900px width (mobile/tablet): sidebar moves above results panel
- Border changes from right to bottom to match new stacking direction

---

# ═══════════════════════════════════════════
# COMPLETE DATA FLOW DIAGRAM
# ═══════════════════════════════════════════

## Flow 1: Page Load
```
Browser visits localhost:5000
  → Flask serves index.html (with API key injected)
  → Browser loads style.css (visual styles)
  → Browser loads script.js (starts executing)
    → loadCities() → GET /api/cities → Flask returns state_city_map
    → Populates state dropdown with 27 states
    → initHeatmap() → GET /api/state-risks → Flask returns KNOWN_STATE_RISK
    → Builds SVG map with colored circles
    → autoSetTime() → sets Day/Night toggle based on system clock
  → Google Maps SDK loads → calls initGoogleMaps() → creates dark map
```

## Flow 2: Prediction
```
User selects "Maharashtra" from State dropdown
  → citySelect populated with Mumbai, Pune, Nagpur...
  → fetchWeather("Mumbai", "predict") called
    → GET /api/weather?city=Mumbai
    → Flask: geocode Mumbai → lat:19.07, lng:72.87
    → Flask: call Google Weather API → returns PARTLY_CLOUDY, 32°C, 45% humidity
    → Returns JSON to browser
    → Browser shows green bar: "🌡️ Partly Cloudy, 32°C · 💧45%"

User clicks "Apply" on weather bar
  → weatherSelect set to "Clear"
  → timeToggle set to "Day"
  → lighting set to "Daylight"

User clicks "Analyse Risk"
  → form data collected: {state:"Maharashtra", city:"Mumbai", time:"Day", weather:"Clear"...}
  → POST /api/predict with JSON body
  → Flask:
    → Maps field names to model feature names
    → Encodes all 13 features using LabelEncoders
    → Reorders columns to match FEATURE_ORDER
    → model.predict_proba() → [0.23, 0.52, 0.25] (Fatal/Minor/Serious)
    → get_state_risk("Maharashtra") → 2.5
    → compute_local_score("Mumbai") → 0.9
    → boost = (2.5-1.5)*0.1 + 0.9*0.1 = 0.19
    → Adjusted: Fatal=0.42, Serious=0.44, Minor=0.14 (after normalize)
    → Predicted severity: "Serious"
    → generate_insights() → [...warning messages]
    → get_shap_values() → top 6 feature importances
    → Returns complete JSON response
  → Browser renderResults():
    → Sets card class to "serious-card" (amber theme)
    → Animates probability bars to target widths
    → Renders SHAP bars
    → Shows insights list
```

## Flow 3: SafeRoute
```
User types "Delhi" in Origin field
  → After 800ms debounce → fetchWeather("Delhi", "saferoute")
  → Weather bar appears in SafeRoute sidebar
User types "Jaipur" in Destination
User clicks "Find Safest Route"
  → POST /api/route-risk: {origin:"Delhi", destination:"Jaipur", time:"Day"...}
  → Flask:
    → Calls Google Directions API → returns 2 alternate routes
    → Route 1: Delhi → Gurgaon → Alwar → Jaipur (via NH48)
    → Route 2: Delhi → Faridabad → Mathura → Jaipur (via NH19)
    → For each city on each route:
        run_prediction() → get ML risk score
    → Route 1 avg_risk: 2.34
    → Route 2 avg_risk: 1.87  ← SAFEST
    → Sorted: [Route 2 (rank 0), Route 1 (rank 1)]
    → Returns with encoded polylines
  → Browser renderRoutes():
    → Decodes polylines → draws green line (safest) and yellow line (other)
    → Creates route cards with risk scores and city chips
    → Auto-zooms map to fit the safest route
    → User clicks Route 1 card → highlightRoute(0) → that line becomes bold
```

## Flow 4: Heatmap Click
```
User clicks "Rajasthan" circle on heatmap
  → selectStateFromHeatmap("Rajasthan")
    → Switches to Predict tab (removes active from heatmap tab, adds to predict tab)
    → Finds "Rajasthan" option in stateSelect dropdown
    → Sets dropdown value and fires "change" event
      → Populates cities: Jaipur, Udaipur, Jodhpur...
      → fetchWeather("Jaipur", "predict") called automatically
    → User can now predict directly for Rajasthan
```

---

## 🔑 KEY CONCEPTS SUMMARY

| Concept | Where | What it does |
|---------|-------|-------------|
| LabelEncoder | app.py | Converts text → number for ML model |
| FEATURE_ORDER | app.py | Ensures columns in correct order for model |
| Hybrid Boost | run_prediction() | Adjusts ML probabilities using location risk |
| Debounce | script.js | Prevents API spam while user types |
| Hidden Inputs | index.html | Stores toggle button values for form submission |
| CSS Variables | style.css | Centralized color/style management |
| backdrop-filter | style.css | Creates the glass effect on panels |
| predict_proba | app.py | Returns probability for each class, not just the winner |
| data-tab attribute | index.html | Connects nav buttons to their content panels |
| dispatchEvent | script.js | Programmatically triggers events (used in heatmap click) |
| async/await | script.js | Non-blocking API calls — page stays responsive |
| setTimeout + width | script.js | Triggers CSS bar animations after DOM renders |

