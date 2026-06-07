import pandas as pd, joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder

FEATURE_ORDER = [
    "State Name","Time Category","Weather Conditions","Road Type",
    "Road Condition","Lighting Conditions","Traffic Control Presence",
    "Speed Category","Vehicle Type Involved","Age Group",
    "Driver Gender","Driver License Status","Alcohol Involvement",
]

df = pd.read_csv("enhanced_accident_data_v2.csv")
target_col = next(c for c in df.columns if "severity" in c.lower())

# ── Derive binned columns that the model expects ──────────────────────────────

# Time Category  (from "Time of Day" string like "14:30")
def parse_hour(t):
    try:
        return int(str(t).split(":")[0])
    except:
        return 12

def hour_to_category(h):
    if 6 <= h < 12:  return "Morning"
    if 12 <= h < 18: return "Afternoon"
    if 18 <= h < 21: return "Evening"
    return "Night"

if "Time Category" not in df.columns:
    df["Time Category"] = df["Time of Day"].apply(
        lambda t: hour_to_category(parse_hour(t))
    )

# Speed Category  (from "Speed Limit (km/h)")
def speed_to_category(s):
    try:
        s = float(s)
    except:
        return "Moderate"
    if s < 40:   return "Low"
    if s < 80:   return "Moderate"
    return "High"

if "Speed Category" not in df.columns:
    df["Speed Category"] = df["Speed Limit (km/h)"].apply(speed_to_category)

# Age Group  (from "Driver Age")
def age_to_group(a):
    try:
        a = int(a)
    except:
        return "Adult"
    if a < 25:  return "Young"
    if a < 60:  return "Adult"
    return "Senior"

if "Age Group" not in df.columns:
    df["Age Group"] = df["Driver Age"].apply(age_to_group)

# ─────────────────────────────────────────────────────────────────────────────

feature_cols = [c for c in FEATURE_ORDER if c in df.columns]
df = df[feature_cols + [target_col]].dropna()

encoders = {}
for col in feature_cols:
    le = LabelEncoder()
    df[col] = le.fit_transform(df[col].astype(str))
    encoders[col] = le

y = LabelEncoder().fit_transform(df[target_col].astype(str))
clf = RandomForestClassifier(n_estimators=200, max_depth=12, random_state=42, n_jobs=-1)
clf.fit(df[feature_cols], y)

joblib.dump(clf,      "model.pkl")
joblib.dump(encoders, "encoders.pkl")
print("Done — model.pkl and encoders.pkl updated.")