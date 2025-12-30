import mongoose from "mongoose";

const { Schema } = mongoose;

/* =========================
   ORDER ITEM
========================= */
const orderItemSchema = new Schema(
  {
    product_id: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variant_id: { type: Schema.Types.ObjectId, ref: "Variant" },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

/* =========================
   STATUS LOG (TIMELINE)
========================= */
const statusLogSchema = new Schema(
  {
    status: {
      type: String,
      enum: [
        "Đã hủy",
        "Chờ xử lý",
        "Đã xác nhận",
        "Đang chuẩn bị hàng",
        "Đang giao hàng",
        "Giao hàng không thành công",
        "Giao hàng thành công",
        "Trả hàng/Hoàn tiền",
      ],
      required: true,
    },
    note: { type: String, default: "" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* =========================
   ORDER
========================= */
const orderSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },

    items: [orderItemSchema],

    subtotal: { type: Number, required: true, default: 0 },

    shipping_fee: { type: Number, default: 30000 },

    discount: {
      code: { type: String },
      amount: { type: Number, default: 0 },
    },

    total: { type: Number, required: true, default: 0 },

    /* ===== STATUS HIỆN TẠI ===== */
    status: {
      type: String,
      enum: [
        "Đã hủy",
        "Chờ xử lý",
        "Đã xác nhận",
        "Đang chuẩn bị hàng",
        "Đang giao hàng",
        "Giao hàng không thành công",
        "Giao hàng thành công",
        "Đang yêu cầu Trả hàng/Hoàn tiền",
        "Trả hàng/Hoàn tiền thành công",
        "Hoàn tất"
      ],
      default: "Chờ xử lý",
    },

    /* ===== TIMELINE ===== */
    status_logs: {
      type: [statusLogSchema],
      default: [],
    },

    payment: {
      method: { type: String, default: "cod" },
      status: { type: String, default: "Chưa thanh toán" },
      transaction_id: { type: String },
    },

    expiredAt: {
      type: Date,
      index: true,
      default: () => new Date(Date.now() + 15 * 60 * 1000),
    },

    shipping_address: { type: Object, default: {} },

    note: { type: String, default: "" },
    delivered_at: Date,
    refunded_at: Date

  },
  { timestamps: true }
);


/* =========================
   AUTO PUSH LOG KHI TẠO ĐƠN
========================= */
orderSchema.pre("save", function (next) {
  if (this.isNew) {
    this.status_logs.push({
      status: this.status,
      note: "Tạo đơn hàng",
    });
  }
  next();
});


export default mongoose.models.Order ||
  mongoose.model("Order", orderSchema);
