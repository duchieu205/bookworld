import Product from "../models/Product.js";
import createError from "../utils/createError.js";
import mongoose from "mongoose";

// Create a new product
export const createProduct = async (req, res) => {
	const body = req.body;

	// Log body để debug
	console.log("Create product body:", body);

	if (!body.slug && body.name) {
		let slug = body.name
			.toLowerCase()
			.replace(/[^\w]+/g, "-")
			.replace(/^-+|-+$/g, "");

		// Kiểm tra trùng
		const existing = await Product.findOne({ slug });
		if (existing) {
			slug += '-' + Date.now(); // thêm timestamp tránh trùng
		}

		body.slug = slug;
		}


	// Validate category ObjectId nếu có
	if (body.category && !mongoose.Types.ObjectId.isValid(body.category)) {
		return res.status(400).json({ success: false, message: "Invalid category ID" });
	}

	try {
		const product = await Product.create(body);
		return res.success(product, "Product created", 201);
	} catch (err) {
		// Handle duplicate key just in case of race conditions
		if (err && err.code === 11000) {
			return res.status(409).json({ success: false, message: "Duplicate product slug" });
		}
		console.error(err);

		// Nếu lỗi do CastError (ObjectId sai) hoặc ValidationError
		if (err.name === "CastError" || err.name === "ValidationError") {
			return res.status(400).json({ success: false, message: err.message });
		}

		return res.status(500).json({ success: false, message: "Server error" });
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

	// Kiểm tra id hợp lệ
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ success: false, message: "Invalid product ID" });
	}

	const product = await Product.findById(id);
	if (!product) throw createError(404, "Product not found");
	return res.success(product, "Product retrieved", 200);
};

// Update product
export const updateProduct = async (req, res) => {
	const { id } = req.params;
	const updates = req.body;

	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ success: false, message: "Invalid product ID" });
	}

	const product = await Product.findByIdAndUpdate(id, updates, { new: true });
	if (!product) throw createError(404, "Product not found");
	return res.success(product, "Product updated", 200);
};

// Delete product
export const deleteProduct = async (req, res) => {
	const { id } = req.params;

	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ success: false, message: "Invalid product ID" });
	}

	const product = await Product.findByIdAndDelete(id);
	if (!product) throw createError(404, "Product not found");
	return res.success(product, "Product deleted", 200);
};

export const searchProducts = async (req, res) => {
  try {
    const { q } = req.query; // query string: ?q=keyword

    if (!q) return res.status(400).json({ message: "Vui lòng nhập từ khóa" });

    // tìm sản phẩm tên chứa từ khóa, không phân biệt hoa thường
    const products = await Product.find({
      name: { $regex: q, $options: "i" } // "i" = ignore case
    });

    res.json({ results: products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

export const getRelatedProducts = async (req, res) => {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
        return res.status(404).json({ message: "Product not found" });
    }

    const related = await Product.find({
        category: product.category,
        _id: { $ne: id }
    }).limit(6);

    return res.json({ data: related });
};
export default {
	createProduct,
	getProducts,
	getProductById,
	updateProduct,
	deleteProduct,
	searchProducts,
	getRelatedProducts
};
