import mongoose from "mongoose";

const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  type: { type: String, enum: ["percent", "fixed"], required: true },
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

export default mongoose.model("Coupon", CouponSchema);