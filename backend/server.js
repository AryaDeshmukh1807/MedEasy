// backend/server.js
import { spawn } from "child_process";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import multer from "multer";
import fs from "fs";

dotenv.config();

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize express app
const app = express();
app.use(express.json());

// ✅ CORS setup
app.use(
  cors({
    origin: [
      "http://127.0.0.1:5500",
      "http://localhost:5500",
      "http://127.0.0.1:5501",
      "http://localhost:5501",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ✅ Serve frontend folders
const staticDirs = [
  "../login",
  "../signup",
  "../index",
  "../medication",
  "../metrics",
  "../upload",
];
staticDirs.forEach((dir) =>
  app.use(express.static(path.join(__dirname, dir)))
);

// ✅ Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ Mongo Error:", err.message));

const JWT_SECRET = process.env.JWT_SECRET || "mySuperSecretKey";

// ✅ Detect correct Python binary (python3 on Linux/Mac, python on Windows)
const PYTHON_BIN = process.platform === "win32" ? "python" : "python3";

/* ============================================================
   🔹 Mongoose Schemas
============================================================ */
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});

const medicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  dosage: String,
  time: String,
  description: { type: String, default: "No description available" },
  side_effects: { type: [String], default: ["Not specified"] },
  createdAt: { type: Date, default: Date.now },
});

const metricsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  bloodSugar: Number,
  systolicBP: Number,
  diastolicBP: Number,
  heartRate: Number,
  weight: Number,
  date: { type: Date, default: Date.now },
});

const reportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  fileName: String,
  originalName: String,
  uploadDate: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Medication = mongoose.model("Medication", medicationSchema);
const HealthMetric = mongoose.model("HealthMetric", metricsSchema);
const Report = mongoose.model("Report", reportSchema);

/* ============================================================
   🔹 AUTH ROUTES
============================================================ */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields are required" });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashedPassword });

    res.json({ message: "User created successfully" });
  } catch (err) {
    console.error("❌ /register error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "2h" });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("❌ /login error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

/* ============================================================
   👤 PROFILE ROUTE
============================================================ */
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("❌ Profile fetch error:", err.message);
    res.status(500).json({ message: "Error fetching profile" });
  }
});

/* ============================================================
   💊 MEDICATION ROUTES
============================================================ */
app.post("/api/medications", authMiddleware, async (req, res) => {
  try {
    const { name, dosage, time, description, side_effects } = req.body;
    if (!name || !dosage)
      return res.status(400).json({ message: "Name and dosage required" });

    const med = await Medication.create({
      userId: req.user.id,
      name,
      dosage,
      time: time || "Not specified",
      description: description || "No description available",
      side_effects: side_effects || ["Not specified"],
    });

    res.json({ message: "Medication saved successfully", med });
  } catch (err) {
    console.error("❌ Save medication error:", err.message);
    res.status(500).json({ message: "Server error while saving medication" });
  }
});

app.get("/api/medications", authMiddleware, async (req, res) => {
  try {
    const meds = await Medication.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(meds);
  } catch (err) {
    console.error("❌ Fetch medication error:", err.message);
    res.status(500).json({ message: "Error fetching medications" });
  }
});

app.get("/api/medications/:id", authMiddleware, async (req, res) => {
  try {
    const med = await Medication.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!med) return res.status(404).json({ message: "Medication not found" });
    res.json(med);
  } catch (err) {
    console.error("❌ Error fetching medication details:", err.message);
    res.status(500).json({ message: "Error fetching medication details" });
  }
});

// ✅ Enhanced OpenFDA info route
app.get("/api/medications/info/:name", authMiddleware, async (req, res) => {
  try {
    let medName = req.params.name.trim();
    console.log("🌐 Fetching online info for:", medName);

    // 🧩 Alias mapping for Indian brand names
    const aliasMap = {
      paracetamol: "acetaminophen",
      crocin: "acetaminophen",
      dolo: "acetaminophen",
      dolo650: "acetaminophen",
      combiflam: "ibuprofen",
      ibugesic: "ibuprofen",
      calpol: "acetaminophen",
      metformin: "metformin hydrochloride",
    };
    const lookupName =
      aliasMap[medName.toLowerCase()] || medName.toLowerCase();

    // Try DB first
    let med = await Medication.findOne({
      name: new RegExp(`^${medName}$`, "i"),
      userId: req.user.id,
    });
    if (med && med.description && med.description !== "No description available")
      return res.json(med);

    // --- Try brand_name search ---
    const brandUrl = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(
      lookupName.toUpperCase()
    )}"&limit=1`;
    let response = await fetch(brandUrl);
    let result = null;

    if (response.ok) {
      const data = await response.json();
      result = data.results?.[0];
    }

    // --- Fallback: generic_name search ---
    if (!result) {
      console.log("🔁 Retrying with generic_name...");
      const genericUrl = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(
        lookupName.toUpperCase()
      )}"&limit=1`;
      const res2 = await fetch(genericUrl);
      if (res2.ok) {
        const data2 = await res2.json();
        result = data2.results?.[0];
      }
    }

    if (!result)
      return res
        .status(404)
        .json({ message: `No information found for "${medName}".` });

    const description =
      result.description?.[0] ||
      result.indications_and_usage?.[0] ||
      "No description found.";
    const side_effects =
      result.adverse_reactions?.[0]
        ?.split(". ")
        .slice(0, 5)
        .filter(Boolean) || ["No side effects listed."];

    // Cache to DB
    med = await Medication.findOneAndUpdate(
      { name: medName, userId: req.user.id },
      { description, side_effects },
      { new: true }
    );

    console.log("✅ Info fetched for:", medName);
    res.json({ name: medName, description, side_effects });
  } catch (err) {
    console.error("❌ External API fetch error:", err.message);
    res.status(500).json({
      message: "Unable to fetch medicine information online.",
      error: err.message,
    });
  }
});

app.delete("/api/medications/:id", authMiddleware, async (req, res) => {
  try {
    const med = await Medication.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!med) return res.status(404).json({ message: "Medication not found" });
    res.json({ message: "Medication deleted successfully" });
  } catch (err) {
    console.error("❌ Delete medication error:", err.message);
    res.status(500).json({ message: "Error deleting medication" });
  }
});

/* ============================================================
   🩺 HEALTH METRICS ROUTES
============================================================ */
app.post("/api/metrics", authMiddleware, async (req, res) => {
  try {
    const { bloodSugar, systolicBP, diastolicBP, heartRate, weight, date } =
      req.body;
    const newMetric = await HealthMetric.create({
      userId: req.user.id,
      bloodSugar,
      systolicBP,
      diastolicBP,
      heartRate,
      weight,
      date: date || new Date(),
    });

    // Fetch updated history including the new metric
    const history = await HealthMetric.find({ userId: req.user.id }).sort({ date: 1 });
    const historyData = JSON.stringify(history.map(h => ({
      bloodSugar: h.bloodSugar,
      systolicBP: h.systolicBP,
      diastolicBP: h.diastolicBP,
      heartRate: h.heartRate,
      weight: h.weight,
      date: h.date
    })));
    const latestData = JSON.stringify({
      bloodSugar: newMetric.bloodSugar,
      systolicBP: newMetric.systolicBP,
      diastolicBP: newMetric.diastolicBP,
      heartRate: newMetric.heartRate,
      weight: newMetric.weight,
      date: newMetric.date
    });

    // Call Python ML analysis script
    const pythonProcess = spawn(PYTHON_BIN, ["health_analysis.py", historyData, latestData]);

    let pythonData = "";
    let pythonError = "";
    let timedOut = false;

    // Timeout: 30 seconds for analysis
    const timeout = setTimeout(() => {
      timedOut = true;
      pythonProcess.kill("SIGKILL");
      console.error("❌ Python analysis timed out after 30s");
    }, 30000);

    pythonProcess.stdout.on("data", (data) => { pythonData += data.toString(); });
    pythonProcess.stderr.on("data", (data) => { pythonError += data.toString(); });

    pythonProcess.on("close", async (code) => {
      clearTimeout(timeout);

      if (timedOut) return;

      try {
        if (code !== 0 || !pythonData.trim()) {
          console.error("❌ Python analysis error (exit code:", code, "):", pythonError);
          return res.json({
            message: "Metric saved successfully",
            metric: newMetric,
            analysis: { success: false, error: pythonError || "Analysis failed" }
          });
        }

        let analysisResult;
        try {
          analysisResult = JSON.parse(pythonData);
        } catch (parseErr) {
          console.error("❌ JSON parse error:", parseErr.message);
          return res.json({
            message: "Metric saved successfully",
            metric: newMetric,
            analysis: { success: false, error: "Analysis parsing failed" }
          });
        }

        if (!analysisResult.success) {
          console.error("❌ Analysis failed:", analysisResult.error);
          return res.json({
            message: "Metric saved successfully",
            metric: newMetric,
            analysis: analysisResult
          });
        }

        res.json({
          message: "Metric saved successfully",
          metric: newMetric,
          analysis: analysisResult
        });
        console.log("✅ Metrics analyzed successfully");

      } catch (err) {
        console.error("❌ Analysis handler error:", err.message);
        res.json({
          message: "Metric saved successfully",
          metric: newMetric,
          analysis: { success: false, error: err.message }
        });
      }
    });

  } catch (err) {
    console.error("❌ Error saving metrics:", err.message);
    res.status(500).json({ message: "Error saving metrics" });
  }
});

app.get("/api/metrics", authMiddleware, async (req, res) => {
  try {
    const metrics = await HealthMetric.find({ userId: req.user.id }).sort({
      date: 1,
    });
    res.json(metrics);
  } catch (err) {
    console.error("❌ Error fetching metrics:", err.message);
    res.status(500).json({ message: "Error fetching metrics" });
  }
});

/* ============================================================
   📁 REPORT UPLOAD ROUTES
============================================================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// ✅ Upload & Analyze Report
app.post("/api/reports/upload", authMiddleware, upload.single("reportFile"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });

        const filePath = path.join(__dirname, "uploads", req.file.filename);

        const history = await HealthMetric.find({ userId: req.user.id }).sort({ date: 1 });
        const historyData = JSON.stringify(history);

        // ✅ Use platform-aware Python binary
        const pythonProcess = spawn(PYTHON_BIN, ["analyze_report.py", filePath, historyData]);

        let pythonData = "";
        let pythonError = "";
        let timedOut = false;

        // ✅ Timeout: kill Python process if it hangs for more than 60 seconds
        const timeout = setTimeout(() => {
            timedOut = true;
            pythonProcess.kill("SIGKILL");
            console.error("❌ Python process timed out after 60s");
            if (!res.headersSent) {
                res.status(500).json({ message: "PDF analysis timed out. Try a smaller or text-based PDF." });
            }
        }, 60000);

        // ✅ Capture stdout
        pythonProcess.stdout.on("data", (data) => { pythonData += data.toString(); });

        // ✅ Capture stderr for debugging
        pythonProcess.stderr.on("data", (data) => { pythonError += data.toString(); });

        pythonProcess.on("close", async (code) => {
            clearTimeout(timeout);

            // Don't respond if we already sent a timeout response
            if (timedOut) return;

            try {
                // ✅ Check for Python process errors
                if (code !== 0 || !pythonData.trim()) {
                    console.error("❌ Python process error (exit code:", code, "):", pythonError || "No output");
                    return res.status(500).json({
                        message: "PDF analysis failed",
                        error: pythonError || "Python process exited with no output"
                    });
                }

                let pythonResult;
                try {
                    pythonResult = JSON.parse(pythonData);
                } catch (parseErr) {
                    console.error("❌ JSON parse error:", parseErr.message, "\nRaw output:", pythonData);
                    return res.status(500).json({
                        message: "Analysis parsing failed — Python returned invalid JSON",
                        error: parseErr.message,
                        raw: pythonData.slice(0, 300) // send first 300 chars for debugging
                    });
                }

                // ✅ Check if Python-side logic failed
                if (!pythonResult.success) {
                    console.error("❌ Python analysis failed:", pythonResult.error);
                    return res.status(500).json({
                        message: "PDF analysis failed",
                        error: pythonResult.error
                    });
                }

                // ✅ Save extracted metrics (all 4: sugar, BP, heartRate)
                if (pythonResult.metrics) {
                    const { bloodSugar, systolicBP, diastolicBP, heartRate } = pythonResult.metrics;

                    if (bloodSugar || systolicBP || diastolicBP || heartRate) {
                        const newMetric = await HealthMetric.create({
                            userId:      req.user.id,
                            bloodSugar:  bloodSugar  || null,
                            systolicBP:  systolicBP  || null,
                            diastolicBP: diastolicBP || null,
                            heartRate:   heartRate   || null,  // ✅ saved from PDF
                            date:        new Date(),
                        });
                        console.log("✅ Metrics saved from PDF:", newMetric._id, {
                            bloodSugar:  bloodSugar  ?? "—",
                            systolicBP:  systolicBP  ?? "—",
                            diastolicBP: diastolicBP ?? "—",
                            heartRate:   heartRate   ?? "—",  // ✅ visible in logs
                        });
                    } else {
                        console.warn("⚠️ No metrics could be extracted from PDF");
                    }
                }

                // ✅ Save report metadata
                const report = await Report.create({
                    userId:       req.user.id,
                    fileName:     req.file.filename,
                    originalName: req.file.originalname,
                    uploadDate:   new Date(),
                });

                // ✅ Build and send response
                const responsePayload = {
                    success:  true,
                    message:  "Report analyzed successfully!",
                    metrics:  pythonResult.metrics,
                    analysis: pythonResult.analysis,
                    reportId: report._id,
                    extraction: {
                        method:       pythonResult.extraction_method || "unknown",
                        metricsFound: pythonResult.metrics_found     || {}
                    }
                };

                if (pythonResult.warning) {
                    responsePayload.warning = pythonResult.warning;
                    console.warn("⚠️ PDF Extraction Warning:", pythonResult.warning);
                }

                res.json(responsePayload);
                console.log("✅ Report processed and saved:", report._id);

            } catch (err) {
                console.error("❌ Upload handler error:", err.message);
                if (!res.headersSent) {
                    res.status(500).json({
                        message: "Server error while processing report",
                        error: err.message
                    });
                }
            }
        });

    } catch (err) {
        console.error("❌ Upload route error:", err.message);
        res.status(500).json({ message: "Server error during upload" });
    }
});

// ✅ Fetch all reports
app.get("/api/reports", authMiddleware, async (req, res) => {
  try {
    const reports = await Report.find({ userId: req.user.id }).sort({
      uploadDate: -1,
    });
    res.json(reports);
  } catch (err) {
    console.error("❌ Fetch reports error:", err.message);
    res.status(500).json({ message: "Error fetching reports" });
  }
});

// ✅ Rename report
app.put("/api/reports/:id", authMiddleware, async (req, res) => {
  try {
    const { newName } = req.body;
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { originalName: newName },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json({ message: "Report renamed successfully", report });
  } catch (err) {
    console.error("❌ Rename error:", err.message);
    res.status(500).json({ message: "Error renaming report" });
  }
});

// ✅ Delete report (with file removal)
app.delete("/api/reports/:id", authMiddleware, async (req, res) => {
  try {
    const report = await Report.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!report)
      return res.status(404).json({ message: "Report not found" });

    const filePath = path.join(__dirname, "uploads", report.fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ message: "Report deleted successfully" });
  } catch (err) {
    console.error("❌ Delete report error:", err.message);
    res.status(500).json({ message: "Error deleting report" });
  }
});

// ✅ Cleanup missing report files
app.delete("/api/reports/cleanup/missing", async (req, res) => {
  const reports = await Report.find();
  let removed = 0;
  for (const r of reports) {
    const filePath = path.join(__dirname, "uploads", r.fileName);
    if (!fs.existsSync(filePath)) {
      await Report.deleteOne({ _id: r._id });
      removed++;
    }
  }
  res.json({ message: `🧹 Cleaned ${removed} missing reports.` });
});

/* ============================================================
   🌐 FRONTEND ROUTES
============================================================ */
app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "../login/login.html"))
);
app.get("/signup", (req, res) =>
  res.sendFile(path.join(__dirname, "../signup/signup.html"))
);
app.get("/", (req, res) => res.redirect("/login"));

/* ============================================================
   🚀 START SERVER
============================================================ */
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));