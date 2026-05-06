import express from "express";
import multer from "multer";
import protect from "../middleware/authMiddleware.js";
import Report from "../models/Report.js";

const router = express.Router();

// setup file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// upload report
router.post("/", protect, upload.single("reportFile"), async (req, res) => {
  try {
    const newReport = new Report({
      user: req.user._id,
      title: req.body.reportTitle,
      notes: req.body.reportNotes,
      fileUrl: req.file.path
    });
    await newReport.save();
    res.status(201).json({ message: "Report uploaded successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// get reports
router.get("/", protect, async (req, res) => {
  const reports = await Report.find({ user: req.user._id });
  res.json(reports);
});

export default router;
