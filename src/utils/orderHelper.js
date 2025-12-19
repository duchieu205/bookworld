import Order from "../models/Order.js";

/**
 * Kiểm tra user đã mua và nhận product chưa
 * @param {ObjectId} userId
 * @param {ObjectId} productId
 * @returns {Boolean}
 */
export const hasUserPurchasedProduct = async (userId, productId) => {
  const order = await Order.findOne({
    user_id: userId,
    status: "Giao hàng thành công",
    "items.product_id": productId,
  }).lean();

  return !!order;
};
