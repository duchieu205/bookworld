// models/WithdrawalMethod.js
import mongoose from "mongoose";

const normalizeVietnamese = (str = "") =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
const normalizeAccountNumber = (str = "") =>
  str.replace(/\s|-/g, "");
const withdrawalMethodSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    bankName: {
      type: String,
      required: true,
      uppercase: true
    },
    accountNumber: {
      type: String,
      required: true,
      set: normalizeAccountNumber,
    },

    accountName: {
      type: String,
      required: true,
      set: normalizeVietnamese,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);
withdrawalMethodSchema.index(
  { user: 1, bankName: 1, accountNumber: 1 },
  { unique: true }
);

export default mongoose.model(
  "WithdrawalMethod",
  withdrawalMethodSchema
);
