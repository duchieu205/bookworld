import mongoose from "mongoose";

const DiscountSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, match: [/^[A-Z0-9]+$/, "Mã giảm giá chỉ gồm chữ và số, không khoảng trắng"] },
  type: { type: String, default: "percent" },
  value: { type: Number, required: true },

  minOrderValue: { type: Number, default: 0 },
  startsAt: { type: Date, default: Date.now },
  endsAt: { type: Date },

  totalUsageLimit: { type: Number }, 
  usedCount: { type: Number, default: 0 },
  perUserLimit: { type: Number, default: 1 },

  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

  status: { type: String, default: "active" }
}, { timestamps: true });

export default mongoose.model("Discount", DiscountSchema);