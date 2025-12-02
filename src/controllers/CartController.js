import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import createError from "../utils/createError.js";

export const getCart = async (req, res) => {
    const userId = req.user && (req.user._id || req.user.userId);
    if (!userId) throw createError(401, "Chưa đăng nhập");

    const cart = await Cart.findOne({ user_id: userId }).populate("items.product_id", "name price images quantity");
    return res.success(cart || { items: [] }, "Lấy giỏ hàng thành công", 200);
};

export const addItem = async (req, res) => {
    const userId = req.user && (req.user._id || req.user.userId);
    if (!userId) throw createError(401, "Chưa đăng nhập");

    const { product_id, variant_id = null, quantity = 1 } = req.body;
    if (!product_id) throw createError(400, "Thiếu product_id");
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    const product = await Product.findById(product_id);
    if (!product) throw createError(404, "Sản phẩm không tồn tại");
    if (typeof product.quantity === "number" && product.quantity < qty) throw createError(400, "Sản phẩm không đủ số lượng");

    let cart = await Cart.findOne({ user_id: userId });
    if (!cart) {
        cart = await Cart.create({ user_id: userId, items: [{ product_id, variant_id, quantity: qty }] });
        const populated = await cart.populate("items.product_id", "name price images quantity");
        return res.success(populated, "Đã thêm vào giỏ hàng", 201);
    }

    // find existing item (match product_id and variant_id)
    const idx = cart.items.findIndex((it) => String(it.product_id) === String(product_id) && String(it.variant_id || "") === String(variant_id || ""));
    if (idx >= 0) {
        cart.items[idx].quantity = (cart.items[idx].quantity || 0) + qty;
    } else {
        cart.items.push({ product_id, variant_id, quantity: qty });
    }

    await cart.save();
    const populated = await Cart.findById(cart._id).populate("items.product_id", "name price images quantity");
    return res.success(populated, "Đã cập nhật giỏ hàng", 200);
};

export const updateItem = async (req, res) => {
    const userId = req.user && (req.user._id || req.user.userId);
    if (!userId) throw createError(401, "Chưa đăng nhập");

    const { productId } = req.params;
    const { variant_id = null, quantity } = req.body;
    if (typeof quantity === "undefined") throw createError(400, "Thiếu quantity mới");
    const qty = parseInt(quantity, 10);

    const cart = await Cart.findOne({ user_id: userId });
    if (!cart) throw createError(404, "Giỏ hàng không tồn tại");

    const idx = cart.items.findIndex((it) => String(it.product_id) === String(productId) && String(it.variant_id || "") === String(variant_id || ""));
    if (idx === -1) throw createError(404, "Sản phẩm trong giỏ không tồn tại");

    if (qty <= 0) {
        cart.items.splice(idx, 1);
    } else {
        const product = await Product.findById(productId);
        if (!product) throw createError(404, "Sản phẩm không tồn tại");
        if (typeof product.quantity === "number" && product.quantity < qty) throw createError(400, "Sản phẩm không đủ số lượng");
        cart.items[idx].quantity = qty;
    }

    await cart.save();
    const populated = await Cart.findById(cart._id).populate("items.product_id", "name price images quantity");
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
    const populated = await Cart.findById(cart._id).populate("items.product_id", "name price images quantity");
    return res.success(populated, "Đã xóa sản phẩm khỏi giỏ hàng", 200);
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

