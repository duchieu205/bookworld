import Order from "../models/order.js";
import Product from "../models/Product.js";
import Variant from "../models/variant.js";
import Cart from "../models/Cart.js";
import Discount from "../models/Discount.js";
import createError from "../utils/createError.js";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || "vnd";

// Create an order. If body.items is omitted, it will try to build from the user's cart.
export const createOrder = async (req, res) => {
	const userId = req.user && req.user._id;
	if (!userId) throw createError(401, "Chưa đăng nhập");

	const { items: bodyItems, shipping_address = {}, shipping_fee = 0, note = "", discountCode } = req.body;

	if (!Array.isArray(bodyItems) || bodyItems.length === 0)
		throw createError(400, "Không có sản phẩm để đặt hàng");

	// Validate items + tính giá theo biến thể
	let items = [];
	let subtotal = 0;

	for (const it of bodyItems) {

		if (!it.product_id) throw createError(400, "Thiếu product_id");
		if (!it.variant_id) throw createError(400, "Thiếu variant_id");
		if (!it.quantity) throw createError(400, "Thiếu quantity");

		const variant = await Variant.findById(it.variant_id);
		if (!variant) throw createError(404, `Biến thể không tồn tại (${it.variant_id})`);

		if (String(variant.product_id) !== String(it.product_id)) {
			throw createError(400, "Biến thể không thuộc sản phẩm này");
}
		if (variant.quantity < it.quantity) {
			throw createError(400, `Biến thể '${variant.type}' không đủ số lượng`);
		}

		subtotal += variant.price * it.quantity;

		items.push({
			product_id: it.product_id,
			variant_id: it.variant_id,
			quantity: it.quantity
		});
	}

	// Discount
	let discountAmount = 0;
	if (discountCode) {
		for (const it of items) {
			const variant = await Variant.findById(it.variant_id);
			const d = await Discount.findOne({
				code: discountCode,
				productID: String(it.product_id),
				status: "active"
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

	const total = Math.max(0, subtotal + Number(shipping_fee) - discountAmount);

	// Tạo order
	const order = await Order.create({
		user_id: userId,
		items,
		subtotal,
		shipping_fee,
		discount: { code: discountCode || "", amount: discountAmount },
		total,
		shipping_address,
		note,
		status: "pending",
		payment: {
			method: req.body.payment?.method || "cod",
			status: req.body.payment?.status || "pending"
		}
	});

	// Trừ kho biến thể
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

export const getOrderById = async (req, res) => {
	const { id } = req.params;
	const order = await Order.findById(id).populate("user_id", "name email").populate("items.product_id", "name price");
	if (!order) throw createError(404, "Không tìm thấy đơn hàng");

	
	const userId = req.user && req.user._id;
	const isAdmin = req.user && req.user.role === "admin";
	
	if (!req.user || (String(order.user_id._id) !== String(userId) && !isAdmin)) {
		throw createError(403, "Không có quyền truy cập đơn hàng này");
	}

	return res.status(200).json({ 
		success: true, 
		message: "Chi tiết đơn hàng", 
		data: order 
	});
};

export const getUserOrders = async (req, res) => {
	
	const userId = req.user && req.user._id;
	if (!userId) throw createError(401, "Chưa đăng nhập");

	const { page = 1, limit = 20, status } = req.query;
	const q = { user_id: userId };
	if (status) q.status = status;
	const pg = Math.max(1, parseInt(page, 10));
	const lim = Math.max(1, parseInt(limit, 10));

	const total = await Order.countDocuments(q);
	const items = await Order.find(q)
		.skip((pg - 1) * lim)
		.limit(lim)
		.sort({ createdAt: -1 })
		.populate("items.product_id", "name price images")
		.populate("items.variant_id");

	return res.status(200).json({ 
		success: true, 
		message: "Danh sách đơn hàng của người dùng", 
		data: items // Trả về mảng items thay vì object
	});
};

export const getAllOrders = async (req, res) => {
	// Kiểm tra role
	const isAdmin = req.user && req.user.role === "admin";
	if (!isAdmin) throw createError(403, "Chỉ admin mới thực hiện được thao tác này");

	const { page = 1, limit = 20, status, q: search } = req.query;
	const query = {};
	if (status) query.status = status;
	if (search) query.$text = { $search: search };

	const pg = Math.max(1, parseInt(page, 10));
	const lim = Math.max(1, parseInt(limit, 10));

	const total = await Order.countDocuments(query);
	const items = await Order.find(query).skip((pg - 1) * lim).limit(lim).sort({ createdAt: -1 });

	return res.status(200).json({ 
		success: true, 
		message: "Danh sách đơn hàng (admin)", 
		data: { items, total, page: pg, limit: lim }
	});
};
export const updateOrderStatus = async (req, res) => {
	const { id } = req.params;
	const { status } = req.body;
	if (!status) throw createError(400, "Thiếu trạng thái mới");

	const order = await Order.findById(id);
	if (!order) throw createError(404, "Đơn hàng không tồn tại");

	// Kiểm tra role
	const isAdmin = req.user && req.user.role === "admin";
	if (!isAdmin) throw createError(403, "Chỉ admin mới thay đổi trạng thái đơn hàng");

	order.status = status;
	await order.save();

	return res.status(200).json({ 
		success: true, 
		message: "Cập nhật trạng thái đơn hàng", 
		data: order 
	});
};

export const cancelOrder = async (req, res) => {
	const { id } = req.params;
	const order = await Order.findById(id);
	if (!order) throw createError(404, "Đơn hàng không tồn tại");

	// Lấy userId từ req.user._id
	const userId = req.user && req.user._id;
	const isAdmin = req.user && req.user.role === "admin";
	
	// owner can cancel only if pending, otherwise admin can cancel
	if (String(order.user_id) === String(userId)) {
		if (order.status !== "pending") throw createError(400, "Không thể huỷ đơn ở trạng thái hiện tại");
	} else if (!isAdmin) {
		throw createError(403, "Không có quyền huỷ đơn hàng này");
	}

	order.status = "cancelled";
	await order.save();

	// restore stock
	for (const it of order.items) {
		await Product.findByIdAndUpdate(it.product_id, { $inc: { quantity: it.quantity } });
	}

	return res.status(200).json({ 
		success: true, 
		message: "Đơn hàng đã huỷ", 
		data: order 
	});
};

export const payOrder = async (req, res) => {
	const { id } = req.params;
	// Lấy userId từ req.user._id
	const userId = req.user && req.user._id;
	const isAdmin = req.user && req.user.role === "admin";
	
	if (!userId) throw createError(401, "Chưa đăng nhập");

	const order = await Order.findById(id);
	if (!order) throw createError(404, "Order không tồn tại");
	if (String(order.user_id) !== String(userId) && !isAdmin) {
		throw createError(403, "Không có quyền thanh toán đơn này");
	}
	if (order.status !== "pending") throw createError(400, "Chỉ được thanh toán đơn hàng ở trạng thái pending");

	if (!stripe) throw createError(500, "Stripe chưa cấu hình trên server");

	// Build line items for Stripe Checkout. Note: unit_amount must be an integer.
	const line_items = order.items.map((it) => ({
		price_data: {
			currency: STRIPE_CURRENCY,
			product_data: { name: it.name || "Item" },
			unit_amount: Math.round(Number(it.price || 0)),
		},
		quantity: Number(it.quantity || 1),
	}));

	const session = await stripe.checkout.sessions.create({
		payment_method_types: ["card"],
		line_items,
		mode: "payment",
		success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/payment-cancel`,
		metadata: { orderId: order._id.toString() },
	});
order.payment.method = "stripe";
	order.payment.transaction_id = session.id;
	await order.save();

	return res.status(200).json({ 
		success: true, 
		message: "Checkout session created", 
		data: { url: session.url, sessionId: session.id }
	});
};

export const paymentWebhook = async (req, res) => {
	// If Stripe is configured and a webhook secret provided, try to verify signature
	const sig = req.headers && (req.headers["stripe-signature"] || req.headers["Stripe-Signature"]);
	if (stripe && STRIPE_WEBHOOK_SECRET && sig) {
		let event;
		try {
			const payload = Buffer.from(JSON.stringify(req.body));
			event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
		} catch (err) {
			return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
		}

		if (event.type === "checkout.session.completed") {
			const session = event.data.object;
			const orderId = session.metadata && session.metadata.orderId;
			if (!orderId) return res.status(200).json({ success: true, message: "No order metadata" });
			
			const order = await Order.findById(orderId);
			if (!order) return res.status(200).json({ success: true, message: "Order not found" });
			if (order.payment.status === "paid") return res.status(200).json({ success: true, message: "Already paid" });

			order.payment.status = "paid";
			order.payment.transaction_id = session.payment_intent || session.id;
			order.status = "confirmed";
			await order.save();

			return res.status(200).json({ success: true, message: "Stripe payment processed", data: order });
		}

		return res.status(200).json({ success: true, message: "Event received" });
	}

	// Fallback: simple stub for non-Stripe providers or manual calls
	const { orderId, status, transaction_id } = req.body;
	if (!orderId) throw createError(400, "Thiếu orderId");

	const order = await Order.findById(orderId);
	if (!order) throw createError(404, "Order không tồn tại");

	order.payment.status = status || order.payment.status;
	if (transaction_id) order.payment.transaction_id = transaction_id;
	if (status === "paid") order.status = "confirmed";
	await order.save();

	return res.status(200).json({ success: true, message: "Webhook xử lý xong", data: order });
};

export default {
	createOrder,
	getOrderById,
	getUserOrders,
	getAllOrders,
	updateOrderStatus,
	cancelOrder,
	payOrder,
	paymentWebhook,
};