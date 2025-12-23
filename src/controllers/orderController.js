import Order from "../models/order.js";
import Product from "../models/Product.js";
import Variant from "../models/variant.js";
import Cart from "../models/Cart.js";
import Discount from "../models/Discount.js";
import createError from "../utils/createError.js";




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
		status: "Chờ xử lý",
		payment: {
			method: req.body.payment?.method || "cod",
			status: req.body.payment?.status || "Chờ thanh toán"
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
		if (order.status !== "Chờ xử lý") throw createError(400, "Không thể huỷ đơn ở trạng thái hiện tại");
	} else if (!isAdmin) {
		throw createError(403, "Không có quyền huỷ đơn hàng này");
	}

	order.status = "Đã hủy";
	order.payment.status = "Đã hủy";
	order.note = req.body.note;
	await order.save();

	// restore stock
	for (const item of order.items) {
    if (item.variant_id) {
      await Variant.findByIdAndUpdate(
        item.variant_id,
        { $inc: { quantity: item.quantity } }
      );
    } else {
      await Product.findByIdAndUpdate(
        item.product_id,
        { $inc: { quantity: item.quantity } }
      );
    }
  }

	return res.status(200).json({ 
		success: true, 
		message: "Đơn hàng đã huỷ", 
		data: order 
	});
};



export default {
	createOrder,
	getOrderById,
	getUserOrders,
	getAllOrders,
	updateOrderStatus,
	cancelOrder
};
