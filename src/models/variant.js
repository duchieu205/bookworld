	import mongoose from "mongoose";

	const variantSchema = new mongoose.Schema(
		{
			product: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Product",
				required: true,
			},
			type: {
				type: String,
				enum: ["hardcover", "paperback"],
				required: true,
			},
			price: {
				type: Number,
				required: true,
				default: 0,
			},
			sku: {
				type: String,
				default: "",
				trim: true,
			},
			stock: {
				type: Number,
				default: 0,
			},
			images: {
				type: [String],
				default: [],
			},
			status: {
				type: String,
				enum: ["active", "inactive"],
				default: "active",
			},
		},
		{
			timestamps: true,
			versionKey: false,
		}
	);

	const Variant = mongoose.model("Variant", variantSchema);

	export default Variant;
