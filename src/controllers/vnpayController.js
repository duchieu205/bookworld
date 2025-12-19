import { resolveSoa } from "dns";
import Order from "../models/order.js";
import Product from "../models/Product.js";
import Variant from "../models/variant.js";
import Cart from "../models/Cart.js";
import Discount from "../models/Discount.js";
import createError from "../utils/createError.js";
import { VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat } from "vnpay";
import crypto from "crypto";
import qs from "qs";


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

	const {
		items: bodyItems,
		shipping_address = {},
		shipping_fee = 0,
		note = "",
		discountCode,
	} = req.body;

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

	// ===== 2. Discount =====
	let discountAmount = 0;
	if (discountCode) {
		for (const it of items) {
			const variant = await Variant.findById(it.variant_id);
			const d = await Discount.findOne({
				code: discountCode,
				productID: String(it.product_id),
				status: "active",
			});

			if (d) {
				const price = variant.price * it.quantity;
				if (d.discount_type === "%") {
					discountAmount += price * (Number(d.discount_value) / 100);
				} else {
					discountAmount += Number(d.discount_value);
				}
			}
		}
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
		discount: { code: discountCode || "", amount: discountAmount },
		total,
		shipping_address,
		note,
		status: "Chờ xử lý",
		payment: {
			method: "vnpay",
			status: "Chưa thanh toán",
		},
	});
	const vnpay = new VNPay({
		tmnCode: process.env.VNP_TMN_CODE,
		secureSecret: process.env.VNP_HASH_SECRET,
		vnpayHost: "https://sandbox.vnpayment.vn",
		testMode: true,
		loggerFn: ignoreLogger,
	});

	// ===== 4. TẠO LINK THANH TOÁN VNPay =====
	const expire = new Date();
    expire.setMinutes(expire.getMinutes() + 15);
	
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
    const params = req.query;

    const isValid = verifyVnPayChecksum(
      params,
      process.env.VNP_HASH_SECRET
    );

    if (!isValid) {
      return res.status(400).send("Checksum không hợp lệ");
    }

    const { vnp_ResponseCode, vnp_TxnRef, vnp_Amount } = params;

    const order = await Order.findById(vnp_TxnRef);
    if (!order) {
      return res.status(404).send("Không tìm thấy đơn hàng");
    }

    // Đã xử lý rồi
    if (order.payment.status === "Đã thanh toán") {
      return res.redirect(`${process.env.FRONTEND_URL}/orders`);
    }

    // Thanh toán thất bại
    if (vnp_ResponseCode !== "00") {
      order.payment.status = "Thất bại";
      await order.save();
      return res.redirect(`${process.env.FRONTEND_URL}/orders`);
    }

    // Check amount (×100)
    if (order.total * 100 !== Number(vnp_Amount)) {
      order.payment.status = "Thất bại - sai số tiền";
      await order.save();
      return res.redirect(`${process.env.FRONTEND_URL}/orders`);
    }

    // Trừ kho (không transaction)
    for (const it of order.items) {
      const updated = await Variant.findOneAndUpdate(
        { _id: it.variant_id, quantity: { $gte: it.quantity } },
        { $inc: { quantity: -it.quantity } }
      );

      if (!updated) {
        order.payment.status = "Thất bại - hết hàng";
        await order.save();
        return res.redirect(`${process.env.FRONTEND_URL}/orders`);
      }
    }

    // Thành công
    order.payment.status = "Đã thanh toán";
    order.status = "Chờ xử lý";
    await order.save();

    return res.redirect(`${process.env.FRONTEND_URL}/orders`);
  } catch (err) {
    console.error("VNPay return error:", err);
    return res.status(500).send("Server error");
  }
};



export default {
    createOrderWithVnPay,
    vnpayReturn
};
