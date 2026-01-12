import Order from "../models/order.js";
import Product from "../models/Product.js";
import Variant from "../models/variant.js";
import Discount from "../models/Discount.js";
import User from "../models/User.js"; 
import createError from "../utils/createError.js";
import mongoose from "mongoose";
import WalletTransaction from "../models/walletTransaction.model.js";
import Wallet from "../models/wallet.js";
import {sendCancelOrderMail, sendRejectReturnMail} from "../utils/sendEmail.js";

/* =========================
   CREATE ORDER
========================= */
export const createOrder = async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw createError(401, "Chưa đăng nhập");

  let {
    items,
    shipping_address = {},
    shipping_fee = 30000,
    note = "",
    discountCode,
    payment = { method: "cod" },
  } = req.body;

  // Accept multiple field names from client
  discountCode = discountCode || req.body.code || req.body.coupon || req.body.promoCode;

  // Normalize discount code: strip leading $ and uppercase
  discountCode = discountCode ? String(discountCode).trim().toUpperCase().replace(/^\$/,'') : undefined;

  // Log incoming discount code for debugging
  console.log('[Order Debug] incoming discountCode:', discountCode);

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
  let appliedDiscount = null;
  if (discountCode) {
    const discount = await Discount.findOne({ code: discountCode, status: "active" });
    if (!discount) throw createError(400, "Mã giảm giá không tồn tại hoặc không hoạt động");

    const now = new Date();
    if (discount.startsAt && now < discount.startsAt) throw createError(400, "Mã chưa đến hạn sử dụng");
    if (discount.endsAt && discount.endsAt < now) throw createError(400, "Mã đã hết hạn");

    const limit = Number(discount.totalUsageLimit);
    if (Number.isFinite(limit) && discount.usedCount >= limit) throw createError(400, "Mã đã đạt giới hạn sử dụng");

    if (discount.perUserLimit) {
      const usedByUser = await Order.countDocuments({ "discount.code": discount.code, user_id: userId });
      if (usedByUser >= discount.perUserLimit) throw createError(400, "Bạn đã đạt giới hạn sử dụng mã này");
    }

    if (discount.minOrderValue && subtotal < discount.minOrderValue) throw createError(400, `Đơn hàng cần tối thiểu ${discount.minOrderValue}`);

    // Calculate applicable subtotal (if applicableProducts specified)
    let applicableSubtotal = subtotal;
    if (Array.isArray(discount.applicableProducts) && discount.applicableProducts.length > 0) {
      applicableSubtotal = 0;
      for (const item of orderItems) {
        if (discount.applicableProducts.map(p => String(p)).includes(String(item.product_id))) {
          // get price (variant or product)
          let price = 0;
          if (item.variant_id) {
            const variant = await Variant.findById(item.variant_id);
            price = variant ? variant.price : 0;
          } else {
            const product = await Product.findById(item.product_id);
            price = product ? product.price : 0;
          }
          applicableSubtotal += price * item.quantity;
        }
      }
    }

    if (discount.type === "percent") {
      discountAmount += applicableSubtotal * (discount.value / 100);
    } else {
      discountAmount += discount.value;
    }

    discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
    appliedDiscount = discount;

    // Diagnostic log for debugging why discount might be zero
    console.log("[Discount Debug] code=", discount.code, "type=", discount.type, "value=", discount.value);
    console.log("[Discount Debug] subtotal=", subtotal, "applicableSubtotal=", applicableSubtotal, "discountAmount=", discountAmount);
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
      status: "COD",
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

  // NOTE: We no longer increment `usedCount` at order creation to avoid consuming codes for unpaid/pending orders.
  // `usedCount` is incremented atomically when payment is confirmed (wallet/vnpay) or when admin marks order as paid/delivered.

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

   const orders = await Order.find()
    .populate("user_id", "-password")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: orders });
};

/* =========================
   UPDATE ORDER STATUS (ADMIN)
========================= */
export const updateOrderStatus = async (req, res) => {
  try {
    if (req.user?.role !== "admin") throw createError(403, "Chỉ admin mới cập nhật trạng thái");

    const { status, note } = req.body;
    if (!status) throw createError(400, "Thiếu trạng thái");

    const order = await Order.findById(req.params.id);
    if (!order) throw createError(404, "Đơn hàng không tồn tại");

    const prevPaymentStatus = order.payment.status;
    const oldStatus = order.status;

    const validTransitions = {
      "Chờ xử lý": ["Đã xác nhận"],
      "Đã xác nhận": ["Đang chuẩn bị hàng"],
      "Đang chuẩn bị hàng": ["Đang giao hàng"],
      "Đang giao hàng": [
        "Giao hàng không thành công",
        "Giao hàng thành công",
      ],
      "Giao hàng không thành công": ["Đang giao hàng"],
      "Giao hàng thành công": [],
    };

    if (oldStatus === "Giao hàng không thành công") {
      const failCount = order.status_logs.filter(
        (log) => log.status === "Giao hàng không thành công"
      ).length;

      if (failCount >= 2) {
        throw createError(
          400,
          "Đơn hàng đã giao thất bại 2 lần, hệ thống sẽ tự động huỷ và hoàn tiền"
        );
      }
    }
    const allowed = validTransitions[oldStatus] || [];
    if (!allowed.includes(status)) throw createError(400, `Không thể chuyển từ "${oldStatus}" sang "${status}"`);
    // VNPay: phải thanh toán trước khi giao
    if (
      status === "Đang giao hàng" &&
      order.payment.method === "vnpay" &&
      order.payment.status !== "Đã thanh toán"
    ) {
      throw createError(400, "Đơn hàng chưa thanh toán");
    }

    order.status = status;
    order.status_logs = order.status_logs || [];
    order.status_logs.push({ status, note: note || `Chuyển trạng thái từ "${oldStatus}"`, updatedBy: req.user._id, updatedAt: new Date() });

    const justBecamePaid = prevPaymentStatus !== 'Đã thanh toán' && order.payment.status === 'Đã thanh toán';
    if (justBecamePaid && order.discount && order.discount.code) {
      const discount = await Discount.findOne({ code: order.discount.code });
      if (discount) {
        const limit = Number(discount.totalUsageLimit);
        if (Number.isFinite(limit)) {
          const updated = await Discount.findOneAndUpdate(
            { _id: discount._id, usedCount: { $lt: limit } },
            { $inc: { usedCount: 1 } },
            { new: true }
          );
          if (!updated) throw createError(400, 'Mã đã đạt giới hạn sử dụng');
        } else {
          await Discount.findByIdAndUpdate(discount._id, { $inc: { usedCount: 1 } });
        }
      }
    }
    if (order.status === "Giao hàng thành công") {
      order.payment.status = "Đã thanh toán";
    }
    await order.save();
    return res.json({ success: true, message: "Cập nhật trạng thái thành công", data: order });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Lỗi server" });
  }
};



/* =========================
   CANCEL ORDER (USER / ADMIN)
========================= */
export const cancelOrder = async (req, res) => {
 const order = await Order.findById(req.params.id)
  .populate("user_id", "email name");
  const { note } = req.body;
  if (!order) throw createError(404, "Đơn hàng không tồn tại");

  const prevPaymentStatus = order.payment.status;

  const isOwner = String(order.user_id._id) === String(req.user?._id);
  const isAdmin = req.user?.role === "admin";
  const cancelByText = isAdmin ? "Admin" : "Người dùng";

  if (isAdmin && !note) {
  throw createError(400, "Admin phải nhập lý do hủy đơn");
  }
  if (isOwner && order.status !== "Chờ xử lý") {
    throw createError(400, "Không thể hủy đơn ở trạng thái hiện tại");
  }
  if (!isOwner && !isAdmin) {
    throw createError(403, "Không có quyền hủy đơn");
  }

  if((order.payment.method === "vnpay" || order.payment.method === "wallet") && order.payment.status === "Đã thanh toán") {
      const userId = order.user_id;
      const wallet = await Wallet.findOne({user: userId});
      await WalletTransaction.create({
        wallet: wallet._id,
        user: userId,
        type: "Hoàn tiền",
        status: "Thành công",
        amount: order.total,
        description: `Hoàn tiền từ đơn hàng ${order._id}`
      });
      wallet.balance += order.total;
      await wallet.save()
  }

  if (prevPaymentStatus === "Đã thanh toán" &&order.discount?.code) {
    await Discount.findOneAndUpdate(
      { code: order.discount.code, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } }
    );
  }

  const oldStatus = order.status;
  const newStatus = "Đã hủy";

 
    order.status = newStatus;


    order.status_logs = order.status_logs || [];
    order.status_logs.push({
      status: newStatus,
      note: `${cancelByText} hủy đơn${note ? ` – Lý do: ${note}` : ""}`,
      updatedBy: req.user?._id,
      updatedAt: new Date(),
    });

    //Hoàn kho
  for (const item of order.items) {
    if (item.variant_id) {
      await Variant.findByIdAndUpdate(item.variant_id, {
        $inc: { quantity: item.quantity },
      });
    }
  }  
  order.note = `${cancelByText} hủy đơn${note ? ` – Lý do: ${note}` : ""}`;
  order.payment.status = "Đã hủy";
  await order.save();
  try {
    if(isAdmin) {
      await sendCancelOrderMail({
        to: order.user_id.email,
        order,
        note,
        prevPaymentStatus,
      });
    }
      
    } catch (error) {
      console.error("Send cancel order mail failed:", error);
    }

  res.json({
    success: true,
    message: "Đã hủy đơn hàng",
    data: order,
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

export const requestReturnOrder = async (req, res) => {
    const userId = req.user?._id;
    const {reason, images} = req.body;
    if (!reason || !images) {
      throw createError(401, "Thiếu thông tin gửi lên"); 
    }
    if (!userId) throw createError(401, "Chưa đăng nhập");
    const { orderId } = req.params;

    const wallet = await Wallet.findOne({ user: userId });
    if(wallet.status === "locked") {
          throw createError(400, "Ví đang bị khóa. Vui lòng liên hệ hỗ trợ để biết thêm thông tin chi tiết");
    }
    const order = await Order.findOne({ _id: orderId});
    
    if (!order)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

    if (order.status !== "Giao hàng thành công")
      return res.status(400).json({
        message: "Đơn hàng không đủ điều kiện trả",
      });
    const oldStatus = order.status;
    const newStatus = "Đang yêu cầu Trả hàng/Hoàn tiền";

    // Cập nhật trạng thái
    order.status = newStatus;

    // Push log trạng thái
    order.status_logs = order.status_logs || [];
    order.status_logs.push({
      status: newStatus,
      note: `Chuyển trạng thái từ "${oldStatus}`,
      updatedBy: userId,
      updatedAt: new Date(),
    });

    order.images_return = images;
    order.note = reason;

    await order.save();

    res.json({
      message: "Gửi yêu cầu trả hàng / hoàn tiền thành công",
      order,
    });
  } ;

export const approveReturnOrder = async (req, res) => {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    
    const prevPaymentStatus = order.payment.status;

    const adminId = req.user?._id;
    if (!adminId) throw createError(401, "Chưa đăng nhập");

    if (!order)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    if (order.status === "Trả hàng/Hoàn tiền thành công") {
      return res.status(400).json({ message: "Đơn hàng đã được hoàn tiền" });
    }

// rollback voucher nếu đơn đã từng thanh toán
    if (prevPaymentStatus === "Đã thanh toán" && order.discount?.code) {
      await Discount.findOneAndUpdate(
        { code: order.discount.code, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } }
      );
    }

    for (const item of order.items) {
      if (item.variant_id) {
        await Variant.findByIdAndUpdate(item.variant_id, {
          $inc: { quantity: item.quantity },
        });
      }
    }
    const wallet = await Wallet.findOne({user: order.user_id});

    await WalletTransaction.create({
            wallet: wallet._id,
            user: order.user_id,
            type: "Hoàn tiền",
            status: "Thành công",
            amount: order.total,
            description: `Hoàn tiền từ đơn hàng ${order._id}`
      });

    wallet.balance += order.total;
    await wallet.save();

    const oldStatus = order.status;
    const newStatus = "Trả hàng/Hoàn tiền thành công";

    // Cập nhật trạng thái
    order.status = newStatus;

    // Push log trạng thái
    order.status_logs = order.status_logs || [];
    order.status_logs.push({
      status: newStatus,
      note: `Chuyển trạng thái từ "${oldStatus}`,
      updatedBy: adminId,
      updatedAt: new Date(),
    });

    await order.save();


    res.json({
      message: "Đã duyệt Trả hàng/Hoàn tiền",
      order,
    });
  };

export const rejectReturnOrder = async (req, res) => {
  
    const { orderId } = req.params;
    const adminId = req.user?._id;
    if (!adminId) throw createError(401, "Chưa đăng nhập");
    const order = await Order.findById(orderId)
    .populate("user_id", "email name");
    if (!order) throw createError(404, "Đơn hàng không tồn tại");
    

    const oldStatus = order.status;
    order.status_logs.push({
      status: "Từ chối yêu cầu trả hàng/Hoàn tiền",
      note: `Chuyển trạng thái từ "${oldStatus}`,
      updatedBy: adminId,
      updatedAt: new Date(),
    });
    order.status = "Giao hàng thành công";
    
     order.status_logs.push({
      status: "Giao hàng thành công",
      note: `Chuyển trạng thái từ "${order.status} do đã từ chối yêu cầu`,
      updatedBy: adminId,
      updatedAt: new Date(),
    });
    order.images_return = null;
    await order.save();

    try {
        await sendRejectReturnMail({
          to: order.user_id.email,
          order,
          reason: req.body.note,
        });
      } catch (err) {
        console.error("Send reject return mail failed:", err);
    }
  };

export const rejectReturnOrderClient =  async (req, res) => {
  try {
    const {orderId} = req.params;
    const user = req.user?._id;
    if (!user) throw createError(401, "Chưa đăng nhập");
     const order = await Order.findById(orderId);
    if (!order) throw createError(404, "Đơn hàng không tồn tại");
  
    oldStatus = order.status;
    order.status_logs.push({
      status: "Đã hủy yêu cầu trả hàng/Hoàn tiền",
      note: `Chuyển trạng thái từ "${oldStatus}`,
      updatedBy: user,
      updatedAt: new Date(),
    });
    order.status = "Giao hàng thành công";
    await order.save();

  }

  catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
}
