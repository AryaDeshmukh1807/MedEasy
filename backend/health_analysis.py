import sys
import json
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings("ignore")

def detect_anomalies_zscore(series, threshold=3):
    """Detect anomalies using Z-score"""
    if len(series) < 3:
        return []
    mean = np.mean(series)
    std = np.std(series)
    if std == 0:
        return []
    z_scores = [(x - mean) / std for x in series]
    anomalies = [i for i, z in enumerate(z_scores) if abs(z) > threshold]
    return anomalies

def detect_anomalies_isolation_forest(series):
    """Detect anomalies using Isolation Forest"""
    if len(series) < 10:
        return []
    series = np.array(series).reshape(-1, 1)
    scaler = StandardScaler()
    series_scaled = scaler.fit_transform(series)
    clf = IsolationForest(contamination=0.1, random_state=42)
    preds = clf.fit_predict(series_scaled)
    anomalies = [i for i, pred in enumerate(preds) if pred == -1]
    return anomalies

def analyze_metric_trend(df, metric_name):
    """Analyze trend for a specific metric"""
    if metric_name not in df.columns or df[metric_name].dropna().empty:
        return {"trend": "insufficient_data", "avg": None, "change": None}

    series = df[metric_name].dropna()
    if len(series) < 2:
        return {"trend": "insufficient_data", "avg": round(series.iloc[-1], 2) if not series.empty else None, "change": None}

    avg = series.mean()
    recent_avg = series.tail(min(5, len(series))).mean()
    change = ((recent_avg - avg) / avg) * 100 if avg != 0 else 0

    if change > 10:
        trend = "increasing"
    elif change < -10:
        trend = "decreasing"
    else:
        trend = "stable"

    return {"trend": trend, "avg": round(avg, 2), "change": round(change, 2)}

def get_suggestions(metrics, anomalies, trends):
    """Generate health suggestions based on metrics and anomalies"""
    suggestions = []

    # Blood Sugar suggestions
    if 'bloodSugar' in metrics and metrics['bloodSugar'] is not None:
        sugar = metrics['bloodSugar']
        if sugar > 200:
            suggestions.append("Your blood sugar is very high. Consult a doctor immediately and monitor closely.")
        elif sugar > 140:
            suggestions.append("Blood sugar is elevated. Consider dietary changes and regular monitoring.")
        elif sugar < 70:
            suggestions.append("Blood sugar is low. Eat something with sugar and monitor symptoms.")

        if 'bloodSugar' in trends and trends['bloodSugar']['trend'] == 'increasing':
            suggestions.append("Blood sugar trend is increasing. Review diet and exercise habits.")

    # Blood Pressure suggestions
    if 'systolicBP' in metrics and 'diastolicBP' in metrics:
        sys = metrics['systolicBP']
        dia = metrics['diastolicBP']
        if sys and dia:
            if sys >= 180 or dia >= 120:
                suggestions.append("Blood pressure is critically high. Seek medical attention immediately.")
            elif sys >= 140 or dia >= 90:
                suggestions.append("Blood pressure is high. Consider lifestyle changes or medication review.")
            elif sys < 90 or dia < 60:
                suggestions.append("Blood pressure is low. Stay hydrated and consult if symptoms persist.")

    # Heart Rate suggestions
    if 'heartRate' in metrics and metrics['heartRate'] is not None:
        hr = metrics['heartRate']
        if hr > 100:
            suggestions.append("Heart rate is elevated. Check for stress, caffeine, or medical conditions.")
        elif hr < 60:
            suggestions.append("Heart rate is low. This may be normal if you're fit, but monitor if symptomatic.")

    # Weight suggestions (if available)
    if 'weight' in metrics and metrics['weight'] is not None:
        # Assuming weight in kg, but no baseline, so general
        suggestions.append("Track weight changes over time for overall health monitoring.")

    # Anomaly-based suggestions
    if anomalies:
        suggestions.append("Anomalies detected in recent metrics. Review recent lifestyle changes or consult healthcare provider.")

    if not suggestions:
        suggestions.append("Your metrics look within normal ranges. Continue healthy habits.")

    return suggestions

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: python health_analysis.py <history_json> <latest_metrics_json>"}))
        sys.exit(1)

    try:
        history_json = sys.argv[1]
        latest_json = sys.argv[2]

        history = json.loads(history_json)
        latest = json.loads(latest_json)

        # Combine history + latest
        all_data = history + [latest]
        df = pd.DataFrame(all_data)

        # Ensure date is datetime
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')

        metrics = ['bloodSugar', 'systolicBP', 'diastolicBP', 'heartRate', 'weight']
        anomalies = {}
        trends = {}

        for metric in metrics:
            if metric in df.columns:
                series = df[metric].dropna()
                if not series.empty:
                    # Detect anomalies in the series
                    z_anomalies = detect_anomalies_zscore(series.values)
                    if_anomalies = detect_anomalies_isolation_forest(series.values)
                    # Combine anomalies
                    combined_anomalies = list(set(z_anomalies + if_anomalies))
                    if combined_anomalies:
                        anomalies[metric] = combined_anomalies

                    # Analyze trend
                    trends[metric] = analyze_metric_trend(df, metric)

        # Generate suggestions
        suggestions = get_suggestions(latest, anomalies, trends)

        # Analysis summary
        analysis = []
        for metric, trend_info in trends.items():
            if trend_info['avg'] is not None:
                analysis.append(f"{metric}: Average {trend_info['avg']}, Trend: {trend_info['trend']}")
                if trend_info['change'] is not None:
                    analysis.append(f"  Change: {trend_info['change']}%")

        alerts = []
        if anomalies:
            alerts.append("Anomalies detected in: " + ", ".join(anomalies.keys()))
        else:
            alerts.append("No anomalies detected.")

        result = {
            "success": True,
            "analysis": "; ".join(analysis),
            "suggestions": suggestions,
            "alerts": alerts,
            "anomalies": anomalies,
            "trends": trends
        }

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()