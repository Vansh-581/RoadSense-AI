from flask import Flask, request, jsonify, render_template
import joblib
import pandas as pd
import numpy as np
import os
import requests as http_requests
from dotenv import load_dotenv
load_dotenv() # Loads keys from .env locally
app = Flask(__name__)

BASE = os.path.dirname(__file__)
model    = joblib.load(os.path.join(BASE, "model.pkl"))
encoders = joblib.load(os.path.join(BASE, "encoders.pkl"))
local_df  = pd.read_csv(os.path.join(BASE, "local_data.csv"))
local_df2 = pd.read_csv(os.path.join(BASE, "local_features_300_cities.csv"))
all_local = pd.concat([local_df, local_df2]).drop_duplicates(subset=["city", "state"])

FEATURE_ORDER = [
    "State Name","Time Category","Weather Conditions","Road Type",
    "Road Condition","Lighting Conditions","Traffic Control Presence",
    "Speed Category","Vehicle Type Involved","Age Group",
    "Driver Gender","Driver License Status","Alcohol Involvement",
]
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GOOGLE_WEATHER_KEY = os.getenv("GOOGLE_WEATHER_KEY")

if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY is missing")

if not GOOGLE_WEATHER_KEY:
    raise ValueError("GOOGLE_WEATHER_KEY is missing")

state_city_map = {}
for _, row in all_local.iterrows():
    s, c = row["state"], row["city"]
    state_city_map.setdefault(s, [])
    if c not in state_city_map[s]:
        state_city_map[s].append(c)

KNOWN_STATE_RISK = {
    "Uttar Pradesh":2.8,"Tamil Nadu":2.7,"Madhya Pradesh":2.6,
    "Maharashtra":2.5,"Karnataka":2.4,"Rajasthan":2.4,
    "Andhra Pradesh":2.3,"Telangana":2.2,"Gujarat":2.2,
    "West Bengal":2.1,"Bihar":2.0,"Haryana":2.0,
    "Jharkhand":1.9,"Odisha":1.9,"Punjab":1.8,
    "Chhattisgarh":1.8,"Uttarakhand":1.7,"Himachal Pradesh":1.6,
    "Kerala":1.6,"Assam":1.6,"Delhi":1.5,"Goa":1.4,
    "Chandigarh":1.5,"Jammu and Kashmir":1.7,"Jammu & Kashmir":1.7,
    "Manipur":1.5,"Mizoram":1.4,"Meghalaya":1.5,
    "Sikkim":1.3,"Arunachal Pradesh":1.4,"Tripura":1.4,
    "Nagaland":1.4,"Puducherry":1.5,
}

city_state_map = {}
for _, row in all_local.iterrows():
    city_state_map[row["city"].lower()] = row["state"]

def get_state_risk(state):
    return KNOWN_STATE_RISK.get(state, 1.5)

def compute_local_score(city):
    row = all_local[all_local["city"].str.lower() == city.lower()]
    if row.empty: return 0.0
    r = row.iloc[0]
    return float(r["animal"]*0.30 + r["terrain"]*0.25 + r["traffic"]*0.25 + r["school"]*0.10 + r["crime"]*0.10)

def run_prediction(user_input):
    city = user_input.pop("_city", "")
    input_df = pd.DataFrame([user_input])
    for col in FEATURE_ORDER:
        if col in encoders:
            le  = encoders[col]
            val = input_df[col].values[0]
            if val not in le.classes_: val = le.classes_[0]
            input_df[col] = le.transform([val])
    input_df = input_df[FEATURE_ORDER]
    probs = model.predict_proba(input_df)[0]
    fatal_raw, minor_raw, serious_raw = probs[0], probs[1], probs[2]
    state_score = get_state_risk(user_input["State Name"])
    local_score = compute_local_score(city)
    boost       = (state_score - 1.5)*0.1 + local_score*0.1
    fatal_adj   = max(fatal_raw   + boost,       0.0)
    serious_adj = max(serious_raw + boost*0.5,   0.0)
    minor_adj   = max(minor_raw   - boost*1.5,   0.0)
    total = minor_adj + serious_adj + fatal_adj or 1.0
    minor_adj/=total; serious_adj/=total; fatal_adj/=total
    best_idx = int(np.argmax([fatal_adj, minor_adj, serious_adj]))
    severity = ["Fatal","Minor","Serious"][best_idx]
    return {"severity":severity,"Minor":round(float(minor_adj),3),
            "Serious":round(float(serious_adj),3),"Fatal":round(float(fatal_adj),3),
            "state_risk":round(float(state_score),2),"local_score":round(float(local_score),2)}

def generate_insights(user_input, state_score, local_score):
    insights = []
    weather = user_input.get("Weather Conditions","")
    time    = user_input.get("Time Category","")
    speed   = user_input.get("Speed Category","")
    alcohol = user_input.get("Alcohol Involvement","No")
    road_c  = user_input.get("Road Condition","")
    light   = user_input.get("Lighting Conditions","")
    if weather in ["Rainy","Foggy","Stormy"]:
        insights.append(f"⚠️ {weather} conditions significantly reduce visibility and traction")
    if time=="Night" and light in ["Dark","Dusk"]:
        insights.append("🌙 Nighttime driving with poor lighting increases fatal risk by 3×")
    if speed=="High":
        insights.append("🚗 High-speed travel reduces reaction time and amplifies impact severity")
    if alcohol=="Yes":
        insights.append("🍺 Alcohol involvement is the leading cause of fatal accidents in India")
    if road_c in ["Damaged","Under Construction"]:
        insights.append(f"🏗️ {road_c} road surfaces increase accident severity risk")
    if state_score >= 2.5:
        insights.append("📍 This state has an above-average road accident fatality rate")
    if local_score >= 1.2:
        insights.append("🏙️ High urban density and traffic congestion compound accident risk")
    if not insights:
        insights.append("✅ Conditions are relatively moderate — drive carefully regardless")
    return insights

def get_shap_values(user_input):
    try:
        import shap
        input_df = pd.DataFrame([user_input])
        for col in FEATURE_ORDER:
            if col in encoders:
                le=encoders[col]; val=input_df[col].values[0]
                if val not in le.classes_: val=le.classes_[0]
                input_df[col]=le.transform([val])
        input_df=input_df[FEATURE_ORDER]
        explainer=shap.TreeExplainer(model)
        sv=explainer.shap_values(input_df)
        vals=sv[0][0] if isinstance(sv,list) else sv[0]
        pairs=sorted(zip(FEATURE_ORDER,np.abs(vals)),key=lambda x:x[1],reverse=True)
        return [{"feature":k,"value":round(float(v),4)} for k,v in pairs[:6]]
    except:
        imp=model.feature_importances_
        pairs=sorted(zip(FEATURE_ORDER,imp),key=lambda x:x[1],reverse=True)
        return [{"feature":k,"value":round(float(v),4)} for k,v in pairs[:6]]

@app.route("/")
def index():
    return render_template("index.html", google_api_key=GOOGLE_API_KEY)

@app.route("/api/cities")
def api_cities():
    return jsonify(state_city_map)

@app.route("/api/state-risks")
def api_state_risks():
    return jsonify(KNOWN_STATE_RISK)

@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data=request.get_json(force=True)
        user_input={
            "State Name":               data.get("state","Delhi"),
            "Time Category":            data.get("time","Day"),
            "Weather Conditions":       data.get("weather","Clear"),
            "Road Type":                data.get("road_type","Urban Road"),
            "Road Condition":           data.get("road_condition","Dry"),
            "Lighting Conditions":      data.get("lighting","Daylight"),
            "Traffic Control Presence": data.get("traffic_control","Signals"),
            "Speed Category":           data.get("speed","Moderate"),
            "Vehicle Type Involved":    data.get("vehicle","Car"),
            "Age Group":                data.get("age_group","Adult"),
            "Driver Gender":            data.get("gender","Male"),
            "Driver License Status":    data.get("license","Valid"),
            "Alcohol Involvement":      data.get("alcohol","No"),
            "_city":                    data.get("city",""),
        }
        shap_input={k:v for k,v in user_input.items() if not k.startswith("_")}
        result=run_prediction(user_input)
        insights=generate_insights(shap_input,result["state_risk"],result["local_score"])
        shap_data=get_shap_values(shap_input)
        return jsonify({"severity":result["severity"],
                        "probabilities":{"Minor":result["Minor"],"Serious":result["Serious"],"Fatal":result["Fatal"]},
                        "state_risk":result["state_risk"],"local_score":result["local_score"],
                        "insights":insights,"shap":shap_data})
    except Exception as e:
        return jsonify({"error":str(e)}),500

@app.route("/api/route-risk", methods=["POST"])
def route_risk():
    try:
        data   =request.get_json(force=True)
        origin =data.get("origin","")
        dest   =data.get("destination","")
        time   =data.get("time","Day")
        weather=data.get("weather","Clear")
        speed  =data.get("speed","Moderate")
        if not origin or not dest:
            return jsonify({"error":"Origin and destination required"}),400
        dir_url="https://maps.googleapis.com/maps/api/directions/json"
        params={"origin":origin+", India","destination":dest+", India",
                "alternatives":"true","key":GOOGLE_API_KEY}
        resp=http_requests.get(dir_url,params=params,timeout=10)
        dir_data=resp.json()
        if dir_data.get("status")!="OK":
            return jsonify({"error":f"Directions API error: {dir_data.get('status')}. Make sure Directions API is enabled."}),400
        routes_out=[]
        for idx,route in enumerate(dir_data["routes"]):
            legs=route["legs"]
            total_dist=sum(l["distance"]["value"] for l in legs)/1000
            total_dur =sum(l["duration"]["value"] for l in legs)//60
            summary   =route.get("summary",f"Route {idx+1}")
            waypoints=[]
            for leg in legs:
                addr=leg["end_address"]
                parts=[p.strip() for p in addr.split(",")]
                waypoints.append(parts[0])
            for leg in legs:
                addr=leg["start_address"]
                parts=[p.strip() for p in addr.split(",")]
                waypoints.insert(0,parts[0])
            waypoints=list(dict.fromkeys(waypoints))[:6]
            segment_scores=[]
            for wpt in waypoints:
                state=city_state_map.get(wpt.lower(),"Delhi")
                ui={"State Name":state,"Time Category":time,
                    "Weather Conditions":weather,"Road Type":"National Highway",
                    "Road Condition":"Dry","Lighting Conditions":"Daylight" if time=="Day" else "Dark",
                    "Traffic Control Presence":"Signals","Speed Category":speed,
                    "Vehicle Type Involved":"Car","Age Group":"Adult",
                    "Driver Gender":"Male","Driver License Status":"Valid",
                    "Alcohol Involvement":"No","_city":wpt}
                res=run_prediction(ui)
                segment_scores.append({"city":wpt,"severity":res["severity"],
                    "fatal_prob":res["Fatal"],
                    "risk_score":round(res["Fatal"]*3+res["Serious"]*2+res["Minor"]*1,3)})
            avg_risk=round(sum(s["risk_score"] for s in segment_scores)/max(len(segment_scores),1),3)
            routes_out.append({"index":idx,"summary":summary,
                "distance":round(total_dist,1),"duration":total_dur,
                "risk_score":avg_risk,"segments":segment_scores,
                "polyline":route["overview_polyline"]["points"]})
        routes_out.sort(key=lambda r:r["risk_score"])
        for i,r in enumerate(routes_out): r["rank"]=i
        return jsonify({"routes":routes_out})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error":str(e)}),500

def geocode_city(city):
    """Convert city name → (lat, lng) using Google Geocoding API."""
    url  = "https://maps.googleapis.com/maps/api/geocode/json"
    resp = http_requests.get(url, params={"address": city + ", India",
                                           "key": GOOGLE_API_KEY}, timeout=5)
    data = resp.json()
    if data.get("status") == "OK":
        loc = data["results"][0]["geometry"]["location"]
        return loc["lat"], loc["lng"]
    return None, None

# Google Weather condition type → our app category
GWEATHER_MAP = {
    "CLEAR": "Clear", "SUNNY": "Clear", "MOSTLY_CLEAR": "Clear", "PARTLY_CLOUDY": "Clear",
    "MOSTLY_CLOUDY": "Clear", "CLOUDY": "Clear", "OVERCAST": "Clear",
    "FOG": "Foggy", "FREEZING_FOG": "Foggy", "HAZE": "Hazy", "SMOKE": "Hazy",
    "LIGHT_RAIN": "Rainy", "RAIN": "Rainy", "HEAVY_RAIN": "Rainy",
    "RAIN_SHOWERS": "Rainy", "DRIZZLE": "Rainy", "FREEZING_RAIN": "Rainy",
    "THUNDERSTORM": "Stormy", "THUNDERSTORM_WITH_RAIN": "Stormy",
    "HEAVY_THUNDERSTORM": "Stormy", "TROPICAL_STORM": "Stormy",
    "WINDY": "Clear", "BLIZZARD": "Stormy",
}

@app.route("/api/weather")
def get_weather():
    city = request.args.get("city", "Delhi")
    try:
        # Step 1: Geocode city → lat/lng
        lat, lng = geocode_city(city)
        if lat is None:
            raise ValueError("Could not geocode city")

        # Step 2: Call Google Weather API currentConditions
        weather_url = "https://weather.googleapis.com/v1/currentConditions:lookup"
        params = {
            "key":               GOOGLE_WEATHER_KEY,
            "location.latitude":  lat,
            "location.longitude": lng,
            "unitsSystem":        "METRIC",
        }
        wresp = http_requests.get(weather_url, params=params, timeout=8)
        wd    = wresp.json()

        if wresp.status_code != 200:
            raise ValueError(f"Weather API error: {wd.get('error', {}).get('message', wresp.status_code)}")

        # Step 3: Parse response
        condition_type = wd.get("weatherCondition", {}).get("type", "CLEAR")
        condition_desc = wd.get("weatherCondition", {}).get("description", {}).get("text", "Clear")
        temp           = wd.get("temperature", {}).get("degrees", None)
        is_daytime     = wd.get("isDaytime", True)

        # Map to our app's weather categories
        cat  = GWEATHER_MAP.get(condition_type, "Clear")
        time = "Day" if is_daytime else "Night"

        # Extra context
        humidity   = wd.get("relativeHumidity", None)
        wind_speed = wd.get("wind", {}).get("speed", {}).get("value", None)
        rain_prob  = wd.get("precipitation", {}).get("probability", {}).get("percent", 0)

        return jsonify({
            "weather":      cat,
            "time":         time,
            "temp":         round(temp, 1) if temp else None,
            "description":  condition_desc,
            "humidity":     humidity,
            "wind_speed":   wind_speed,
            "rain_prob":    rain_prob,
            "source":       "google",
            "lat":          lat,
            "lng":          lng,
        })

    except Exception as e:
        # Graceful fallback — auto-detect time from system clock
        hour = pd.Timestamp.now().hour
        return jsonify({
            "weather": "Clear",
            "time":    "Day" if 6 <= hour < 18 else "Night",
            "source":  "default",
            "error":   str(e),
        })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
