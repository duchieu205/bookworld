	import Variant from "../models/variant.js";
	import Product from "../models/Product.js";
	import createError from "../utils/createError.js";

	// Create a new variant
	export const createVariant = async (req, res) => {
		const body = req.body;

		// Validate product exists
		if (!body.product) throw createError(400, "product is required");
		const product = await Product.findById(body.product);
		if (!product) throw createError(404, "Product not found");

		// Validate type
		const allowed = ["hardcover", "paperback"];
		if (!body.type || !allowed.includes(body.type)) {
			throw createError(400, `type is required and must be one of: ${allowed.join(",")}`);
		}

		const variant = await Variant.create(body);
		return res.success(variant, "Variant created", 201);
	};

	// Get list of variants (optionally filter by product)
	export const getVariants = async (req, res) => {
		const { product, page = 1, limit = 20 } = req.query;
		const query = {};
		if (product) query.product = product;

		const pageNum = Math.max(1, parseInt(page, 10));
		const lim = Math.max(1, parseInt(limit, 10));

		const total = await Variant.countDocuments(query);
		const items = await Variant.find(query)
			.skip((pageNum - 1) * lim)
			.limit(lim)
			.sort({ createdAt: -1 })
			.populate("product");

		return res.success({ items, total, page: pageNum, limit: lim }, "Variants retrieved", 200);
	};

	// Get variant by id
	export const getVariantById = async (req, res) => {
		const { id } = req.params;
		const variant = await Variant.findById(id).populate("product");
		if (!variant) throw createError(404, "Variant not found");
		return res.success(variant, "Variant retrieved", 200);
	};

	// Update variant
	export const updateVariant = async (req, res) => {
		const { id } = req.params;
		const updates = req.body;

		if (updates.product) {
			const p = await Product.findById(updates.product);
			if (!p) throw createError(404, "Product not found");
		}

		if (updates.type) {
			const allowed = ["hardcover", "paperback"];
			if (!allowed.includes(updates.type)) {
				throw createError(400, `type must be one of: ${allowed.join(",")}`);
			}
		}

		const variant = await Variant.findByIdAndUpdate(id, updates, { new: true }).populate("product");
		if (!variant) throw createError(404, "Variant not found");
		return res.success(variant, "Variant updated", 200);
	};

	// Delete variant
	export const deleteVariant = async (req, res) => {
		const { id } = req.params;
		const variant = await Variant.findByIdAndDelete(id);
		if (!variant) throw createError(404, "Variant not found");
		return res.success(variant, "Variant deleted", 200);
	};

	export default {
		createVariant,
		getVariants,
		getVariantById,
		updateVariant,
		deleteVariant,
	};

	// Temporary: allow update by sending id in request body (PUT /api/variants)
	export const updateVariantByBody = async (req, res) => {
		const id = req.body.id || req.body._id;
		if (!id) throw createError(400, "id (or _id) is required in request body");

		const updates = { ...req.body };
		// remove id fields from updates
		delete updates.id;
		delete updates._id;

		if (updates.product) {
			const p = await Product.findById(updates.product);
			if (!p) throw createError(404, "Product not found");
		}

		if (updates.type) {
			const allowed = ["hardcover", "paperback"];
			if (!allowed.includes(updates.type)) {
				throw createError(400, `type must be one of: ${allowed.join(",")}`);
			}
		}

		const variant = await Variant.findByIdAndUpdate(id, updates, { new: true }).populate("product");
		if (!variant) throw createError(404, "Variant not found");
		return res.success(variant, "Variant updated", 200);
	};

