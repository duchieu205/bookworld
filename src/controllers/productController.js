import Product from "../models/Product.js";
import createError from "../utils/createError.js";

// Create a new product
export const createProduct = async (req, res) => {
	const body = req.body;

	// Helper: generate a slug from name (remove diacritics and normalize)
	const generateSlug = (name) =>
		String(name)
			.normalize("NFD") // split accents
			.replace(/[,;:.!@#\$%\^&\*\(\)\[\]\{\}\\/\\\?\+="'`~<>|]+/g, "") // remove punctuation
			.replace(/[\u0300-\u036f]/g, "") // remove diacritics
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)+/g, "");

	// Basic slug fallback: if slug not provided, derive from name
	if (!body.slug && body.name) {
		body.slug = generateSlug(body.name);
	}

	// Ensure slug uniqueness: append suffix if needed
	let baseSlug = body.slug || "product";
	let slug = baseSlug;
	let attempt = 0;
	while (await Product.findOne({ slug })) {
		attempt += 1;
		slug = `${baseSlug}-${attempt}`;
	}
	body.slug = slug;

	try {
		const product = await Product.create(body);
		return res.success(product, "Product created", 201);
	} catch (err) {
		// Handle duplicate key just in case of race conditions
		if (err && err.code === 11000) {
			throw createError(409, "Duplicate product slug");
		}
		throw err;
	}
};

// Get list of products with simple pagination and filtering
export const getProducts = async (req, res) => {
	const { page = 1, limit = 10, search, category, status } = req.query;
	const query = {};

	if (search) {
		query.$or = [
			{ name: { $regex: search, $options: "i" } },
			{ description: { $regex: search, $options: "i" } },
		];
	}
	if (category) query.category = category;
	if (status) query.status = status;

	const pageNum = Math.max(1, parseInt(page, 10));
	const lim = Math.max(1, parseInt(limit, 10));

	const total = await Product.countDocuments(query);
	const items = await Product.find(query)
		.skip((pageNum - 1) * lim)
		.limit(lim)
		.sort({ createdAt: -1 });

	return res.success(
		{ items, total, page: pageNum, limit: lim },
		"Products retrieved",
		200
	);
};

// Get product detail by id
export const getProductById = async (req, res) => {
	const { id } = req.params;
	const product = await Product.findById(id);
	if (!product) throw createError(404, "Product not found");
	return res.success(product, "Product retrieved", 200);
};

// Update product
export const updateProduct = async (req, res) => {
	const { id } = req.params;
	const updates = req.body;
	const product = await Product.findByIdAndUpdate(id, updates, { new: true });
	if (!product) throw createError(404, "Product not found");
	return res.success(product, "Product updated", 200);
};

// Delete product
export const deleteProduct = async (req, res) => {
	const { id } = req.params;
	const product = await Product.findByIdAndDelete(id);
	if (!product) throw createError(404, "Product not found");
	return res.success(product, "Product deleted", 200);
};

export default {
	createProduct,
	getProducts,
	getProductById,
	updateProduct,
	deleteProduct,
};
