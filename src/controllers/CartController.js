 import { populate } from "dotenv";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import createError from "../utils/createError.js";
import Variant from "../models/variant.js"
export const getCart = async (req, res) => {
  const userId = req.user && (req.user._id || req.user.userId);
  if (!userId) throw createError(401, "Chưa đăng nhập");

  const cart = await Cart.findOne({ user_id: userId })
    .populate({
      path: "items.product_id",
      model: "Product",
      populate: {
        path: "category",
        model: "Category"
      }
    })
    .populate({
      path: "items.variant_id",
      model: "Variant",
    });

  return res.success(cart || { items: [] }, "Lấy giỏ hàng thành công", 200);
};


export const addItem = async (req, res) => {
  const userId = req.user && (req.user._id || req.user.userId);
  if (!userId) throw createError(401, "Chưa đăng nhập");

  const { product_id, variant_id, quantity = 1 } = req.body;
  if (!product_id) throw createError(400, "Thiếu product_id");

  const qty = Math.max(1, parseInt(quantity, 10) || 1);

  if (!product_id) throw createError(400, "Thiếu product_id");
  if (!variant_id) throw createError(400, "Thiếu variant_id");


  const variant = await Variant.findById(variant_id);
  if (!variant) throw createError(404, "Variant không tồn tại");
  if (variant.quantity < quantity) {
    throw createError(400, `Chỉ còn ${variant.quantity} sản phẩm`);
  }

  let cart = await Cart.findOne({ user_id: userId });

  // Nếu chưa có cart
  if (!cart) {
    if (variant && qty > variant.quantity) {
      throw createError(400, "Số lượng vượt quá tồn kho");
    }

    cart = await Cart.create({
      user_id: userId,
      items: [{ product_id, variant_id, quantity: qty }],
    });

    const populated = await Cart.findById(cart._id)
      .populate("items.product_id")
      .populate("items.variant_id");

    return res.success(populated, "Đã thêm vào giỏ hàng", 201);
  }

  // Tìm item đã tồn tại
  const idx = cart.items.findIndex(
    (it) =>
      String(it.product_id) === String(product_id) &&
      String(it.variant_id || "") === String(variant_id || "")
  );

  if (idx >= 0) {
    const newQty = cart.items[idx].quantity + qty;

    if (variant && newQty > variant.quantity) {
      throw createError(
        400,
        `Chỉ còn ${variant.quantity} sản phẩm trong kho`
      );
    }

    cart.items[idx].quantity = newQty;
  } else {
    if (variant && qty > variant.quantity) {
      throw createError(
        400,
        `Chỉ còn ${variant.quantity} sản phẩm trong kho`
      );
    }

    cart.items.push({ product_id, variant_id, quantity: qty });
  }

  await cart.save();

  const populated = await Cart.findById(cart._id)
    .populate("items.product_id")
    .populate("items.variant_id");

  return res.success(populated, "Đã cập nhật giỏ hàng", 200);
};


export const updateItem = async (req, res) => {
  const userId = req.user && (req.user._id || req.user.userId);
  if (!userId) throw createError(401, "Chưa đăng nhập");

  const { productId } = req.params;
  const { variant_id = null, quantity } = req.body;

  if (typeof quantity === "undefined")
    throw createError(400, "Thiếu quantity mới");

  const qty = parseInt(quantity, 10);

  const cart = await Cart.findOne({ user_id: userId });
  if (!cart) throw createError(404, "Giỏ hàng không tồn tại");

  const idx = cart.items.findIndex(
    (it) =>
      String(it.product_id) === String(productId) &&
      String(it.variant_id || "") === String(variant_id || "")
  );

  if (idx === -1)
    throw createError(404, "Sản phẩm trong giỏ không tồn tại");

  // qty <= 0 → xoá
  if (qty <= 0) {
    cart.items.splice(idx, 1);
  } else {
    if (variant_id) {
      const variant = await Variant.findById(variant_id);
      if (!variant) throw createError(404, "Variant không tồn tại");

      if (qty > variant.quantity) {
        throw createError(
          400,
          `Chỉ còn ${variant.quantity} sản phẩm trong kho`
        );
      }
    }

    cart.items[idx].quantity = qty;
  }

  await cart.save();

  const populated = await Cart.findById(cart._id)
    .populate("items.product_id")
    .populate("items.variant_id");

  return res.success(populated, "Đã cập nhật giỏ hàng", 200);
};


export const removeItem = async (req, res) => {
    const userId = req.user && (req.user._id || req.user.userId);
    if (!userId) throw createError(401, "Chưa đăng nhập");

    const { productId } = req.params;
    const { variant_id = null } = req.body;

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart) throw createError(404, "Giỏ hàng không tồn tại");

    const before = cart.items.length;
    cart.items = cart.items.filter((it) => !(String(it.product_id) === String(productId) && String(it.variant_id || "") === String(variant_id || "")));
    if (cart.items.length === before) throw createError(404, "Sản phẩm trong giỏ không tồn tại");

    await cart.save();
    const populated = await Cart.findById(cart._id).populate({
      path: "items.product_id",
      model: "Product"
    })
    .populate({
      path: "items.variant_id",
      model: "Variant",
    });;
    return res.success(populated, "Đã xóa sản phẩm khỏi giỏ hàng", 200);
};

export const clearSelectedItems = async (req, res) => {
  const userId = req.user._id;
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0)
    throw createError(400, "Danh sách không hợp lệ");

  // Lấy cart mà **chưa populate**
  const cart = await Cart.findOne({ user_id: userId });
  if (!cart) throw createError(404, "Giỏ hàng không tồn tại");

  // Xóa dựa trên ObjectId gốc
  cart.items = cart.items.filter(cartItem => {
    return !items.some(sel => 
      cartItem.product_id.equals(sel.product_id) &&
      cartItem.variant_id?.equals(sel.variant_id)
    );
  });

  await cart.save();

  // Populate sau khi xóa
  const populated = await Cart.findById(cart._id)
    .populate("items.product_id")
    .populate("items.variant_id");

  return res.success(populated, "Đã xóa các sản phẩm đã chọn", 200);
};





export const clearCart = async (req, res) => {
    const userId = req.user && (req.user._id || req.user.userId);
    if (!userId) throw createError(401, "Chưa đăng nhập");

    await Cart.findOneAndDelete({ user_id: userId });
    return res.success(null, "Đã xoá giỏ hàng", 200);
};

export default {
    getCart,
    addItem,
    updateItem,
    removeItem,
    clearCart,
};

