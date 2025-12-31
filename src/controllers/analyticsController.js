import Order from "../models/order.js";
import Product from "../models/Product.js";
import createError from "../utils/createError.js";

const dateConversion = {
	$addFields: {
		createdAtDate: {
			$cond: [
				{ $eq: [{ $type: "$createdAt" }, "date"] },
				"$createdAt",
				{
					$cond: [
						{ $eq: [{ $type: "$createdAt" }, "string"] },
						{ $convert: { input: "$createdAt", to: "date", onError: null, onNull: null } },
						"$createdAt"
					]
				}
			]
		}
	}
};

/**
 * Get total revenue with optional date range filter
 * Query params: startDate (ISO string), endDate (ISO string)
 * Example: /api/analytics/revenue?startDatcoe=2024-01-01&endDate=2024-12-31
 */
export const getTotalRevenue = async (req, res) => {
	if (!req.user || req.user.role !== "admin") throw createError(403, "Chỉ admin mới xem thống kê");

	const { startDate, endDate } = req.query;

	// Base match (DO NOT put createdAt here — we'll match on converted createdAtDate)
	const baseMatch = {
		// Accept both English and Vietnamese status variants that imply a confirmed/completed order
		status: { $in: ["Đã xác nhận", "Giao hàng thành công", "Hoàn tất", "confirmed"] },
		$or: [
			{ "payment.status": { $in: ["paid", "Đã thanh toán"] } },
			{ "payment.status": { $exists: false } },
			{ payment: { $exists: false } },
		],
	};

	const pipeline = [dateConversion, { $match: baseMatch }];
	if (startDate || endDate) {
		const dateMatch = {};
		if (startDate) dateMatch.$gte = new Date(startDate);
		if (endDate) {
			const end = new Date(endDate);
			end.setDate(end.getDate() + 1);
			dateMatch.$lt = end;
		}
		pipeline.push({ $match: { createdAtDate: dateMatch } });
	}

	if (process.env.NODE_ENV === "development") console.log("Analytics getTotalRevenue pipeline:", JSON.stringify(pipeline));

	pipeline.push({
		$group: {
			_id: null,
			totalRevenue: { $sum: { $ifNull: ["$total", "$totalPrice", 0] } },
			totalOrders: { $sum: 1 },
			totalSubtotal: { $sum: { $ifNull: ["$subtotal", 0] } },
			totalShippingFee: { $sum: { $ifNull: ["$shipping_fee", "$shippingFee", 0] } },
			totalDiscount: { $sum: { $ifNull: ["$discount.amount", "$discount", 0] } },
		},
	});

	const result = await Order.aggregate(pipeline);

	const data = result[0] || {
		totalRevenue: 0,
		totalOrders: 0,
		totalSubtotal: 0,
		totalShippingFee: 0,
		totalDiscount: 0,
	};

	return res.success(data, "Thống kê doanh thu tổng", 200);
};

/**
 * Get revenue by product with optional date range filter
 * Query params: startDate (ISO string), endDate (ISO string)
 * Example: /api/analytics/revenue-by-product?startDate=2024-01-01&endDate=2024-12-31
 */
export const getRevenueByProduct = async (req, res) => {
	if (!req.user || req.user.role !== "admin") throw createError(403, "Chỉ admin mới xem thống kê");

	const { startDate, endDate, product } = req.query; // product can be id or name

	const baseMatch = {
		// Accept both English and Vietnamese status variants that imply a confirmed/completed order
		status: { $in: ["Đã xác nhận", "Giao hàng thành công", "Hoàn tất", "confirmed"] },
		$or: [
			{ "payment.status": { $in: ["paid", "Đã thanh toán"] } },
			{ "payment.status": { $exists: false } },
			{ payment: { $exists: false } },
		],
	};

	const pipeline = [dateConversion, { $match: baseMatch }];
	if (startDate || endDate) {
		const dateMatch = {};
		if (startDate) dateMatch.$gte = new Date(startDate);
		if (endDate) {
			const end = new Date(endDate);
			end.setDate(end.getDate() + 1);
			dateMatch.$lt = end;
		}
		pipeline.push({ $match: { createdAtDate: dateMatch } });
	}

	if (process.env.NODE_ENV === "development") console.log("Analytics getRevenueByProduct pipeline:", JSON.stringify(pipeline));

	pipeline.push({ $unwind: "$items" });
	pipeline.push({
		$lookup: {
			from: "products",
			localField: "items.product_id",
			foreignField: "_id",
			as: "product_info",
		},
	});
	pipeline.push({ $unwind: { path: "$product_info", preserveNullAndEmptyArrays: true } });

	// Also lookup variant info so we can fallback to variant prices/names when product is missing
	pipeline.push({
		$lookup: {
			from: "variants",
			localField: "items.variant_id",
			foreignField: "_id",
			as: "variant_info",
		},
	});
	pipeline.push({ $unwind: { path: "$variant_info", preserveNullAndEmptyArrays: true } });

	// Add product filter when provided (accept id or name). Ignore string 'undefined'/'null' from front-end.
	if (product && product !== "undefined" && product !== "null") {
		const prodMatch = {
			$or: [
				{ $expr: { $eq: [{ $toString: "$items.product_id" }, product] } },
				{ $expr: { $eq: [{ $toString: "$items.variant_id" }, product] } },
				{ "product_info.name": { $regex: product, $options: "i" } },
				{ "variant_info.name": { $regex: product, $options: "i" } },
			],
		};
		pipeline.push({ $match: prodMatch });
	}

	pipeline.push({
		$group: {
			_id: { $ifNull: ["$items.product_id", "$items.variant_id"] },
			productName: { $first: { $ifNull: ["$product_info.name", "$variant_info.name", "Không rõ"] } },
			productImage: { $first: { $ifNull: ["$product_info.images", []] } },
			totalQuantitySold: { $sum: { $ifNull: ["$items.quantity", 0] } },
			totalRevenue: { $sum: { $multiply: [ { $ifNull: ["$items.price", "$variant_info.price", "$product_info.price", 0] }, { $ifNull: ["$items.quantity", 0] } ] } },
			totalOrders: { $sum: 1 },
			averagePrice: { $avg: { $ifNull: ["$items.price", "$variant_info.price", "$product_info.price", 0] } },
		},
	});
	pipeline.push({ $sort: { totalRevenue: -1 } });

	const result = await Order.aggregate(pipeline);

	return res.success(result, "Thống kê doanh thu theo sản phẩm", 200);
};

/**
 * Get daily revenue breakdown with optional date range filter
 * Query params: startDate (ISO string), endDate (ISO string)
 */
export const getDailyRevenue = async (req, res) => {
	if (!req.user || req.user.role !== "admin") throw createError(403, "Chỉ admin mới xem thống kê");

	const { startDate, endDate } = req.query;

	// Build match filter for date range and accept legacy/missing payment
	const matchFilter = {
		// Accept VN/EN statuses that should be counted in daily revenue
		status: { $in: ["Đã xác nhận", "Giao hàng thành công", "Hoàn tất", "confirmed"] },
		$or: [
			{ "payment.status": { $in: ["paid", "Đã thanh toán"] } },
			{ "payment.status": { $exists: false } },
			{ payment: { $exists: false } },
		],
	};
	if (startDate || endDate) {
		matchFilter.createdAt = {};
		if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
		if (endDate) {
			const end = new Date(endDate);
			end.setDate(end.getDate() + 1);
			matchFilter.createdAt.$lt = end;
		}
	}

	if (process.env.NODE_ENV === "development") console.log("Analytics getDailyRevenue matchFilter:", matchFilter);

	const result = await Order.aggregate([dateConversion, { $match: matchFilter },
		{ $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
		{
			$group: {
				_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAtDate" } },
				totalRevenue: {
					$sum: {
						$ifNull: [ { $multiply: ["$items.price", "$items.quantity"] }, "$total", "$totalPrice", 0 ]
					},
				},
				ordersSet: { $addToSet: "$_id" },
				totalQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
			},
		},
		{ $project: { totalRevenue: 1, totalQuantity: 1, totalOrders: { $size: "$ordersSet" } } },
		{ $sort: { _id: 1 } },
	]);

	return res.success(result, "Thống kê doanh thu theo ngày", 200);
};

/**
 * Get order statistics with optional date range filter
 * Query params: startDate (ISO string), endDate (ISO string), status (pending|confirmed|cancelled|etc)
 */
export const getOrderStats = async (req, res) => {
	if (!req.user || req.user.role !== "admin") throw createError(403, "Chỉ admin mới xem thống kê");

	const { startDate, endDate, status } = req.query;

	// Allow English status query (normalize to stored Vietnamese status when possible)
	const engToVn = {
		pending: "Chờ xử lý",
		confirmed: "Đã xác nhận",
		cancelled: "Đã hủy",
		canceled: "Đã hủy",
		completed: "Hoàn tất",
		shipped: "Đang giao hàng",
		returned: "Trả hàng/Hoàn tiền",
		paid: "Đã thanh toán",
		unpaid: "Chưa thanh toán",
	};

	// Translation table for results (supports both English keys and existing Vietnamese values)
	const statusTranslations = {
		pending: "Chờ xử lý",
		confirmed: "Đã xác nhận",
		cancelled: "Đã hủy",
		canceled: "Đã hủy",
		completed: "Hoàn tất",
		shipped: "Đang giao hàng",
		returned: "Trả hàng/Hoàn tiền",
		paid: "Đã thanh toán",
		unpaid: "Chưa thanh toán",
		"Chưa thanh toán": "Chưa thanh toán",
		"Chờ xử lý": "Chờ xử lý",
		"Đã xác nhận": "Đã xác nhận",
		"Đã hủy": "Đã hủy",
		"Hoàn tất": "Hoàn tất",
		"Đang giao hàng": "Đang giao hàng",
		"Đã thanh toán": "Đã thanh toán",
		"Trả hàng/Hoàn tiền": "Trả hàng/Hoàn tiền",
	};

	// Build base match (exclude createdAt)
	const baseMatch = {};
	if (status) {
		const normalized = status.toLowerCase();
		baseMatch.status = engToVn[normalized] || status;
	}

	const statsPipeline = [dateConversion, { $match: baseMatch }];
	if (startDate || endDate) {
		const dateMatch = {};
		if (startDate) dateMatch.$gte = new Date(startDate);
		if (endDate) {
			const end = new Date(endDate);
			end.setDate(end.getDate() + 1);
			dateMatch.$lt = end;
		}
		statsPipeline.push({ $match: { createdAtDate: dateMatch } });
	}

	statsPipeline.push({
		$group: {
			_id: "$status",
			count: { $sum: 1 },
			totalAmount: { $sum: { $ifNull: ["$total", "$totalPrice", 0] } },
		},
	});
	statsPipeline.push({ $sort: { count: -1 } });

	const result = await Order.aggregate(statsPipeline);

	// Map status values to Vietnamese labels for the response
	const formatted = result.map((r) => {
		const raw = r._id;
		if (!raw) return { status: raw, statusLabel: raw, count: r.count, totalAmount: r.totalAmount };
		const key = typeof raw === "string" ? raw : raw.toString();
		const lookup = statusTranslations[key] || statusTranslations[key.toLowerCase()] || key;
		return { status: key, statusLabel: lookup, count: r.count, totalAmount: r.totalAmount };
	});

	// count overall with the same date conversion
	const countPipeline = [dateConversion, { $match: baseMatch }];
	if (startDate || endDate) {
		const dateMatch = {};
		if (startDate) dateMatch.$gte = new Date(startDate);
		if (endDate) {
			const end = new Date(endDate);
			end.setDate(end.getDate() + 1);
			dateMatch.$lt = end;
		}
		countPipeline.push({ $match: { createdAtDate: dateMatch } });
	}
	countPipeline.push({ $count: "total" });
	const countRes = await Order.aggregate(countPipeline);
	const total = (countRes[0] && countRes[0].total) || 0;

	return res.success(
		{
			byStatus: formatted,
			totalOrders: total,
			dateRange: {
				start: startDate || "N/A",
				end: endDate || "N/A",
			},
		},
		"Thống kê đơn hàng",
		200
	);
};

/**
 * Get customer insights (top customers by spending)
 * Query params: startDate, endDate, limit (default 10)
 */
export const getTopCustomers = async (req, res) => {
	if (!req.user || req.user.role !== "admin") throw createError(403, "Chỉ admin mới xem thống kê");

	const { startDate, endDate, limit = 10 } = req.query;

	const baseMatch = {
		// Accept both English and Vietnamese status variants that imply a confirmed/completed order
		status: { $in: ["Đã xác nhận", "Giao hàng thành công", "Hoàn tất", "confirmed"] },
		$or: [
			{ "payment.status": { $in: ["paid", "Đã thanh toán"] } },
			{ "payment.status": { $exists: false } },
			{ payment: { $exists: false } },
		],
	};

	const pipeline = [dateConversion, { $match: baseMatch }];
	if (startDate || endDate) {
		const dateMatch = {};
		if (startDate) dateMatch.$gte = new Date(startDate);
		if (endDate) {
			const end = new Date(endDate);
			end.setDate(end.getDate() + 1);
			dateMatch.$lt = end;
		}
		pipeline.push({ $match: { createdAtDate: dateMatch } });
	}

	if (process.env.NODE_ENV === "development") console.log("Analytics getTopCustomers pipeline:", JSON.stringify(pipeline));

	pipeline.push({
		$lookup: {
			from: "users",
			localField: "user_id",
			foreignField: "_id",
			as: "user_info",
		},
	});
	pipeline.push({ $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } });
	pipeline.push({
		$group: {
			_id: "$user_id",
			userName: { $first: "$user_info.name" },
			userEmail: { $first: "$user_info.email" },
			totalSpent: { $sum: { $ifNull: ["$total", "$totalPrice", 0] } },
			totalOrders: { $sum: 1 },
			averageOrderValue: { $avg: { $ifNull: ["$total", "$totalPrice", 0] } },
		},
	});
	pipeline.push({ $sort: { totalSpent: -1 } });
	pipeline.push({ $limit: parseInt(limit, 10) || 10 });

	const result = await Order.aggregate(pipeline);

	return res.success(result, "Top khách hàng theo chi tiêu", 200);
};

export default {
	getTotalRevenue,
	getRevenueByProduct,
	getDailyRevenue,
	getOrderStats,
	getTopCustomers,
};
