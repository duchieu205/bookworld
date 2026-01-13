import { resolveSoa } from "dns";
import Order from "../models/order.js";
import Product from "../models/Product.js";
import Variant from "../models/variant.js";
import Cart from "../models/Cart.js";
import Discount from "../models/Discount.js";
import User from "../models/User.js";

import createError from "../utils/createError.js";
import { computeDiscountForItems } from "../utils/discountUtil.js";
import { VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat } from "vnpay";
import crypto from "crypto";
import qs from "qs";
import { sendEmail, buildOrderCreatedEmail} from "../utils/sendEmail.js";


export const verifyVnPayChecksum = (query, secretKey) => {
  const params = { ...query };

  const secureHash = params.vnp_SecureHash;

  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const sortedKeys = Object.keys(params).sort();

  const signData = sortedKeys
    .map(
      (key) =>
        `${key}=${encodeURIComponent(params[key]).replace(/%20/g, "+")}`
    )
    .join("&");

  const signed = crypto
    .createHmac("sha512", secretKey)
    .update(signData)
    .digest("hex");

  return signed === secureHash;
};



// export const payToVnPay = async(req, res) => {
// 	const vnpay = new VNPay({
// 		tmnCode: "03SL7PGI",
// 		secureSecret: "9HQ2NQ3QRKYK1ACM38C5UZ0L7GMBM52Z",
// 		vnpayHost: "https://sandbox.vnpayment.vn",
// 		testMode: true,
// 		loggerFn: ignoreLogger,
// 	})
// 	const tomorrow = new Date();
// 	tomorrow.setDate(tomorrow.getDate() + 1);

// 		const vnpayResponse = await vnpay.buildPaymentUrl({
// 		vnp_Amount: 50000,
// 		vnp_IpAddr: "127.0.0.1",
// 		vnp_TxnRef: Date.now().toString(),
// 		vnp_OrderInfo: "Test payment",
// 		vnp_OrderType: "other",
// 		vnp_ReturnUrl: "https://localhost:5004/api/orders/check-payment-vnpay",
// 		vnp_Locale: "vn",
// 		vnp_CreateDate: dateFormat(new Date()),
// 		vnp_ExpireDate: dateFormat(tomorrow),
// 	});
// 	return res.status(201).json(vnpayResponse);
// }

export const createOrderWithVnPay = async (req, res) => {
	const userId = req.user && req.user._id;
	if (!userId) throw createError(401, "Chưa đăng nhập");

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
	console.log('[VnPay Order Debug] incoming discountCode:', discountCode);

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
		// result.subtotal should match our subtotal calculation above; keep using computed subtotal for safety
		subtotal = result.subtotal;
		discountAmount = result.discountAmount;
		appliedDiscount = result.appliedDiscount;
		appliedItems = result.appliedItems || [];

		console.log("[Discount Debug - VnPay] code=", discountCode, "discountAmount=", discountAmount, "appliedItems=", appliedItems);
	}

	const total = Math.max(
		0,
		subtotal + Number(shipping_fee) - discountAmount
	);

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
			method: "vnpay",
			status: "Chưa thanh toán",
		},
	});

	// NOTE: For VNPay we DO NOT increment discount.usedCount here. We'll increment it
	// in the VNPay return handler after confirming the payment to avoid consuming
	// codes for abandoned/unpaid attempts.

	const vnpay = new VNPay({
		tmnCode: process.env.VNP_TMN_CODE,
		secureSecret: process.env.VNP_HASH_SECRET,
		vnpayHost: "https://sandbox.vnpayment.vn",
		testMode: true,
		loggerFn: ignoreLogger,
	});

	// ===== 4. TẠO LINK THANH TOÁN VNPay =====
	const expire = new Date();
    expire.setMinutes(expire.getMinutes() + 5);
	
	const paymentUrl = await vnpay.buildPaymentUrl({
		vnp_Amount: order.total,
		vnp_IpAddr:"127.0.0.1",
		vnp_TxnRef: order._id.toString(),
		vnp_OrderInfo: `Thanh toan don hang ${order._id}`,
		vnp_OrderType: "billpayment",
		vnp_ReturnUrl: `http://localhost:${process.env.PORT}${process.env.VNP_RETURN_URL}`,
		// vnp_IpnUrl: process.env.VNP_IPN_URL, 
		vnp_Locale: "vn",
		vnp_BankCode: "VNBANK",
		vnp_CreateDate: dateFormat(new Date()),
		vnp_ExpireDate: dateFormat(expire),
	});

  for (const item of items) {
      if (item.variant_id) {
        await Variant.findByIdAndUpdate(item.variant_id, {
          $inc: { quantity: -item.quantity },
        });
      }
  }

  try {
      const cart = await Cart.findOne({ user_id: order.user_id });
      
      if (cart) {
        // Xóa các items đã thanh toán
        cart.items = cart.items.filter(cartItem => {
          return !order.items.some(orderItem => 
            String(cartItem.product_id) === String(orderItem.product_id) &&
            String(cartItem.variant_id) === String(orderItem.variant_id)
          );
        });
          
        await cart.save();
        console.log("✅ Đã xóa sản phẩm khỏi giỏ hàng");
      }
    } catch (cartErr) {
      console.warn("⚠️ Không thể xóa giỏ hàng:", cartErr.message);
   
  }

    if (order.discount && order.discount.code) {
      try {
        const discount = await Discount.findOne({ code: order.discount.code });
        if (discount) {
          const limit = Number(discount.totalUsageLimit);
          if (Number.isFinite(limit)) {
            const updated = await Discount.findOneAndUpdate(
              { code: order.discount.code, usedCount: { $lt: limit } },
              { $inc: { usedCount: 1 } },
              { new: true }
            );
            if (!updated) {
              // Can't consume discount because limit reached. Cancel order and notify user.
              console.warn('Discount limit reached during VNPay return', { code: order.discount.code, limit, orderId: order._id });
              order.payment.status = 'Đã hủy';
              order.status = 'Đã hủy';
              await order.save();
              return res.redirect(`${process.env.FRONTEND_URL}/order?error=discount_limit_reached`);
            }
          } else {
            await Discount.findOneAndUpdate({ code: order.discount.code }, { $inc: { usedCount: 1 } });
          }
        }
      } catch (err) {
        console.warn('Không thể cập nhật usedCount cho mã giảm giá sau khi thanh toán:', err.message);
      }
    }
  order.payment.payment_url = paymentUrl;
  await order.save();
  try {
  const user = await User.findOne({_id: userId})
     await sendEmail({
     to: user.email,
     subject: "📦 Xác nhận tạo đơn hàng tại BookWorld",
     html: buildOrderCreatedEmail({
       userName: user.name,
       orderId: order._id,
      totalAmount: `${order.total.toLocaleString("vi-VN")}₫`,
       paymentMethod: order.payment.method, 
     }),
   });
  }
    catch (err) {
        console.error("Send create order VnPay mail failed:", err);
  }
  
  console.log("VNPay paymentUrl:", paymentUrl);
	return res.status(201).json({
		success: true,
		message: "Tạo đơn hàng & link thanh toán VNPay thành công",
		orderId: order._id,
		data: {
			order,
			paymentUrl,
		},
	});
};

// export const vnpayIPN = async (req, res) => {
//   try {
//     const params = req.query;

//     // 🔴 1. VNPAY sandbox ping IPN khi mở link (KHÔNG có txnRef)
//     if (!params || !params.vnp_TxnRef) {
//       // PHẢI TRẢ 200 OK, KHÔNG LÀM GÌ
//       return res.status(200).send("RspCode=00&Message=Ignore");
//     }

//     // 2. Verify checksum
//     const isValid = verifyVnPayChecksum(
//       params,
//       process.env.VNP_HASH_SECRET
//     );

//     if (!isValid) {
//       return res.status(200).send("RspCode=97&Message=Invalid checksum");
//     }

//     const {
//       vnp_ResponseCode,
//       vnp_TxnRef,
//       vnp_TransactionNo,
//       vnp_Amount
//     } = params;

//     const order = await Order.findById(vnp_TxnRef);
//     if (!order) {
//       return res.status(200).send("RspCode=01&Message=Order not found");
//     }

//     // 3. Idempotent
//     if (order.payment.status === "Đã thanh toán") {
//       return res.status(200).send("RspCode=02&Message=Already confirmed");
//     }

//     // 4. Payment fail
//     if (vnp_ResponseCode !== "00") {
//       order.payment.status = "Thất bại";
//       await order.save();
//       return res.status(200).send("RspCode=00&Message=Payment failed");
//     }

//     // 5. Amount (*100)
//     if (order.total * 100 !== Number(vnp_Amount)) {
//       order.payment.status = "Thất bại";
//       await order.save();
//       return res.status(200).send("RspCode=04&Message=Amount mismatch");
//     }

//     // 6. Trừ kho
//     const session = await Order.startSession();
//     session.startTransaction();

//     try {
//       for (const it of order.items) {
//         const updated = await Variant.findOneAndUpdate(
//           { _id: it.variant_id, quantity: { $gte: it.quantity } },
//           { $inc: { quantity: -it.quantity } },
//           { session }
//         );

//         if (!updated) throw new Error("Out of stock");
//       }

//       order.payment.status = "Đã thanh toán";
//       order.payment.transaction_id = vnp_TransactionNo;
//       order.status = "Chờ xử lý";

//       await order.save({ session });
//       await session.commitTransaction();
//       session.endSession();

//       return res.status(200).send("RspCode=00&Message=Success");
//     } catch (err) {
//       await session.abortTransaction();
//       session.endSession();

//       order.payment.status = "Thất bại";
//       await order.save();

//       return res.status(200).send("RspCode=99&Message=Process error");
//     }

//   } catch (err) {
//     console.error("VNPay IPN fatal:", err);
//     return res.status(200).send("RspCode=99&Message=Unknown error");
//   }
// };

export const vnpayReturn = async (req, res) => {
  try {
    console.log("🔄 VNPay callback received:", req.query);
    
    const params = req.query;

    // Verify checksum
    const isValid = verifyVnPayChecksum(
      params,
      process.env.VNP_HASH_SECRET
    );

    if (!isValid) {
      console.error("❌ Checksum không hợp lệ");
      return res.redirect(`${process.env.FRONTEND_URL}/order?error=invalid_signature`);
    }

    const { 
      vnp_ResponseCode, 
      vnp_TxnRef, 
      vnp_Amount, 
      vnp_TransactionNo,
      vnp_BankCode 
    } = params;

    console.log("📋 Payment info:", {
      orderId: vnp_TxnRef,
      responseCode: vnp_ResponseCode,
      amount: vnp_Amount,
      transactionNo: vnp_TransactionNo
    });

    // Tìm order
    const order = await Order.findById(vnp_TxnRef);
    if (!order) {
      console.error("❌ Không tìm thấy đơn hàng:", vnp_TxnRef);
      return res.redirect(`${process.env.FRONTEND_URL}/order?error=order_not_found`);
    }
    if (order.status !== "Chờ xử lý") {
        return res.redirect(`${process.env.FRONTEND_URL}/order`);
    }

    if (order.payment.status !== "Chưa thanh toán") {
        return res.redirect(`${process.env.FRONTEND_URL}/order`);
    }
    if (order.payment.status === "Đã thanh toán") {
      console.log("⚠️ Đơn hàng đã được xử lý trước đó");
      return res.redirect(`${process.env.FRONTEND_URL}/order`);
    }

    // Check response code
    if (vnp_ResponseCode !== "00") {
      console.error("❌ Thanh toán thất bại - Mã lỗi:", vnp_ResponseCode);
      
      order.payment.status = "Thất bại";
      order.payment.transaction_id = vnp_TransactionNo;
      order.status = "Đã hủy";
      await order.save();
      
      return res.redirect(`${process.env.FRONTEND_URL}/order`);
    }

    // Verify amount (VNPay nhân x100)
    const expectedAmount = order.total * 100;
    const receivedAmount = Number(vnp_Amount);
    
    if (expectedAmount !== receivedAmount) {
      console.error("❌ Số tiền không khớp:", {
        expected: expectedAmount,
        received: receivedAmount,
        difference: Math.abs(expectedAmount - receivedAmount)
      });
      
      order.payment.status = "Thất bại - sai số tiền";
      order.payment.transaction_id = vnp_TransactionNo;
      order.status = "Đã hủy";
      await order.save();
      
      return res.redirect(`${process.env.FRONTEND_URL}/order`);
    }


    // CẬP NHẬT TRẠNG THÁI ĐỢN HÀNG
    order.payment.status = "Đã thanh toán";
    order.expiredAt = null;
    order.payment.transaction_id = vnp_TransactionNo;
    order.payment.bank_code = vnp_BankCode;
    order.payment.paid_at = new Date();
    order.status = "Chờ xử lý";
    order.payment.payment_url = null;
  
    
    await order.save();
    
    console.log("✅ ĐÃ CẬP NHẬT ORDER:", {
      orderId: order._id,
      paymentStatus: order.payment.status,
      orderStatus: order.status,
      transactionId: vnp_TransactionNo
    });

    // XÓA SẢN PHẨM KHỎI GIỎ HÀNG


    console.log("🎉 Thanh toán hoàn tất! Redirect về frontend...");
    return res.redirect(`${process.env.FRONTEND_URL}/order`);
    
  } catch (err) {
    console.error("❌ VNPay return fatal error:", err);
    return res.redirect(`${process.env.FRONTEND_URL}/order`);
  }
};

export default {
    createOrderWithVnPay,
    vnpayReturn
};
