	import mongoose from "mongoose";

	const variantSchema = new mongoose.Schema(
		{
			product_id: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Product",
				required: true,
			},
			type: {
				type: String,
				enum: ["Bìa cứng", "Bìa mềm"],
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
			quantity: {
				type: Number,
				default: 0,
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
