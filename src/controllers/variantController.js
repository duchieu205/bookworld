import mongoose from "mongoose";
import Variant from "../models/variant.js";
import Product from "../models/Product.js";
import createError from "../utils/createError.js";


// Create a new variant
export const createVariant = async (req, res, next) => {
  try {
    const body = req.body;

    // Validate product_id
    if (!body.product_id) throw createError(400, "product_id is required");
    if (!mongoose.Types.ObjectId.isValid(body.product_id))
      throw createError(400, "Invalid product_id");

    const product = await Product.findById(body.product_id);
    if (!product) throw createError(404, "Product not found");


    // Tạo variant
    const variant = await Variant.create({
      product_id: body.product_id,
      type: body.type,
      price: body.price ?? 0,
      sku: body.sku || undefined, 
      quantity: body.quantity ?? 0,
      status: body.status ?? "active",
    });

    // Trả về chuẩn
    return res.status(201).json({
      success: true,
      message: "Variant created",
      data: variant,
    });
  } catch (err) {
    console.error(" createVariant error:", err);
    if (err.status) return res.status(err.status).json({ message: err.message });
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// Get list of variants
export const getVariants = async (req, res) => {
  const { product_id, page = 1, limit, status } = req.query;
  const query = {};

  if (product_id) {
    if (!mongoose.Types.ObjectId.isValid(product_id))
      throw createError(400, "Invalid product_id");
    query.product_id = product_id;
  }
  const isAdmin = req.isAdminRequest === true;


  if (!isAdmin) {
    query.status = "active";
  }
  if (isAdmin && status) {
    query.status = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const lim = Math.max(1, parseInt(limit, 10));

  const total = await Variant.countDocuments(query);
  const items = await Variant.find(query)
    .skip((pageNum - 1) * lim)
    .limit(lim)
    .sort({ createdAt: -1 })
    .populate("product_id", "name slug images");

  return res.success(
    { items, total, page: pageNum, limit: lim },
    "Variants retrieved",
    200
  );
};

// Get variant by id
export const getVariantById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError(400, "Invalid variant id");

  const variant = await Variant.findById(id).populate(
    "product_id",
    "name slug"
  );

  if (!variant) throw createError(404, "Variant not found");

  return res.success(variant, "Variant retrieved", 200);
};

// Update variant
export const updateVariant = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError(400, "Invalid variant id");

  if (updates.product_id) {
    if (!mongoose.Types.ObjectId.isValid(updates.product_id))
      throw createError(400, "Invalid product_id");

    const p = await Product.findById(updates.product_id);
    if (!p) throw createError(404, "Product not found");
  }
   if (updates.status === "active") {
      const variant = await Variant.findById(id).populate("product_id");
  
      if (!variant.product_id || variant.product_id.status !== "active") {
        throw createError(
          400,
          "Không thể kích hoạt biến thể khi sản phẩm đang bị vô hiệu hoá"
        );
      }
  }

  const variant = await Variant.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).populate("product_id", "name slug");

  if (!variant) throw createError(404, "Variant not found");

  return res.success(variant, "Variant updated", 200);
};

// Delete variant
export const deleteVariant = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError(400, "Invalid variant id");

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

// Temporary: allow update by sending id in request body
export const updateVariantByBody = async (req, res) => {
  const id = req.body.id || req.body._id;
  if (!id) throw createError(400, "id (or _id) is required in request body");

  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError(400, "Invalid variant id");

  const updates = { ...req.body };
  delete updates.id;
  delete updates._id;

  if (updates.product_id) {
    if (!mongoose.Types.ObjectId.isValid(updates.product_id))
      throw createError(400, "Invalid product_id");

    const p = await Product.findById(updates.product_id);
    if (!p) throw createError(404, "Product not found");
  }

  const variant = await Variant.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).populate("product_id", "name slug");

  if (!variant) throw createError(404, "Variant not found");

  return res.success(variant, "Variant updated", 200);
};
