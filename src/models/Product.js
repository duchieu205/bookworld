import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		slug: {
			type: String,
			required: true,
			unique: true,
			trim: true,
		},
		description: {
			type: String,
			default: "",
		},
		price: {
			type: Number,
			required: true,
			default: 0,
		},
		images: {
			type: [String],
			default: [],
		},
		quantity: {
			type: Number,
			default: 0,
		},
		category: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Category",
		},
		status: {
			type: String,
			enum: ["active", "inactive"],
			default: "active",
		},
		sku: {
			type: String,
			default: "",
		},
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

const Product = mongoose.model("Product", productSchema);

export default Product;
