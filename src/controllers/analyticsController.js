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
		status: "confirmed",
		$or: [
			{ "payment.status": "paid" },
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

	const { startDate, endDate } = req.query;

	const baseMatch = {
		status: "confirmed",
		$or: [
			{ "payment.status": "paid" },
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
	pipeline.push({
		$group: {
			_id: "$items.product_id",
			productName: { $first: "$product_info.name" },
			productImage: { $first: "$product_info.images" },
			totalQuantitySold: { $sum: "$items.quantity" },
			totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
			totalOrders: { $sum: 1 },
			averagePrice: { $avg: "$items.price" },
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
		status: "confirmed",
		$or: [
			{ "payment.status": "paid" },
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

	// Build base match (exclude createdAt)
	const baseMatch = {};
	if (status) baseMatch.status = status;

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
			byStatus: result,
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
		status: "confirmed",
		$or: [
			{ "payment.status": "paid" },
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
