import Order from "../models/order.js";
import Product from "../models/Product.js";
import createError from "../utils/createError.js";

/**
 * Get total revenue with optional date range filter
 * Query params: startDate (ISO string), endDate (ISO string)
 * Example: /api/analytics/revenue?startDate=2024-01-01&endDate=2024-12-31
 */
export const getTotalRevenue = async (req, res) => {
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

	if (process.env.NODE_ENV === "development") console.log("Analytics getTotalRevenue matchFilter:", matchFilter);

	const result = await Order.aggregate([
		{ $match: matchFilter },
		{
			$group: {
				_id: null,
				totalRevenue: { $sum: { $ifNull: ["$total", "$totalPrice", 0] } },
				totalOrders: { $sum: 1 },
				totalSubtotal: { $sum: { $ifNull: ["$subtotal", 0] } },
				totalShippingFee: { $sum: { $ifNull: ["$shipping_fee", "$shippingFee", 0] } },
				totalDiscount: { $sum: { $ifNull: ["$discount.amount", "$discount", 0] } },
			},
		},
	]);

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

	if (process.env.NODE_ENV === "development") console.log("Analytics getRevenueByProduct matchFilter:", matchFilter);

	const result = await Order.aggregate([
		{ $match: matchFilter },
		{ $unwind: "$items" },
		{
			$lookup: {
				from: "products",
				localField: "items.product_id",
				foreignField: "_id",
				as: "product_info",
			},
		},
		{ $unwind: { path: "$product_info", preserveNullAndEmptyArrays: true } },
		{
			$group: {
				_id: "$items.product_id",
				productName: { $first: "$product_info.name" },
				productImage: { $first: "$product_info.images" },
				totalQuantitySold: { $sum: "$items.quantity" },
				totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
				totalOrders: { $sum: 1 },
				averagePrice: { $avg: "$items.price" },
			},
		},
		{ $sort: { totalRevenue: -1 } },
	]);

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

	const result = await Order.aggregate([
		{ $match: matchFilter },
		{ $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
		{
			$group: {
				_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
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

	// Build match filter
	const matchFilter = {};
	if (startDate || endDate) {
		matchFilter.createdAt = {};
		if (startDate) {
			matchFilter.createdAt.$gte = new Date(startDate);
		}
		if (endDate) {
			const end = new Date(endDate);
			end.setDate(end.getDate() + 1);
			matchFilter.createdAt.$lt = end;
		}
	}
	if (status) {
		matchFilter.status = status;
	}

	const result = await Order.aggregate([
		{ $match: matchFilter },
		{
			$group: {
				_id: "$status",
				count: { $sum: 1 },
				totalAmount: { $sum: { $ifNull: ["$total", "$totalPrice", 0] } },
			},
		},
		{ $sort: { count: -1 } },
	]);

	// Also get overall count
	const total = await Order.countDocuments(matchFilter);

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

	// Build match filter
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

	if (process.env.NODE_ENV === "development") console.log("Analytics getTopCustomers matchFilter:", matchFilter);

	const result = await Order.aggregate([
		{ $match: matchFilter },
		{
			$lookup: {
				from: "users",
				localField: "user_id",
				foreignField: "_id",
				as: "user_info",
			},
		},
		{ $unwind: { path: "$user_info", preserveNullAndEmptyArrays: true } },
		{
			$group: {
				_id: "$user_id",
				userName: { $first: "$user_info.name" },
				userEmail: { $first: "$user_info.email" },
				totalSpent: { $sum: { $ifNull: ["$total", "$totalPrice", 0] } },
				totalOrders: { $sum: 1 },
				averageOrderValue: { $avg: { $ifNull: ["$total", "$totalPrice", 0] } },
			},
		},
		{ $sort: { totalSpent: -1 } },
		{ $limit: parseInt(limit, 10) || 10 },
	]);

	return res.success(result, "Top khách hàng theo chi tiêu", 200);
};

export default {
	getTotalRevenue,
	getRevenueByProduct,
	getDailyRevenue,
	getOrderStats,
	getTopCustomers,
};
