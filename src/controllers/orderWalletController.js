
import Order from "../models/order.js";
import Variant from "../models/variant.js";
import Discount from "../models/Discount.js";
import createError from "../utils/createError.js";
import Wallet from "../models/wallet.js";
import WalletTransaction from "../models/walletTransaction.model.js";
import { computeDiscountForItems } from "../utils/discountUtil.js";
import {sendWalletEmail} from "../utils/sendEmail.js"

export const createOrderWithWallet = async (req, res) => {
    const userId = req.user && req.user._id;
    if (!userId) throw createError(401, "Chưa đăng nhập");
    const wallet = await Wallet.findOne({ user: userId});
    if(wallet.status === "locked") {
        throw createError(400, "Ví của bạn đang bị khóa. Vui lòng liên hệ hỗ trợ để biết thêm thông tin chi tiết");
    }
    let {
        items: bodyItems,
        shipping_address = {},
        shipping_fee = 0,
        note = "",
        discountCode,
    } = req.body;

    // Accept multiple field names from client
    discountCode = discountCode || req.body.code || req.body.coupon || req.body.promoCode;

    // Normalize discount code: strip leading $ and uppercase
    discountCode = discountCode ? String(discountCode).trim().toUpperCase().replace(/^\$/,'') : undefined;

    // Log incoming discount code for debugging
    console.log('[Wallet Order Debug] incoming discountCode:', discountCode);

    if (!Array.isArray(bodyItems) || bodyItems.length === 0)
        throw createError(400, "Không có sản phẩm để đặt hàng");

    let items = [];
    let subtotal = 0;

    // ===== 1. Validate items + tính subtotal =====
    for (const it of bodyItems) {
        if (!it.product_id) throw createError(400, "Thiếu product_id");
        if (!it.variant_id) throw createError(400, "Thiếu variant_id");
        if (!it.quantity) throw createError(400, "Thiếu quantity");

        const variant = await Variant.findById(it.variant_id);
        if (!variant)
            throw createError(404, `Biến thể không tồn tại (${it.variant_id})`);

        if (String(variant.product_id) !== String(it.product_id)) {
            throw createError(400, "Biến thể không thuộc sản phẩm này");
        }

        if (variant.quantity < it.quantity) {
            throw createError(
                400,
                `Biến thể '${variant.type}' không đủ số lượng`
            );
        }

        subtotal += variant.price * it.quantity;

        items.push({
            product_id: it.product_id,
            variant_id: it.variant_id,
            quantity: it.quantity,
        });
    }

// ===== 2. Discount (use server helper) =====
	let discountAmount = 0;
	let appliedDiscount = null;
	let appliedItems = [];
	if (discountCode) {
		const result = await computeDiscountForItems({ items, discountCode, userId });
		// sync subtotal in case helper computed differently
		subtotal = result.subtotal;
		discountAmount = result.discountAmount;
		appliedDiscount = result.appliedDiscount;
		appliedItems = result.appliedItems || [];

		console.log("[Discount Debug - Wallet] code=", discountCode, "discountAmount=", discountAmount, "appliedItems=", appliedItems);
    }

    const total = Math.max(
        0,
        subtotal + Number(shipping_fee) - discountAmount
    );

    if (wallet.balance < total) {
        throw createError(400, "Số dư không đủ. Vui lòng nạp thêm tiền");
    }


    // ===== 3. TẠO ORDER (CHƯA TRỪ KHO) =====
    const order = await Order.create({
        user_id: userId,
        items,
        subtotal,
        shipping_fee,
        discount: { code: discountCode || "", amount: discountAmount, appliedItems },
        total,
        shipping_address,
        note,
        status: "Chờ xử lý",
        payment: {
            method: "wallet",
            status: "Đã thanh toán",
        },
    });


    const updatedWallet = await Wallet.findOneAndUpdate(
        { user: userId, balance: { $gte: total } },
        { $inc: { balance: -total } },
        { new: true }
    );

    await WalletTransaction.create({
        wallet: wallet._id,
        user: userId,
        type: "Thanh toán",
        status: "Thành công",
        amount: order.total,
        description: `Thanh toán đơn hàng ${order._id}`
      });
    if (!updatedWallet) {
        throw createError(400, "Số dư không đủ");
    } 

    // If discount was applied, increment usage counter AFTER successful payment (atomic to avoid race conditions)
    if (appliedDiscount) {
        try {
            const limit = Number(appliedDiscount.totalUsageLimit);
            if (Number.isFinite(limit)) {
                const updated = await Discount.findOneAndUpdate(
                    { _id: appliedDiscount._id, usedCount: { $lt: limit } },
                    { $inc: { usedCount: 1 } },
                    { new: true }
                );
                if (!updated) {
                    console.warn('Discount limit reached during wallet payment', { code: appliedDiscount.code, limit });
                    // Rollback payment: refund wallet and mark order cancelled
                    await Wallet.findOneAndUpdate({ user: userId }, { $inc: { balance: total } });
                    await WalletTransaction.create({
                        wallet: wallet._id,
                        user: userId,
                        type: "Hoàn tiền",
                        status: "Thành công",
                        amount: total,
                        description: `Hoàn tiền do mã giảm giá '${appliedDiscount.code}' đã hết khi thanh toán đơn ${order._id}`
                    });
                    order.payment.status = 'Đã hủy';
                    order.status = 'Đã hủy';
                    await order.save();
                    return res.status(400).json({ success: false, message: 'Mã giảm giá đã đạt giới hạn sử dụng, giao dịch đã được hoàn tiền' });
                }
            } else {
                await Discount.findByIdAndUpdate(appliedDiscount._id, { $inc: { usedCount: 1 } });
            }
        } catch (err) {
            console.warn('Không thể cập nhật usedCount cho mã giảm giá sau khi thanh toán:', err.message);
        }
    }

    await wallet.save();
    for (const it of items) {
        const updated = await Variant.findOneAndUpdate(
            { _id: it.variant_id, quantity: { $gte: it.quantity } },
            { $inc: { quantity: -it.quantity } },
            { new: true }
        );
    
        if (!updated) {
            throw createError(
                400,
                `Biến thể ${it.variant_id} không đủ số lượng để trừ kho`
            );
        }
    }
    
    return res.status(201).json({
        success: true,
        message: "Đơn hàng đã tạo",
        data: order
    });
};

export const getWalletUser = async(req, res ) => {
    const userId = req.user && req.user._id;
        if (!userId) throw createError(401, "Chưa đăng nhập");
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
        // Create a wallet record with zero balance for new users
        wallet = await Wallet.create({ user: userId, balance: 0 });
    }
    return res.status(200).json({
        message: "Lấy thông tin số dư ví thành công",
        data: wallet
    });
}

export const getAllWallet = async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Wallet.find()
      .populate("user", "name email status")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Wallet.countDocuments(),
  ]);

  res.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};


export const lockWallet = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng nhập lý do khóa ví",
    });
  }

  const wallet = await Wallet.findById(id).populate("user");

  if (!wallet) {
    return res.status(404).json({
      success: false,
      message: "Không tìm thấy ví",
    });
  }

  if (wallet.status === "locked") {
    return res.json({ success: true, message: "Ví đã bị khóa trước đó" });
  }

  wallet.status = "locked";
  wallet.reasonLocked = reason;
  wallet.lockedAt = new Date();
  await wallet.save();

  // 📧 Gửi mail
  await sendWalletEmail({
    to: wallet.user.email,
    subject: "Ví của bạn đã bị khóa",
    html: `
      <h3>Ví của bạn đã bị khóa</h3>
      <p><strong>Lý do:</strong> ${reason}</p>
      <p>Nếu có thắc mắc vui lòng liên hệ để được hỗ trợ.</p>
    `,
  });

  res.json({
    success: true,
    message: "Đã khóa ví",
  });
};

export const unlockWallet = async (req, res) => {
  const { id } = req.params;

  const wallet = await Wallet.findById(id).populate("user");

  if (!wallet) {
    return res.status(404).json({
      success: false,
      message: "Không tìm thấy ví",
    });
  }

  wallet.status = "active";
  wallet.reasonLocked = null;
  wallet.lockedAt = null;
  await wallet.save();

  await sendWalletEmail({
    to: wallet.user.email,
    subject: "Ví của bạn đã được mở khóa",
    html: `
      <h3>Ví của bạn đã được mở khóa</h3>
      <p>Bạn có thể tiếp tục sử dụng ví bình thường.</p>
      <p>Nếu có thắc mắc vui lòng liên hệ để được hỗ trợ.</p>

    `,
  });

  res.json({
    success: true,
    message: "Đã mở khóa ví",
  });
};
export default {createOrderWithWallet}
