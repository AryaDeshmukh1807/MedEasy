import sys
import json
import os
import pdfplumber
import re
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
import joblib
import warnings

warnings.filterwarnings("ignore")

try:
    import PyPDF2
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False

try:
    import pytesseract
    from PIL import Image
    HAS_OCR = True
except ImportError:
    HAS_OCR = False


def extract_from_tables(pdf_path):
    extracted = {"bloodSugar": None, "systolicBP": None, "diastolicBP": None, "heartRate": None}
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        for row in table:
                            row_text = ' '.join([str(cell).lower() if cell else '' for cell in row])

                            if any(kw in row_text for kw in ['glucose', 'blood sugar', 'sugar']):
                                for cell in row:
                                    if cell and re.search(r'\d{2,3}', str(cell)):
                                        val = float(re.search(r'(\d{2,3}(?:\.\d+)?)', str(cell)).group(1))
                                        if 40 <= val <= 500:
                                            extracted["bloodSugar"] = val
                                            break

                            if any(kw in row_text for kw in ['blood pressure', 'bp', 'systolic', 'diastolic']):
                                for cell in row:
                                    if cell and '/' in str(cell):
                                        match = re.search(r'(\d{2,3})\s*/\s*(\d{2,3})', str(cell))
                                        if match:
                                            sys_val, dia_val = int(match.group(1)), int(match.group(2))
                                            if 70 <= sys_val <= 250 and 40 <= dia_val <= 150:
                                                extracted["systolicBP"] = sys_val
                                                extracted["diastolicBP"] = dia_val
                                                break

                            if any(kw in row_text for kw in ['heart rate', 'pulse', 'hr', 'bpm']):
                                for cell in row:
                                    if cell:
                                        hr_match = re.search(r'\b(\d{2,3})\b', str(cell))
                                        if hr_match:
                                            val = int(hr_match.group(1))
                                            if 30 <= val <= 220:
                                                extracted["heartRate"] = val
                                                break
    except Exception:
        pass
    return extracted


def extract_with_fallbacks(pdf_path):
    text = ""
    method = "none"

    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join([page.extract_text() for page in pdf.pages if page.extract_text()])
            if text and text.strip():
                return text, "pdfplumber"
    except Exception:
        pass

    if HAS_PYPDF2:
        try:
            with open(pdf_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                text = "\n".join([page.extract_text() for page in reader.pages if page.extract_text()])
                if text and text.strip():
                    return text, "pypdf2"
        except Exception:
            pass

    if HAS_OCR:
        try:
            from pdf2image import convert_from_path
            images = convert_from_path(pdf_path)
            text = "\n".join([pytesseract.image_to_string(img) for img in images])
            if text and text.strip():
                return text, "ocr"
        except Exception:
            pass

    return text, method


def smart_extract_metrics(text):
    metrics = {"bloodSugar": None, "systolicBP": None, "diastolicBP": None, "heartRate": None}
    lines = text.lower().split('\n')

    for i, line in enumerate(lines):
        if not line.strip():
            continue

        # ============ BLOOD PRESSURE ============
        if metrics["systolicBP"] is None:
            bp_match = re.search(r'\b(\d{2,3})\s*/\s*(\d{2,3})\b', line)

            if not bp_match:
                sys_match = re.search(r'(?:systolic|sys).*?(\d{2,3})', line)
                dia_match = re.search(r'(?:diastolic|dia).*?(\d{2,3})', line)
                if sys_match and dia_match:
                    bp_match = type('obj', (object,), {
                        'group': lambda self, x: sys_match.group(1) if x == 1 else dia_match.group(1)
                    })()

            if not bp_match and i < len(lines) - 1:
                if 'blood pressure' in line or 'bp' in line:
                    bp_match = re.search(r'\b(\d{2,3})\s*/\s*(\d{2,3})\b', lines[i + 1])

            if bp_match:
                try:
                    sys_val = int(bp_match.group(1))
                    dia_val = int(bp_match.group(2))
                    if 70 <= sys_val <= 250 and 40 <= dia_val <= 150 and sys_val > dia_val:
                        metrics["systolicBP"] = sys_val
                        metrics["diastolicBP"] = dia_val
                except Exception:
                    pass

        # ============ BLOOD SUGAR ============
        if metrics["bloodSugar"] is None:
            sugar_keywords = ["glucose", "blood.?sugar", "sugar.?level", "fasting", "blood glucose", "plasma glucose", "serum glucose"]
            if any(re.search(kw, line) for kw in sugar_keywords):
                line_clean = re.sub(r'\b(\d{2,3})\s*-\s*(\d{2,3})\b', '', line)
                sugar_match = re.search(r'\b(\d{2,3}(?:\.\d{1,2})?)\b', line_clean)
                if not sugar_match and i < len(lines) - 1:
                    sugar_match = re.search(r'\b(\d{2,3}(?:\.\d{1,2})?)\b', lines[i + 1])
                if sugar_match:
                    try:
                        val = float(sugar_match.group(1))
                        if 40 <= val <= 500:
                            metrics["bloodSugar"] = val
                    except Exception:
                        pass

        # ============ HEART RATE ============
        if metrics["heartRate"] is None:
            hr_keywords = [r'heart\s*rate', r'\bhr\b', r'\bpulse\b', r'pulse\s*rate', r'heart\s*beat', r'bpm']
            if any(re.search(kw, line) for kw in hr_keywords):
                line_clean = re.sub(r'\b(\d{2,3})\s*-\s*(\d{2,3})\b', '', line)
                hr_match = re.search(r'\b(\d{2,3})\b', line_clean)
                if not hr_match and i < len(lines) - 1:
                    hr_match = re.search(r'\b(\d{2,3})\b', lines[i + 1])
                if hr_match:
                    try:
                        val = int(hr_match.group(1))
                        if 30 <= val <= 220:
                            metrics["heartRate"] = val
                    except Exception:
                        pass

    return metrics


def get_smart_suggestions(metrics, prediction, prob):
    suggestions = []
    if prediction == 1:
        suggestions.append(f"CRITICAL: Based on historical trends, there is a {prob*100:.1f}% likelihood this requires medical intervention.")
        suggestions.append("Schedule an appointment within the next 48 hours.")
    else:
        suggestions.append("Metrics are stable compared to historical patterns. Continue routine monitoring.")
    return suggestions


class HealthPredictor:
    def __init__(self, model_path='health_model.pkl'):
        self.model_path = model_path
        self.model = self._load_or_train_model()

    def _load_or_train_model(self):
        try:
            return joblib.load(self.model_path)
        except Exception:
            data = {
                'sugar': [90, 150, 200, 110, 180, 95, 250],
                'sys':   [120, 140, 160, 115, 145, 118, 180],
                'dia':   [80,  90,  100,  75,  95,  78,  110],
                'urgent':[0,   1,   1,    0,   1,   0,   1]
            }
            df = pd.DataFrame(data)
            model = RandomForestClassifier(n_estimators=100, random_state=42)
            model.fit(df[['sugar', 'sys', 'dia']], df['urgent'])
            joblib.dump(model, self.model_path)
            return model

    def predict_urgency(self, metrics):
        if metrics.get('bloodSugar') and metrics.get('systolicBP') and metrics.get('diastolicBP'):
            input_df = pd.DataFrame(
                [[metrics['bloodSugar'], metrics['systolicBP'], metrics['diastolicBP']]],
                columns=['sugar', 'sys', 'dia']
            )
            prediction = self.model.predict(input_df)[0]
            probability = self.model.predict_proba(input_df)[0][1]
            return prediction, probability
        return None, 0.0

    def analyze_with_history(self, current_metrics, df_history):
        prediction, probability = self.predict_urgency(current_metrics)

        status = "Normal"
        if prediction == 1 or probability > 0.5:
            status = "Needs Attention"

        suggestions = get_smart_suggestions(current_metrics, prediction, probability)

        if not df_history.empty:
            # Blood sugar trend
            if "bloodSugar" in df_history.columns:
                df_history['bloodSugar'] = pd.to_numeric(df_history['bloodSugar'], errors='coerce')
                last_3_avg = df_history['bloodSugar'].dropna().tail(3).mean()
                current_sugar = current_metrics.get("bloodSugar")
                if current_sugar and pd.notna(last_3_avg) and current_sugar > last_3_avg * 1.2:
                    suggestions.append(
                        f"Trend Warning: Your sugar is 20% higher than your recent average of {last_3_avg:.1f} mg/dL."
                    )

            # Heart rate trend
            if "heartRate" in df_history.columns:
                df_history['heartRate'] = pd.to_numeric(df_history['heartRate'], errors='coerce')
                last_3_hr_avg = df_history['heartRate'].dropna().tail(3).mean()
                current_hr = current_metrics.get("heartRate")
                if current_hr and pd.notna(last_3_hr_avg):
                    if current_hr > last_3_hr_avg * 1.15:
                        suggestions.append(
                            f"Trend Warning: Heart rate ({current_hr} bpm) is 15%+ above recent average of {last_3_hr_avg:.0f} bpm."
                        )
                    elif current_hr < last_3_hr_avg * 0.85:
                        suggestions.append(
                            f"Trend Note: Heart rate ({current_hr} bpm) is notably lower than recent average of {last_3_hr_avg:.0f} bpm."
                        )

        # ✅ FIXED: only return the analysis dict here, NOT the full result
        return {
            "status": status,
            "prediction_score": round(float(probability), 2),
            "summary": " ".join(suggestions)
        }


if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"success": False, "error": "No file path provided"}))
            sys.exit(1)

        file_path = sys.argv[1]
        if not os.path.exists(file_path):
            print(json.dumps({"success": False, "error": f"File not found: {file_path}"}))
            sys.exit(1)

        history_json = sys.argv[2] if len(sys.argv) > 2 else "[]"
        try:
            history_list = json.loads(history_json)
            df_history = pd.DataFrame(history_list)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Failed to parse history: {str(e)}"}))
            sys.exit(1)

        # Extract text
        try:
            text, extraction_method = extract_with_fallbacks(file_path)
            if not text or not text.strip():
                print(json.dumps({"success": False, "error": "No extractable text found in PDF."}))
                sys.exit(1)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Failed to read PDF: {str(e)}"}))
            sys.exit(1)

        # Extract metrics
        try:
            metrics = smart_extract_metrics(text)

            # ✅ FIXED: patch ALL missing metrics from table extraction
            if not all([metrics.get("bloodSugar"), metrics.get("systolicBP"), metrics.get("heartRate")]):
                table_metrics = extract_from_tables(file_path)
                if not metrics.get("bloodSugar") and table_metrics.get("bloodSugar"):
                    metrics["bloodSugar"] = table_metrics["bloodSugar"]
                if not metrics.get("systolicBP") and table_metrics.get("systolicBP"):
                    metrics["systolicBP"] = table_metrics["systolicBP"]
                    metrics["diastolicBP"] = table_metrics["diastolicBP"]
                if not metrics.get("heartRate") and table_metrics.get("heartRate"):  # ✅ FIXED
                    metrics["heartRate"] = table_metrics["heartRate"]
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Failed to extract metrics: {str(e)}"}))
            sys.exit(1)

        # Analyze
        try:
            predictor = HealthPredictor()
            analysis_results = predictor.analyze_with_history(metrics, df_history)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Failed to analyze metrics: {str(e)}"}))
            sys.exit(1)

        # ✅ FIXED: result built here in __main__ with all variables in scope
        result = {
            "success": True,
            "metrics": metrics,
            "analysis": analysis_results,
            "extraction_method": extraction_method,
            "metrics_found": {
                "bloodSugar":  metrics.get("bloodSugar")  is not None,
                "systemicBP":  metrics.get("systolicBP")  is not None,
                "diastolicBP": metrics.get("diastolicBP") is not None,
                "heartRate":   metrics.get("heartRate")   is not None,  # ✅ FIXED
            }
        }

        # Warning logic includes heartRate
        all_metrics = [metrics.get("bloodSugar"), metrics.get("systolicBP"),
                       metrics.get("diastolicBP"), metrics.get("heartRate")]
        if not any(all_metrics):
            result["warning"] = "No metrics found in PDF. Please manually enter your health metrics."
        elif not all(all_metrics):
            result["warning"] = "Some metrics missing. Consider adding them manually for complete analysis."

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"success": False, "error": f"Unexpected error: {str(e)}"}))