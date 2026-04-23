# 🚦 RoadSense AI — Road Accident Risk & Severity Prediction System

A production-style web application for predicting road accident severity across India using a hybrid ML + local intelligence system.

---

## 📁 Project Structure

```
road_accident_app/
├── app.py                          # Flask backend + prediction API
├── requirements.txt                # Python dependencies
├── model.pkl                       # Trained Random Forest model
├── encoders.pkl                    # LabelEncoders for all features
├── local_data.csv                  # City-level local risk features
├── local_features_300_cities.csv   # Extended city intelligence dataset
├── templates/
│   └── index.html                  # Main frontend (Glassmorphism UI)
└── static/
    ├── css/
    │   └── style.css               # Premium dark UI styles
    └── js/
        └── script.js               # Frontend logic + API calls
```

---

##  Setup & Run

### 1. Install dependencies

```bash
cd road_accident_app
pip install -r requirements.txt
```

### 2. Start the Flask server

```bash
python app.py
```

### 3. Open in browser

```
http://localhost:5000
```

---

##  How It Works

### ML Layer
- **Model**: `RandomForestClassifier` (150 estimators, ~94% accuracy)
- **13 input features**: State, Time, Weather, Road Type, Road Condition, Lighting, Traffic Control, Speed, Vehicle Type, Age Group, Gender, License Status, Alcohol
- **Output**: Probability distribution over [Fatal, Minor, Serious]

### Hybrid Adjustment System
```
boost = (state_risk_score - 1.5) × 0.1 + local_score × 0.1

fatal_adj   = fatal_raw   + boost
serious_adj = serious_raw + boost × 0.5
minor_adj   = minor_raw   - boost × 1.5

→ Normalize all three → pick argmax → final prediction
```

### Local Intelligence
Each city is scored on 5 dimensions:
| Factor  | Weight |
|---------|--------|
| Animal crossing risk  | 30% |
| Terrain difficulty    | 25% |
| Traffic density       | 25% |
| School/pedestrian zones | 10% |
| Crime/road crime index | 10% |

### State Risk Index
Pre-computed weighted risk scores by state based on historical accident fatality data (NCRB/MoRTH). Scale: 1.0 (low) → 3.0 (high).

---

##  API Reference

### `POST /api/predict`

**Request body (JSON):**
```json
{
  "state":           "Rajasthan",
  "city":            "Jaipur",
  "time":            "Night",
  "weather":         "Rainy",
  "speed":           "High",
  "road_type":       "State Highway",
  "road_condition":  "Wet",
  "lighting":        "Dark",
  "traffic_control": "Signals",
  "vehicle":         "Car",
  "age_group":       "Adult",
  "gender":          "Male",
  "license":         "Valid",
  "alcohol":         "No"
}
```

**Response:**
```json
{
  "severity": "Fatal",
  "probabilities": { "Minor": 0.09, "Serious": 0.27, "Fatal": 0.64 },
  "state_risk": 2.4,
  "local_score": 0.75,
  "insights": [
    " Rainy conditions significantly reduce visibility and traction",
    " Nighttime driving with poor lighting increases fatal risk by 3×",
    " High-speed travel reduces reaction time and amplifies impact severity"
  ]
}
```

### `GET /api/cities`

Returns a JSON object mapping each state to its list of cities.

---

##  UI Features
- **Dark glassmorphism design** with animated gradient mesh background
- **Left sidebar** for all inputs with toggle groups and advanced options
- **Right panel** for live results with animated probability bars
- **Color-coded severity**: Green (Minor) → Amber (Serious) → Red (Fatal)
- **AI Insights** — contextual risk explanations per prediction
- **Responsive** — works on mobile and desktop

---

##  Dependencies
| Package | Purpose |
|---------|---------|
| `flask` | Web server + REST API |
| `joblib` | Loading `.pkl` model files |
| `pandas` | CSV data handling |
| `numpy`  | Numeric operations |
| `scikit-learn` | Model + LabelEncoder |

---

## Notes
- The sklearn version warning (`1.6.1 vs 1.8.0`) is harmless — the model works correctly. To eliminate it, retrain and re-save the model with your current sklearn version.
- Default fallback values are applied automatically for any missing inputs.
- Cities not found in the local dataset default to a local score of `0.0`.
