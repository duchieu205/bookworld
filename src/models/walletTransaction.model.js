// models/WalletTransaction.js
import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
        type: String,
        enum: ["Nạp tiền", "Rút tiền", "Hoàn tiền", "Thanh toán"],
        required: true
    },

    amount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["Chờ xử lý", "Thành công", "Thất bại"],
      default: "Chờ xử lý",
    },


    expiredAt: {
      type: Date,
      index: true,
      default: () => new Date(Date.now() + 15 * 60 * 1000),
    },

    withdrawalMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WithdrawalMethod",
    },
    image_transaction: {
      type: String,
      default: null,
    },
    approvedWithDrawalAt: {
      type: Date,
    },
    description: String,
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ status: 1 });
walletTransactionSchema.index({ type: 1 });

export default mongoose.model(
  "WalletTransaction",
  walletTransactionSchema
);
