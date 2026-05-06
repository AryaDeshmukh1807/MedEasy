import mongoose from "mongoose";

const medicationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  dosage: String,
  schedule: String,
  notes: String
});

export default mongoose.model("Medication", medicationSchema);
