
import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["active", "locked"],
      default: "active",
    },
    reasonLocked: {
      type: String,
      default: null,
    },
    lockedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Wallet", walletSchema);
