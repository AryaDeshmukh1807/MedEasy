import express from "express";
import protect from "../middleware/authMiddleware.js";
import Medication from "../models/Medication.js";

const router = express.Router();

router.post("/", protect, async (req, res) => {
  const { name, dosage, schedule, notes } = req.body;
  const med = new Medication({ user: req.user._id, name, dosage, schedule, notes });
  await med.save();
  res.status(201).json({ message: "Medication added" });
});

router.get("/", protect, async (req, res) => {
  const meds = await Medication.find({ user: req.user._id });
  res.json(meds);
});

export default router;
