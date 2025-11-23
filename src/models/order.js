import mongoose from "mongoose";

const { Schema } = mongoose;

const orderItemSchema = new Schema(
	{
		product_id: { type: Schema.Types.ObjectId, ref: "Product", required: true },
		variant_id: { type: Schema.Types.ObjectId, ref: "Variant" },
		name: { type: String },
		price: { type: Number, required: true, default: 0 },
		quantity: { type: Number, required: true, default: 1 },
	},
	{ _id: false }
);

const orderSchema = new Schema(
	{
		user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
		items: [orderItemSchema],
		subtotal: { type: Number, required: true, default: 0 },
		shipping_fee: { type: Number, default: 0 },
		discount: {
			code: { type: String },
			amount: { type: Number, default: 0 },
		},
		total: { type: Number, required: true, default: 0 },
		status: {
			type: String,
			enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
			default: "pending",
		},
		payment: {
			method: { type: String, default: "cod" },
			status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
			transaction_id: { type: String },
		},
		shipping_address: { type: Object, default: {} },
		note: { type: String, default: "" },
	},
	{ timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
