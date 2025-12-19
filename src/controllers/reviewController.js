import Review from "../models/Review.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import createError from "../utils/createError.js";
import mongoose from "mongoose";

// ================= CREATE REVIEW =================
export const createReview = async (req, res) => {
  const { id: productId } = req.params;
  const { rating = 5, comment = "", images = [] } = req.body;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError(400, "Product ID không hợp lệ");
  }

  const product = await Product.findById(productId);
  if (!product) throw createError(404, "Product không tồn tại");

  // Tìm đơn hàng hợp lệ (đã giao thành công)
  const order = await Order.findOne({
    user_id: req.user._id,
    status: "Giao hàng thành công",
    "items.product_id": productId,
  });

  if (!order) {
    throw createError(403, "Bạn cần mua và nhận sản phẩm này trước khi đánh giá");
  }

  //  Kiểm tra đã review đơn này chưa
  const existedReview = await Review.findOne({
    user: req.user._id,
    product: productId,
    order: order._id,
  });

  if (existedReview) {
    throw createError(400, "Bạn đã đánh giá sản phẩm này cho đơn hàng này rồi");
  }

  //  Validate ảnh
  if (images.length > 5) {
    throw createError(400, "Tối đa 5 ảnh");
  }

  // review
  const review = await Review.create({
    user: req.user._id,
    product: productId,
    order: order._id,
    rating,
    comment,
    images,
    status: "approved",
  });

 const populatedReview = await Review.findById(review._id)
  .populate("user", "name");

return res.success(populatedReview, "Đã gửi đánh giá thành công", 201);

};

// ================= UPDATE REVIEW =================
export const updateReview = async (req, res) => {
  const { id } = req.params;
  const { rating, comment, images } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError(400, "Review ID không hợp lệ");
  }

  const review = await Review.findById(id);
  if (!review) throw createError(404, "Review không tồn tại");

  if (review.user.toString() !== req.user._id.toString()) {
    throw createError(403, "Bạn không có quyền sửa đánh giá này");
  }

  if (images && images.length > 5) {
    throw createError(400, "Tối đa 5 ảnh");
  }

  if (rating !== undefined) review.rating = rating;
  if (comment !== undefined) review.comment = comment;
  if (images !== undefined) review.images = images;

  await review.save();

  const populatedReview = await Review.findById(review._id)
    .populate("user", "name");

  return res.success(populatedReview, "Đã cập nhật đánh giá");
};


// ================= GET REVIEWS BY PRODUCT =================
export const getReviewsByProduct = async (req, res) => {
  const { id: productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw createError(400, "Product ID không hợp lệ");
  }

  const reviews = await Review.find({
    product: productId,
    status: "approved",
  })
    .populate("user", "name")
    .sort({ createdAt: -1 });

  return res.success(reviews, "Danh sách đánh giá");
};

// ================= ADMIN =================
export const listReviewsForAdmin = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;

  const pageNum = Math.max(1, parseInt(page));
  const lim = Math.max(1, parseInt(limit));

  const total = await Review.countDocuments(filter);
  const items = await Review.find(filter)
    .populate("user", "name email")
    .populate("product", "name")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * lim)
    .limit(lim);

  return res.success(
    { items, total, page: pageNum, limit: lim },
    "Danh sách review cho admin"
  );
};

export const approveReview = async (req, res) => {
  const { id } = req.params;

  const review = await Review.findByIdAndUpdate(
    id,
    { status: "approved", admin: req.user._id },
    { new: true }
  );

  if (!review) throw createError(404, "Review không tồn tại");

  return res.success(review, "Đã duyệt review");
};

export const rejectReview = async (req, res) => {
  const { id } = req.params;

  const review = await Review.findByIdAndUpdate(
    id,
    { status: "rejected", admin: req.user._id },
    { new: true }
  );

  if (!review) throw createError(404, "Review không tồn tại");

  return res.success(review, "Đã từ chối review");
};

// ================= DELETE =================
export const deleteReview = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError(400, "Review ID không hợp lệ");
  }

  const review = await Review.findById(id);
  if (!review) throw createError(404, "Review không tồn tại");

  if (review.user.toString() !== req.user._id.toString()) {
    throw createError(403, "Bạn không có quyền xóa review này");
  }

  await review.deleteOne();
  return res.success(null, "Đã xóa review");
};

export default {
  createReview,
  updateReview,
  getReviewsByProduct,
  listReviewsForAdmin,
  approveReview,
  rejectReview,
  deleteReview,
};
