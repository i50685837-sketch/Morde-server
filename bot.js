const mongoose = require("mongoose");

const botSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    sessionId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "running", "stopped", "failed"],
      default: "pending",
    },
    lastError: { type: String, default: null },
    deployedAt: { type: Date, default: Date.now },
    stoppedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bot", botSchema);
