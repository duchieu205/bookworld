import Review from "../models/Review.js";
import Product from "../models/Product.js";
import createError from "../utils/createError.js";
import mongoose from "mongoose";

// Create a review (status = pending by default)
export const createReview = async (req, res) => {
  const { id: productId } = req.params;
  const { rating = 5, comment = "" } = req.body;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError(400, "Product ID không hợp lệ");
  }

  const product = await Product.findById(productId);
  if (!product) throw createError(404, "Product not found");

  const review = await Review.create({
    user: req.user._id,
    product: productId,
    rating,
    comment,
    status: "pending",
  });

  return res.success(review, "Bình luận đã gửi, chờ admin duyệt", 201);
};

// Public: get approved reviews for a product
export const getReviewsByProduct = async (req, res) => {
  const { id: productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError(400, "Product ID không hợp lệ");
  }

  const reviews = await Review.find({ product: productId, status: "approved" })
    .populate("user", "name email")
    .sort({ createdAt: -1 });

  return res.success(reviews, "Reviews retrieved");
};

// Admin: list reviews (optionally filter by status)
export const listReviewsForAdmin = async (req, res) => {
  const { status = "pending", page = 1, limit = 20 } = req.query;
  const q = {};
  if (status) q.status = status;

  const pageNum = Math.max(1, parseInt(page, 10));
  const lim = Math.max(1, parseInt(limit, 10));

  const total = await Review.countDocuments(q);
  const items = await Review.find(q)
    .populate("user", "name email")
    .populate("product", "name")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * lim)
    .limit(lim);

  return res.success({ items, total, page: pageNum, limit: lim }, "Reviews for admin retrieved");
};

// Admin: approve a review
export const approveReview = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw createError(400, "Review ID không hợp lệ");

  const review = await Review.findByIdAndUpdate(
    id,
    { status: "approved", admin: req.user._id },
    { new: true }
  );
  if (!review) throw createError(404, "Review not found");

  return res.success(review, "Review approved");
};

// Admin: reject a review
export const rejectReview = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) throw createError(400, "Review ID không hợp lệ");

  const review = await Review.findByIdAndUpdate(
    id,
    { status: "rejected", admin: req.user._id },
    { new: true }
  );
  if (!review) throw createError(404, "Review not found");

  return res.success(review, "Review rejected");
};

export default {
  createReview,
  getReviewsByProduct,
  listReviewsForAdmin,
  approveReview,
  rejectReview,
};
