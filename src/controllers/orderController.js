import Order from "../models/order.js";
import Product from "../models/Product.js";
import Cart from "../models/Cart.js";
import Discount from "../models/Discount.js";
import createError from "../utils/createError.js";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || "vnd";

// Create an order. If body.items is omitted, it will try to build from the user's cart.
export const createOrder = async (req, res) => {
	const userId = req.user && req.user.userId;
	if (!userId) throw createError(401, "Chưa đăng nhập");

	const { items: bodyItems, shipping_address = {}, shipping_fee = 0, note = "", discountCode } = req.body;

	// Build items: prefer supplied items, otherwise use cart
	let items = [];
	if (Array.isArray(bodyItems) && bodyItems.length > 0) {
		items = bodyItems.map((it) => ({
			product_id: it.product_id,
			variant_id: it.variant_id,
			name: it.name,
			price: Number(it.price || 0),
			quantity: Number(it.quantity || 1),
		}));
	} else {
		const cart = await Cart.findOne({ user_id: userId }).populate("items.product_id");
		if (!cart || !cart.items || cart.items.length === 0) throw createError(400, "Giỏ hàng trống");
		items = await Promise.all(
			cart.items.map(async (it) => {
				const prod = await Product.findById(it.product_id);
				return {
					product_id: it.product_id,
					variant_id: it.variant_id,
					name: prod ? prod.name : "",
					price: prod ? prod.price : 0,
					quantity: it.quantity,
				};
			})
		);
	}

	if (!items || items.length === 0) throw createError(400, "Không có sản phẩm để đặt hàng");

	// Validate inventory and compute subtotal
	let subtotal = 0;
	for (const it of items) {
		const prod = await Product.findById(it.product_id);
		if (!prod) throw createError(404, `Sản phẩm không tồn tại: ${it.product_id}`);
		if (typeof prod.quantity === "number" && prod.quantity < it.quantity) throw createError(400, `Sản phẩm '${prod.name}' không đủ số lượng`);
		subtotal += Number(it.price || prod.price || 0) * Number(it.quantity || 0);
	}

	// Apply discount if provided (simple per-product discount lookup by code)
	let discountAmount = 0;
	if (discountCode) {
		// try match discounts for items
		for (const it of items) {
			const d = await Discount.findOne({ code: discountCode, productID: String(it.product_id), status: "active" });
			if (d) {
				const val = Number(d.discount_value || 0);
				if (d.discount_type === "%") {
					discountAmount += (it.price * it.quantity) * (val / 100);
				} else {
					discountAmount += val;
				}
			}
		}
	}

	const total = Math.max(0, subtotal + Number(shipping_fee || 0) - discountAmount);

	const order = await Order.create({
		user_id: userId,
		items,
		subtotal,
		shipping_fee: Number(shipping_fee || 0),
		discount: { code: discountCode, amount: discountAmount },
		total,
		shipping_address,
		note,
	});

	// decrement product stocks
	for (const it of items) {
		await Product.findByIdAndUpdate(it.product_id, { $inc: { quantity: -Math.max(0, it.quantity) } });
	}

	// Optionally clear cart if we built from cart
	if (!Array.isArray(bodyItems) || bodyItems.length === 0) {
		await Cart.findOneAndDelete({ user_id: userId });
	}

	return res.success(order, "Đơn hàng đã tạo", 201);
};

export const getOrderById = async (req, res) => {
	const { id } = req.params;
	const order = await Order.findById(id).populate("user_id", "name email").populate("items.product_id", "name price");
	if (!order) throw createError(404, "Không tìm thấy đơn hàng");

	// allow owner or admin
	const userId = req.user && req.user.userId;
	if (!req.user || (String(order.user_id._id) !== String(userId) && !req.user.isAdmin)) throw createError(403, "Không có quyền truy cập đơn hàng này");

	return res.success(order, "Chi tiết đơn hàng", 200);
};

export const getUserOrders = async (req, res) => {
	const userId = req.user && req.user.userId;
	if (!userId) throw createError(401, "Chưa đăng nhập");

	const { page = 1, limit = 20, status } = req.query;
	const q = { user_id: userId };
	if (status) q.status = status;
	const pg = Math.max(1, parseInt(page, 10));
	const lim = Math.max(1, parseInt(limit, 10));

	const total = await Order.countDocuments(q);
	const items = await Order.find(q).skip((pg - 1) * lim).limit(lim).sort({ createdAt: -1 });

	return res.success({ items, total, page: pg, limit: lim }, "Danh sách đơn hàng của người dùng", 200);
};

export const getAllOrders = async (req, res) => {
	if (!req.user || !req.user.isAdmin) throw createError(403, "Chỉ admin mới thực hiện được thao tác này");

	const { page = 1, limit = 20, status, q: search } = req.query;
	const query = {};
	if (status) query.status = status;
	if (search) query.$text = { $search: search };

	const pg = Math.max(1, parseInt(page, 10));
	const lim = Math.max(1, parseInt(limit, 10));

	const total = await Order.countDocuments(query);
	const items = await Order.find(query).skip((pg - 1) * lim).limit(lim).sort({ createdAt: -1 });

	return res.success({ items, total, page: pg, limit: lim }, "Danh sách đơn hàng (admin)", 200);
};

export const updateOrderStatus = async (req, res) => {
	const { id } = req.params;
	const { status } = req.body;
	if (!status) throw createError(400, "Thiếu trạng thái mới");

	const order = await Order.findById(id);
	if (!order) throw createError(404, "Đơn hàng không tồn tại");

	// only admin can change status (except owner cancelling pending)
	if (!req.user || !req.user.isAdmin) throw createError(403, "Chỉ admin mới thay đổi trạng thái đơn hàng");

	order.status = status;
	await order.save();

	return res.success(order, "Cập nhật trạng thái đơn hàng", 200);
};

export const cancelOrder = async (req, res) => {
	const { id } = req.params;
	const order = await Order.findById(id);
	if (!order) throw createError(404, "Đơn hàng không tồn tại");

	const userId = req.user && req.user.userId;
	// owner can cancel only if pending, otherwise admin can cancel
	if (String(order.user_id) === String(userId)) {
		if (order.status !== "pending") throw createError(400, "Không thể huỷ đơn ở trạng thái hiện tại");
	} else if (!req.user || !req.user.isAdmin) {
		throw createError(403, "Không có quyền huỷ đơn hàng này");
	}

	order.status = "cancelled";
	await order.save();

	// restore stock
	for (const it of order.items) {
		await Product.findByIdAndUpdate(it.product_id, { $inc: { quantity: it.quantity } });
	}

	return res.success(order, "Đơn hàng đã huỷ", 200);
};

export const payOrder = async (req, res) => {
	const { id } = req.params;
	const userId = req.user && req.user.userId;
	if (!userId) throw createError(401, "Chưa đăng nhập");

	const order = await Order.findById(id);
	if (!order) throw createError(404, "Order không tồn tại");
	if (String(order.user_id) !== String(userId) && !req.user.isAdmin) throw createError(403, "Không có quyền thanh toán đơn này");
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

	return res.success({ url: session.url, sessionId: session.id }, "Checkout session created", 200);
};

// Create a Momo payment and return a payment URL
// (removed Momo and ZaloPay helpers - reverted to original state)
export const paymentWebhook = async (req, res) => {
	// If Stripe is configured and a webhook secret provided, try to verify signature
	const sig = req.headers && (req.headers["stripe-signature"] || req.headers["Stripe-Signature"]);
	if (stripe && STRIPE_WEBHOOK_SECRET && sig) {
		let event;
		try {
			// constructEvent expects the exact raw body bytes used to compute signature.
			// Many setups expose the raw body; if not available, we attempt to recreate from JSON.
			const payload = Buffer.from(JSON.stringify(req.body));
			event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
		} catch (err) {
			return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
		}

		// Handle checkout.session.completed
		if (event.type === "checkout.session.completed") {
			const session = event.data.object;
			const orderId = session.metadata && session.metadata.orderId;
			if (!orderId) return res.success({}, "No order metadata", 200);
			const order = await Order.findById(orderId);
			if (!order) return res.success({}, "Order not found", 200);
			if (order.payment.status === "paid") return res.success(order, "Already paid", 200);

			order.payment.status = "paid";
			order.payment.transaction_id = session.payment_intent || session.id;
			order.status = "confirmed";
			await order.save();

			return res.success(order, "Stripe payment processed", 200);
		}

		// Other Stripe events can be handled here
		return res.success({}, "Event received", 200);
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

	return res.success(order, "Webhook xử lý xong", 200);
};

export default {
	createOrder,
	getOrderById,
	getUserOrders,
	getAllOrders,
	updateOrderStatus,
	cancelOrder,
	paymentWebhook,
};
