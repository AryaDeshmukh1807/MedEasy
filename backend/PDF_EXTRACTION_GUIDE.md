# PDF Extraction & Metric Reading Guide

## Overview
The PDF analysis system now uses multiple extraction methods with intelligent fallbacks to handle various PDF types and accurately extract health metrics.

---

## 🎯 Features

### Multiple Extraction Methods
1. **pdfplumber** (Primary) - Best for text-based PDFs
2. **PyPDF2** (Fallback) - Alternative text extraction
3. **OCR via pytesseract** (Last Resort) - For scanned/image PDFs

### Smart Metric Detection
- **Blood Pressure**: Recognizes "120/80", "systolic: 120, diastolic: 80", values on next line
- **Blood Sugar**: Detects glucose, blood sugar, plasma glucose, serum glucose
- **Table Extraction**: Pulls metrics from structured tables
- **Range Removal**: Ignores reference ranges (70-110) before matching values

### Validation & Sanity Checks
```
Blood Pressure: 70 ≤ systolic ≤ 250, 40 ≤ diastolic ≤ 150
Blood Sugar: 40 ≤ glucose ≤ 500 mg/dL
```

---

## 📦 Installation & Setup

### Required Packages
```bash
pip install pdfplumber pandas scikit-learn joblib
```

### Optional Packages (for advanced features)
```bash
# For scanned PDFs (OCR)
pip install pytesseract pdf2image

# For alternative PDF reading
pip install PyPDF2
```

### Installing Tesseract (for OCR)
**Windows:**
1. Download installer: https://github.com/UB-Mannheim/tesseract/wiki
2. Run installer (default path: `C:\Program Files\Tesseract-OCR`)
3. Set environment variable or path in code

**macOS:**
```bash
brew install tesseract
```

**Linux:**
```bash
sudo apt-get install tesseract-ocr
```

---

## 🔍 How It Works

### Flow Diagram
```
User uploads PDF
    ↓
Python Script Receives File
    ↓
Extract Text
  ├─ Method 1: pdfplumber (fast)
  ├─ Method 2: PyPDF2 (fallback)
  └─ Method 3: OCR (for images)
    ↓
Extract Metrics
  ├─ Regex patterns (90% of cases)
  ├─ Table extraction
  └─ Context analysis
    ↓
Validate Results
  ├─ Check realistic ranges
  ├─ Compare with history
  └─ Detect missing values
    ↓
Analyze & Predict
  ├─ ML model prediction
  └─ Generate suggestions
    ↓
Return Response
  ├─ Extracted metrics
  ├─ Analysis results
  ├─ Extraction method used
  └─ Warnings if incomplete
```

---

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "metrics": {
    "bloodSugar": 125,
    "systolicBP": 140,
    "diastolicBP": 90
  },
  "analysis": {
    "status": "Needs Attention",
    "prediction_score": 0.75,
    "summary": "CRITICAL: Based on historical trends..."
  },
  "extraction": {
    "method": "pdfplumber",
    "metricsFound": {
      "bloodSugar": true,
      "systemicBP": true,
      "diastolicBP": true
    }
  },
  "reportId": "ObjectId..."
}
```

### Partial Success (with warning)
```json
{
  "success": true,
  "metrics": {
    "bloodSugar": 125,
    "systolicBP": null,
    "diastolicBP": null
  },
  "warning": "Some metrics missing. Consider adding them manually for complete analysis.",
  "extraction": {
    "method": "pdfplumber",
    "metricsFound": {
      "bloodSugar": true,
      "systemicBP": false,
      "diastolicBP": false
    }
  }
}
```

---

## 🐛 Debugging

### Server Logs
The server logs extraction details in console:
```
✅ Metrics saved from PDF: ObjectId...
📊 Extraction Method: pdfplumber
📈 Metrics Found: { bloodSugar: true, systemicBP: true, ... }
```

### Browser Console
Check the browser DevTools console for:
- Extraction method used
- Metrics found
- Any warnings or errors

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "No text found in PDF" | Scanned PDF (image) | Install pytesseract & tesseract binary |
| Only some metrics extracted | Different PDF format | Check server logs for extraction method |
| No extraction at all | Corrupted PDF | Verify PDF is readable in PDF viewer |
| Regex not matching your format | Different notation style | Update regex patterns in `smart_extract_metrics()` |
| Wrong values extracted | Reference ranges misinterpreted | Patterns already filter ranges; check PDF layout |

---

## 🔧 Customization

### Adding Custom Regex Patterns

Edit `smart_extract_metrics()` in `analyze_report.py`:

```python
# Example: Add support for alternative BP notation "BP: 120 mmHg / 80 mmHg"
bp_match = re.search(r'BP:\s*(\d{2,3})\s*mmHg\s*/\s*(\d{2,3})\s*mmHg', line)

# Example: Add support for "HbA1c: 7.5%" (different glucose metric)
if any(kw in line for kw in ['hba1c', 'a1c']):
    a1c_match = re.search(r'(\d{1,2}(?:\.\d{1,2})?)\s*%', line)
```

### Adjusting Validation Ranges

```python
# Modify to accept different BP ranges
if 60 <= sys_val <= 300 and 30 <= dia_val <= 200:
    # Your logic here

# Modify glucose ranges for mmol/L instead of mg/dL
if 2 <= val <= 28:  # mmol/L range
    metrics["bloodSugar"] = val
```

---

## 📝 Testing

### Test with Different PDF Types

1. **Text-based PDF** (standard medical report)
   - Expected: pdfplumber method ✓
   
2. **Scanned PDF** (image)
   - Expected: pytesseract (OCR) method ✓
   - Requires: Tesseract installed
   
3. **Table-heavy PDF** (lab reports)
   - Expected: Table extraction fallback ✓
   
4. **Poorly formatted PDF**
   - Expected: Warnings about missing metrics
   - User can manually enter values

### Manual Testing
```bash
# Test extraction directly
python analyze_report.py /path/to/test.pdf '[]'

# With history
python analyze_report.py /path/to/test.pdf '[{"bloodSugar": 120, "date": "2024-01-01"}]'
```

---

## 📋 Checklist for Deployment

- [ ] Verify pdfplumber installed: `pip list | grep pdfplumber`
- [ ] Test with sample PDF file
- [ ] Check server starts without errors
- [ ] Upload test PDF through UI
- [ ] Verify metrics appear in dashboard
- [ ] Check browser console for extraction details
- [ ] (Optional) Install pytesseract for OCR support
- [ ] (Optional) Install Tesseract binary for scanned PDFs

---

## 🤝 Support

If metrics are not being extracted correctly:

1. **Check extraction method** - See browser console logs
2. **Verify PDF format** - Is it text-based or scanned?
3. **Check PDF content** - Use a text editor to verify text is readable
4. **Manual entry fallback** - Use the metrics page for manual entry
5. **Check server logs** - Run backend with `npm start` to see detailed errors

---

## 📚 References

- [pdfplumber Documentation](https://github.com/jsvine/pdfplumber)
- [PyPDF2 Documentation](https://github.com/py-pdf/PyPDF2)
- [pytesseract Documentation](https://github.com/madmaze/pytesseract)
- [Tesseract OCR Download](https://github.com/UB-Mannheim/tesseract/wiki)
