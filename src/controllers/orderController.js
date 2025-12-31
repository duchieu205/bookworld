import Order from "../models/order.js";
import Product from "../models/Product.js";
import Variant from "../models/variant.js";
import Discount from "../models/Discount.js";
import User from "../models/User.js"; 
import createError from "../utils/createError.js";
import mongoose from "mongoose";
import WalletTransaction from "../models/walletTransaction.model.js";
import Wallet from "../models/wallet.js";

/* =========================
   CREATE ORDER
========================= */
export const createOrder = async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw createError(401, "Chưa đăng nhập");

  const {
    items,
    shipping_address = {},
    shipping_fee = 30000,
    note = "",
    discountCode,
    payment = { method: "cod" },
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    throw createError(400, "Không có sản phẩm để đặt hàng");
  }

  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const { product_id, variant_id, quantity } = item;
    if (!product_id || !quantity) {
      throw createError(400, "Thiếu thông tin sản phẩm");
    }

    let price = 0;

    if (variant_id) {
      const variant = await Variant.findById(variant_id);
      if (!variant) throw createError(404, "Biến thể không tồn tại");
      if (variant.quantity < quantity) {
        throw createError(400, "Không đủ số lượng biến thể");
      }
      price = variant.price;
    } else {
      const product = await Product.findById(product_id);
      if (!product) throw createError(404, "Sản phẩm không tồn tại");
      price = product.price;
    }

    subtotal += price * quantity;
    orderItems.push({ product_id, variant_id, quantity });
  }

  // Discount
  let discountAmount = 0;
  if (discountCode) {
    for (const item of orderItems) {
      const discount = await Discount.findOne({
        code: discountCode,
        productID: String(item.product_id),
        status: "active",
      });

      if (discount) {
        if (discount.discount_type === "%") {
          discountAmount += subtotal * (discount.discount_value / 100);
        } else {
          discountAmount += discount.discount_value;
        }
      }
    }
  }

  const total = Math.max(0, subtotal + shipping_fee - discountAmount);

  const order = await Order.create({
    user_id: userId,
    items: orderItems,
    subtotal,
    shipping_fee,
    discount: { code: discountCode || "", amount: discountAmount },
    total,
    shipping_address,
    note,
    status: "Chờ xử lý",
    payment: {
      method: payment.method || "cod",
      status: "Chưa thanh toán",
    },
  });

  // Trừ kho
  for (const item of orderItems) {
    if (item.variant_id) {
      await Variant.findByIdAndUpdate(item.variant_id, {
        $inc: { quantity: -item.quantity },
      });
    }
  }

  res.status(201).json({
    success: true,
    message: "Đã tạo đơn hàng",
    data: order,
  });
};

/* =========================
   GET ORDER BY ID
========================= */
export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createError(400, "ID đơn hàng không hợp lệ"));
    }
    
    if (!req.user) return next(createError(401, "Chưa đăng nhập"));
    
    // Step 1: Get order without populate first
    const order = await Order.findById(id);
    if (!order) return next(createError(404, "Không tìm thấy đơn hàng"));
    
    // Step 2: Check permissions with unpopulated user_id
    const isOwner = String(order.user_id) === String(req.user._id);
    const isAdmin = req.user.role === "admin";
    
    if (!isOwner && !isAdmin) {
      return next(createError(403, "Không có quyền truy cập đơn hàng"));
    }
    
    // Step 3: Safe populate with individual error handling
    let populatedOrder = order.toObject();
    
    // Populate user_id safely
    try {
      const user = await User.findById(order.user_id).select("name email");
      if (user) {
        populatedOrder.user_id = user;
      } else {
        console.warn(`User not found for ID: ${order.user_id}`);
        // Keep as string ID
      }
    } catch (err) {
      console.error("Error populating user:", err);
      // Keep original user_id as string
    }
    
    // Populate items safely
    if (populatedOrder.items && populatedOrder.items.length > 0) {
      for (let i = 0; i < populatedOrder.items.length; i++) {
        const item = populatedOrder.items[i];
        
        // Populate product_id
        if (item.product_id) {
          try {
            const product = await Product.findById(item.product_id).select("name price images");
            if (product) {
              populatedOrder.items[i].product_id = product;
            } else {
              console.warn(`Product not found for ID: ${item.product_id}`);
              // Keep as string ID
            }
          } catch (err) {
            console.error(`Error populating product ${item.product_id}:`, err);
            // Keep as string ID
          }
        }
        
        // Populate variant_id
        if (item.variant_id) {
          try {
            const variant = await Variant.findById(item.variant_id).select("name type price");
            if (variant) {
              populatedOrder.items[i].variant_id = variant;
            } else {
              console.warn(`Variant not found for ID: ${item.variant_id}`);
              // Keep as string ID
            }
          } catch (err) {
            console.error(`Error populating variant ${item.variant_id}:`, err);
            // Keep as string ID
          }
        }
      }
    }
    
    res.json({ success: true, data: populatedOrder });
    
  } catch (err) {
    console.error("getOrderById error:", err);
    next(createError(500, err.message || "Lỗi server"));
  }
};

/* =========================
   GET USER ORDERS
========================= */
export const getUserOrders = async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw createError(401, "Chưa đăng nhập");

  const orders = await Order.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .populate("items.product_id", "name price images")
    .populate("items.variant_id", "name type price");

  res.json({ success: true, data: orders });
};

/* =========================
   GET ALL ORDERS (ADMIN)
========================= */
export const getAllOrders = async (req, res) => {
  if (req.user?.role !== "admin") {
    throw createError(403, "Chỉ admin mới được truy cập");
  }

  const orders = await Order.find().sort({ createdAt: -1 });
  res.json({ success: true, data: orders });
};

/* =========================
   UPDATE ORDER STATUS (ADMIN)
========================= */
export const updateOrderStatus = async (req, res) => {
  if (req.user?.role !== "admin") {
    throw createError(403, "Chỉ admin mới cập nhật trạng thái");
  }

  const { status, note } = req.body;
  if (!status) throw createError(400, "Thiếu trạng thái");

  const order = await Order.findById(req.params.id);
  if (!order) throw createError(404, "Đơn hàng không tồn tại");

  const validTransitions = {
    "Chờ xử lý": ["Đã xác nhận", "Đã hủy"],
    "Đã xác nhận": ["Đang chuẩn bị hàng", "Đã hủy"],
    "Đang chuẩn bị hàng": ["Đang giao hàng", "Đã hủy"],
    "Đang giao hàng": [
      "Giao hàng thành công",
      "Giao hàng không thành công",
    ],
    "Giao hàng không thành công": ["Trả hàng/Hoàn tiền"],
    "Giao hàng thành công": ["Trả hàng/Hoàn tiền"],
    "Trả hàng/Hoàn tiền": [],
    "Đã hủy": [],
  };

  const allowed = validTransitions[order.status] || [];
  if (!allowed.includes(status)) {
    throw createError(
      400,
      `Không thể chuyển từ "${order.status}" sang "${status}"`
    );
  }

  // VNPay phải thanh toán trước khi giao
  if (
    status === "Đang giao hàng" &&
    order.payment.method === "vnpay" &&
    order.payment.status !== "Đã thanh toán"
  ) {
    throw createError(400, "Đơn hàng chưa thanh toán");
  }

  // COD: giao thành công -> đã thanh toán
  if (status === "Giao hàng thành công" && order.payment.method === "cod") {
    order.payment.status = "Đã thanh toán";
  }

  // Hoàn kho khi hủy / hoàn tiền
  if (["Đã hủy", "Trả hàng/Hoàn tiền"].includes(status)) {
    for (const item of order.items) {
      if (item.variant_id) {
        await Variant.findByIdAndUpdate(item.variant_id, {
          $inc: { quantity: item.quantity },
        });
      }
    }
    order.payment.status = "Đã hủy";
  }

  order.status = status;
  if (note) {
    order.note = order.note
      ? `${order.note}\n[Admin] ${note}`
      : `[Admin] ${note}`;
  }

  await order.save();

  res.json({
    success: true,
    message: "Cập nhật trạng thái thành công",
    data: order,
  });
};

/* =========================
   CANCEL ORDER (USER / ADMIN)
========================= */
export const cancelOrder = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw createError(404, "Đơn hàng không tồn tại");

  const isOwner = String(order.user_id) === String(req.user?._id);
  const isAdmin = req.user?.role === "admin";

  if (isOwner && order.status !== "Chờ xử lý") {
    throw createError(400, "Không thể hủy đơn ở trạng thái hiện tại");
  }
  if (!isOwner && !isAdmin) {
    throw createError(403, "Không có quyền hủy đơn");
  }

  order.status = "Đã hủy";
  order.payment.status = "Đã hủy";

  for (const item of order.items) {
    if (item.variant_id) {
      await Variant.findByIdAndUpdate(item.variant_id, {
        $inc: { quantity: item.quantity },
      });
    }
  }

  await order.save();

  res.json({
    success: true,
    message: "Đã hủy đơn hàng",
    data: order,
  });
};

/* =========================
   PAY ORDER
========================= */
export const payOrder = async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw createError(401, "Chưa đăng nhập");

  const order = await Order.findById(req.params.id);
  if (!order) throw createError(404, "Không tìm thấy đơn hàng");

  if (String(order.user_id) !== String(userId)) {
    throw createError(403, "Không có quyền thanh toán đơn hàng này");
  }

  if (order.payment.status === "Đã thanh toán") {
    throw createError(400, "Đơn hàng đã được thanh toán");
  }

  if (order.payment.method === "cod") {
    return res.json({
      success: true,
      message: "Đơn hàng COD sẽ thanh toán khi nhận hàng",
      data: order,
    });
  }

  throw createError(400, "Thanh toán online được xử lý ở VNPay");
};

/* =========================
   PAYMENT WEBHOOK
========================= */
export const paymentWebhook = async (req, res) => {
  res.json({
    success: true,
    message: "Webhook received",
  });
};
/* =========================
   REFUND ORDER TO WALLET
========================= */
export const refundOrderToWallet = async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw createError(401, "Chưa đăng nhập");

  const order = await Order.findById(req.params.id);
  if (!order) throw createError(404, "Không tìm thấy đơn hàng");

  // Check quyền sở hữu
  if (String(order.user_id) !== String(userId)) {
    throw createError(403, "Không có quyền thao tác đơn hàng này");
  }

  // Validate điều kiện hoàn tiền
  if (order.status !== "Đã hủy") {
    throw createError(400, "Chỉ hoàn tiền cho đơn hàng đã hủy");
  }

  if (order.payment.method === "cod") {
    throw createError(400, "Đơn hàng COD không cần hoàn tiền");
  }

  if (order.payment.status !== "Đã thanh toán") {
    throw createError(400, "Đơn hàng chưa thanh toán");
  }

  if (order.payment.refunded) {
    throw createError(400, "Đơn hàng đã được hoàn tiền");
  }

  // Hoàn tiền vào ví
  const wallet = await Wallet.findOne({ user: userId });
  if (!wallet) throw createError(404, "Không tìm thấy ví");

  wallet.balance += order.total;
  await wallet.save();

  // Tạo transaction history
  await WalletTransaction.create({
    user: userId,
    wallet: wallet._id,
    type: "Hoàn tiền",
    amount: order.total,
    status: "Thành công",
    description: `Hoàn tiền đơn hàng #${order._id.toString().slice(-8)}`,
    metadata: {
      order_id: order._id,
    }
  });

  // Cập nhật trạng thái đơn hàng
  order.payment.refunded = true;
  order.refunded_at = new Date();
  await order.save();

  res.json({
    success: true,
    message: `Đã hoàn ${order.total.toLocaleString()}đ về ví`,
    data: { 
      order, 
      newBalance: wallet.balance 
    }
  });
};

