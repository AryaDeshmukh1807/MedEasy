import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: String,
  fileUrl: String,
  notes: String,
  uploadedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Report", reportSchema);
