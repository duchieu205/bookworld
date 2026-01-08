import Order from "../models/order.js";
import Product from "../models/Product.js";
import createError from "../utils/createError.js";
const normalizeProductParam = (raw) => {
	if (!raw && raw !== 0) return null;
	let v = raw;
	if (typeof v === 'string') {
		v = v.trim();
		if (v === '' || v.toLowerCase() === 'undefined' || v.toLowerCase() === 'null') return null;
	
		if (v[0] === '{' || v[0] === '[') {
			try {
				const parsed = JSON.parse(v);
				if (parsed) {
					// prefer id/value fields
					if (parsed.value) return String(parsed.value);
					if (parsed.id) return String(parsed.id);
					if (parsed.name) return String(parsed.name);
					if (parsed.label) return String(parsed.label);
				}
			} catch (e) {
				
			}
		}
		return v;
	}
	
	if (typeof v === 'object') {
		if (v.value) return String(v.value);
		if (v.id) return String(v.id);
		if (v.name) return String(v.name);
		if (v.label) return String(v.label);
		return null;
	}
	return String(v);
};

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

	
	const _debug = req.query && (req.query._debug === '1' || req.query._debug === 'true');

	const { startDate, endDate } = req.query; // optional date filters
	const rawProduct = req.query.product || req.query.productId || req.query.productName;
	const product = normalizeProductParam(rawProduct); // normalized product value (id or name)

	// Base match (DO NOT put createdAt here — we'll match on converted createdAtDate)
	// NOTE: include orders with status "Giao hàng thành công" regardless of payment.status so COD delivered orders are counted
	const baseMatch = {
		$and: [
			{ status: { $in: ["Đã xác nhận", "Giao hàng thành công", "Hoàn tất", "confirmed"] } },
			{ $or: [
				{ status: "Giao hàng thành công" },
				{ "payment.status": { $in: ["paid", "Đã thanh toán"] } },
				{ "payment.status": { $exists: false } },
				{ payment: { $exists: false } },
			] }
		]
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

	// If a specific product is requested, compute totals based on items
	if (product) {
		// unwind items and lookup product/variant info to match by id or name
		if (process.env.NODE_ENV === 'development') console.log("Analytics getTotalRevenue product filter:", product);
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
			$lookup: {
				from: "variants",
				localField: "items.variant_id",
				foreignField: "_id",
				as: "variant_info",
			},
		});
		pipeline.push({ $unwind: { path: "$variant_info", preserveNullAndEmptyArrays: true } });

		const prodMatch = {
			$or: [
				{ $expr: { $eq: [{ $toString: "$items.product_id" }, product] } },
				{ $expr: { $eq: [{ $toString: "$items.variant_id" }, product] } },
				{ "product_info.name": { $regex: product, $options: "i" } },
				{ "variant_info.name": { $regex: product, $options: "i" } },
			],
		};
		pipeline.push({ $match: prodMatch });

		pipeline.push({
			$group: {
				_id: null,
				totalRevenue: { $sum: { $multiply: [ { $ifNull: ["$items.price", "$variant_info.price", "$product_info.price", 0] }, { $ifNull: ["$items.quantity", 0] } ] } },
				totalQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
				ordersSet: { $addToSet: "$_id" },
			},
		});
		pipeline.push({ $project: { totalRevenue: 1, totalQuantity: 1, totalOrders: { $size: "$ordersSet" } } });

		if (process.env.NODE_ENV === "development") console.log("Analytics getTotalRevenue (product) pipeline:", JSON.stringify(pipeline));
		if (_debug && process.env.NODE_ENV === 'development') return res.success({ pipeline }, 'Debug pipeline', 200);
		const result = await Order.aggregate(pipeline);
		const r = result[0] || { totalRevenue: 0, totalQuantity: 0, totalOrders: 0 };
		return res.success(r, "Thống kê doanh thu tổng (lọc theo sản phẩm)", 200);
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
	const rawProduct = req.query.product || req.query.productId || req.query.productName;
	const product = normalizeProductParam(rawProduct); // product can be id or name

	// NOTE: include orders with status "Giao hàng thành công" regardless of payment.status so COD delivered orders are counted
	const baseMatch = {
		$and: [
			{ status: { $in: ["Đã xác nhận", "Giao hàng thành công", "Hoàn tất", "confirmed"] } },
			{ $or: [
				{ status: "Giao hàng thành công" },
				{ "payment.status": { $in: ["paid", "Đã thanh toán"] } },
				{ "payment.status": { $exists: false } },
				{ payment: { $exists: false } },
			] }
		]
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

	// Add product filter when provided (accept id or name). Normalize incoming values (id, name, or object)
	if (product) {
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

	const { startDate, endDate } = req.query; // optional product filter
	const rawProduct = req.query.product || req.query.productId || req.query.productName;
	const product = normalizeProductParam(rawProduct);
	const _debug = req.query && (req.query._debug === '1' || req.query._debug === 'true');
	// Build match filter for date range and accept legacy/missing payment
	// NOTE: include orders with status "Giao hàng thành công" regardless of payment.status so COD delivered orders are counted
	const matchFilter = {
		$and: [
			{ status: { $in: ["Đã xác nhận", "Giao hàng thành công", "Hoàn tất", "confirmed"] } },
			{ $or: [
				{ status: "Giao hàng thành công" },
				{ "payment.status": { $in: ["paid", "Đã thanh toán"] } },
				{ "payment.status": { $exists: false } },
				{ payment: { $exists: false } },
			] }
		]
	};
	if (startDate || endDate) {
		matchFilter.createdAtDate = {};
		if (startDate) matchFilter.createdAtDate.$gte = new Date(startDate);
		if (endDate) {
			const end = new Date(endDate);
			end.setDate(end.getDate() + 1);
			matchFilter.createdAtDate.$lt = end;
		}
	}

	if (process.env.NODE_ENV === "development") console.log("Analytics getDailyRevenue matchFilter:", matchFilter);

	// Base pipeline
	const pipeline = [dateConversion, { $match: matchFilter }, { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } }];

	if (product) {
		// lookup product/variant and filter items
		if (process.env.NODE_ENV === 'development') console.log("Analytics getDailyRevenue product filter:", product);
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
			$lookup: {
				from: "variants",
				localField: "items.variant_id",
				foreignField: "_id",
				as: "variant_info",
			},
		});
		pipeline.push({ $unwind: { path: "$variant_info", preserveNullAndEmptyArrays: true } });

		const prodMatch = {
			$or: [
				{ $expr: { $eq: [{ $toString: "$items.product_id" }, product] } },
				{ $expr: { $eq: [{ $toString: "$items.variant_id" }, product] } },
				{ "product_info.name": { $regex: product, $options: "i" } },
				{ "variant_info.name": { $regex: product, $options: "i" } },
			],
		};
		pipeline.push({ $match: prodMatch });

		pipeline.push({
			$group: {
				_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAtDate", timezone: "+07:00" } },
				totalRevenue: { $sum: { $multiply: [ { $ifNull: ["$items.price", "$variant_info.price", "$product_info.price", 0] }, { $ifNull: ["$items.quantity", 0] } ] } },
				ordersSet: { $addToSet: "$_id" },
				totalQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
			},
		});
		if (process.env.NODE_ENV === "development") console.log("Analytics getDailyRevenue (product) pipeline:", JSON.stringify(pipeline));
	} else {
		// no product filter — keep previous behavior (include order-level totals for orders without items)
		pipeline.push({
			$group: {
				// Group by date string in Vietnam timezone so 'today' is correct for local users
				_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAtDate", timezone: "+07:00" } },
				totalRevenue: {
					$sum: {
						$ifNull: [ { $multiply: ["$items.price", "$items.quantity"] }, "$total", "$totalPrice", 0 ]
					},
				},
				ordersSet: { $addToSet: "$_id" },
				totalQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
			},
		});
	}

	pipeline.push({ $project: { totalRevenue: 1, totalQuantity: 1, totalOrders: { $size: "$ordersSet" } } });
	pipeline.push({ $sort: { _id: 1 } });

	if (_debug && process.env.NODE_ENV === 'development') {
		return res.success({ pipeline }, 'Debug pipeline', 200);
	}

	const result = await Order.aggregate(pipeline);

	// If caller provided a date range, return a full series of dates (VN timezone)
	// filling missing dates with zeros so front-end charts always have consistent x-axis.
	if (startDate && endDate) {
		const formatDateVN = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
		const start = new Date(startDate);
		const end = new Date(endDate);
		const map = (result || []).reduce((acc, r) => { acc[r._id] = r; return acc; }, {});

		const filled = [];
		const cur = new Date(start);
		while (cur <= end) {
			const key = formatDateVN(cur);
			const existing = map[key] || { _id: key, totalRevenue: 0, totalQuantity: 0, totalOrders: 0 };
			// ensure numeric values and add ISO date for frontend
			existing.totalRevenue = Number(existing.totalRevenue || 0);
			existing.totalQuantity = Number(existing.totalQuantity || 0);
			existing.totalOrders = Number(existing.totalOrders || 0);
			existing.dateISO = new Date(key + 'T00:00:00+07:00').toISOString();
			existing.date = key;
			filled.push(existing);
			cur.setDate(cur.getDate() + 1);
		}

		if (process.env.NODE_ENV === 'development') console.log('Analytics getDailyRevenue filled result sample:', filled.slice(0,3));

		return res.success(filled, "Thống kê doanh thu theo ngày", 200);
	}

	return res.success(result, "Thống kê doanh thu theo ngày", 200);
};

/**
 * GET /api/analytics/revenue-daily-and-product
 * Returns both daily revenue and revenue-by-product in a single response.
 * Query: ?startDate=2024-01-01&endDate=2024-12-31&product=<id_or_name>
 */
export const getDailyAndProductRevenue = async (req, res) => {
	if (!req.user || req.user.role !== "admin") throw createError(403, "Chỉ admin mới xem thống kê");

	const { startDate, endDate } = req.query;
	const _debug = req.query && (req.query._debug === '1' || req.query._debug === 'true');
	const rawProduct = req.query.product || req.query.productId || req.query.productName;
	const product = normalizeProductParam(rawProduct);

	// Build shared match filter and include delivered status regardless of payment.status
	const matchFilter = {
		$and: [
			{ status: { $in: ["Đã xác nhận", "Giao hàng thành công", "Hoàn tất", "confirmed"] } },
			{ $or: [
				{ status: "Giao hàng thành công" },
				{ "payment.status": { $in: ["paid", "Đã thanh toán"] } },
				{ "payment.status": { $exists: false } },
				{ payment: { $exists: false } },
			] }
		]
	};
	if (startDate || endDate) {
		matchFilter.createdAtDate = {};
		if (startDate) matchFilter.createdAtDate.$gte = new Date(startDate);
		if (endDate) {
			const end = new Date(endDate);
			end.setDate(end.getDate() + 1);
			matchFilter.createdAtDate.$lt = end;
		}
	}
    // git 44333131232eqweqw
	const hasDateRange = startDate && endDate;
	const hasProduct = product && product !== "undefined" && product !== "null";

	// Build daily pipeline
	const dailyPipeline = [dateConversion, { $match: matchFilter }, { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } }];

	if (hasProduct) {
		// lookup and filter items
		dailyPipeline.push({ $lookup: { from: "products", localField: "items.product_id", foreignField: "_id", as: "product_info" } });
		dailyPipeline.push({ $unwind: { path: "$product_info", preserveNullAndEmptyArrays: true } });
		dailyPipeline.push({ $lookup: { from: "variants", localField: "items.variant_id", foreignField: "_id", as: "variant_info" } });
		dailyPipeline.push({ $unwind: { path: "$variant_info", preserveNullAndEmptyArrays: true } });

		const prodMatch = {
			$or: [
				{ $expr: { $eq: [{ $toString: "$items.product_id" }, product] } },
				{ $expr: { $eq: [{ $toString: "$items.variant_id" }, product] } },
				{ "product_info.name": { $regex: product, $options: "i" } },
				{ "variant_info.name": { $regex: product, $options: "i" } },
			],
		};
		dailyPipeline.push({ $match: prodMatch });

		dailyPipeline.push({
			$group: {
				_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAtDate", timezone: "+07:00" } },
				totalRevenue: { $sum: { $ifNull: [ { $multiply: ["$items.price", "$items.quantity"] }, 0 ] } },
				ordersSet: { $addToSet: "$_id" },
				totalQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
			},
		});
	} else {
		dailyPipeline.push({
			$group: {
				_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAtDate", timezone: "+07:00" } },
				totalRevenue: {
					$sum: {
						$ifNull: [ { $multiply: ["$items.price", "$items.quantity"] }, "$total", "$totalPrice", 0 ]
					},
				},
				ordersSet: { $addToSet: "$_id" },
				totalQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
			},
		});
	}

	dailyPipeline.push({ $project: { totalRevenue: 1, totalQuantity: 1, totalOrders: { $size: "$ordersSet" } } });
	dailyPipeline.push({ $sort: { _id: 1 } });

	// Build by-product pipeline
	const productPipeline = [dateConversion, { $match: matchFilter }];
	productPipeline.push({ $unwind: "$items" });
	productPipeline.push({ $lookup: { from: "products", localField: "items.product_id", foreignField: "_id", as: "product_info" } });
	productPipeline.push({ $unwind: { path: "$product_info", preserveNullAndEmptyArrays: true } });
	productPipeline.push({ $lookup: { from: "variants", localField: "items.variant_id", foreignField: "_id", as: "variant_info" } });
	productPipeline.push({ $unwind: { path: "$variant_info", preserveNullAndEmptyArrays: true } });

	if (hasProduct) {
		const prodMatch = {
			$or: [
				{ $expr: { $eq: [{ $toString: "$items.product_id" }, product] } },
				{ $expr: { $eq: [{ $toString: "$items.variant_id" }, product] } },
				{ "product_info.name": { $regex: product, $options: "i" } },
				{ "variant_info.name": { $regex: product, $options: "i" } },
			],
		};
		productPipeline.push({ $match: prodMatch });
	}

	productPipeline.push({
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
	productPipeline.push({ $sort: { totalRevenue: -1 } });

	if (process.env.NODE_ENV === "development") console.log("Analytics getDailyAndProductRevenue pipelines:", JSON.stringify({ dailyPipeline, productPipeline }));

	let dailyRes = [];
	let productRes = [];

	// Execute only the parts requested by the caller to match frontend display expectations:
	// - If date range provided and product empty => return daily only
	// - If date range empty and product provided => return product only
	// - If both empty or both provided => return both
	if (hasDateRange || (!hasDateRange && !hasProduct)) {
		dailyRes = await Order.aggregate(dailyPipeline);

		// Fill missing dates with zeros when date range present
		if (hasDateRange) {
			const formatDateVN = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
			const start = new Date(startDate);
			const end = new Date(endDate);
			const map = (dailyRes || []).reduce((acc, r) => { acc[r._id] = r; return acc; }, {});

			const filled = [];
			const cur = new Date(start);
			while (cur <= end) {
				const key = formatDateVN(cur);
				const existing = map[key] || { _id: key, totalRevenue: 0, totalQuantity: 0, totalOrders: 0 };
				existing.totalRevenue = Number(existing.totalRevenue || 0);
				existing.totalQuantity = Number(existing.totalQuantity || 0);
				existing.totalOrders = Number(existing.totalOrders || 0);
				existing.dateISO = new Date(key + 'T00:00:00+07:00').toISOString();
				existing.date = key;
				filled.push(existing);
				cur.setDate(cur.getDate() + 1);
			}
			dailyRes = filled;
		}
	}

	if (hasProduct || (!hasProduct && !hasDateRange)) {
		productRes = await Order.aggregate(productPipeline);
	}

	// --- Summary computation: current vs previous period (default to last 7 days if no range provided)
	let currentStart, currentEnd;
	if (startDate && endDate) {
		currentStart = new Date(startDate);
		currentEnd = new Date(endDate);
		// normalize to full-day inclusive boundaries
		currentStart.setHours(0, 0, 0, 0);
		currentEnd.setHours(23, 59, 59, 999);
	} else {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		currentEnd = new Date(today);
		currentEnd.setHours(23, 59, 59, 999);
		currentStart = new Date(today);
		currentStart.setDate(currentStart.getDate() - 6); // last 7 days
		currentStart.setHours(0, 0, 0, 0);
	}

	// Compute previous period as symmetric range immediately before currentStart/currentEnd
	const duration = currentEnd.getTime() - currentStart.getTime() + 1;
	const prevEnd = new Date(currentStart.getTime() - 1);
	const prevStart = new Date(prevEnd.getTime() - duration + 1);

	const rangeMatch = (s, e) => {
		const m = Object.assign({}, matchFilter);
		// use inclusive datetime boundaries since we normalize start/end to exact times
		m.createdAtDate = { $gte: new Date(s), $lte: new Date(e) };
		return m;
	};

	const summaryPipelineForMatch = (base) => [
		dateConversion,
		{ $match: base },
		{
			$group: {
				_id: null,
				totalRevenue: {
					$sum: {
						$ifNull: [
							"$total",
							"$totalPrice",
							{ $reduce: { input: { $ifNull: ["$items", []] }, initialValue: 0, in: { $add: ["$$value", { $multiply: [ { $ifNull: ["$$this.price", 0] }, { $ifNull: ["$$this.quantity", 0] } ] } ] } } },
							0
						]
					}
				},
			// Paid count: either payment marked paid OR admin marked delivered (treat as paid)
			paidCount: { $sum: { $cond: [ { $or: [ { $in: ["$payment.status", ["paid", "Đã thanh toán"] ] }, { $eq: ["$status", "Giao hàng thành công"] } ] }, 1, 0 ] } },
			// Delivered count: either explicitly delivered OR paid (treated as delivered for this metric)
			deliveredCount: { $sum: { $cond: [ { $or: [ { $in: ["$payment.status", ["paid", "Đã thanh toán"] ] }, { $eq: ["$status", "Giao hàng thành công"] } ] }, 1, 0 ] } },
			cancelledCount: { $sum: { $cond: [ { $eq: ["$status", "Đã hủy"] }, 1, 0 ] } },
				totalOrders: { $sum: 1 },
			}
		},
		{ $project: { _id: 0, totalRevenue: 1, paidCount: 1, deliveredCount: 1, cancelledCount: 1, totalOrders: 1 } }
	];

	const currMatch = rangeMatch(currentStart, currentEnd);
	const prevMatch = rangeMatch(prevStart, prevEnd);

	if (process.env.NODE_ENV === 'development') console.log('Analytics summary ranges: current', currentStart.toISOString(), currentEnd.toISOString(), 'previous', prevStart.toISOString(), prevEnd.toISOString());

	const [currSummaryRes, prevSummaryRes] = await Promise.all([
		Order.aggregate(summaryPipelineForMatch(currMatch)),
		Order.aggregate(summaryPipelineForMatch(prevMatch)),
	]);

	const currSummary = currSummaryRes[0] || { totalRevenue: 0, paidCount: 0, deliveredCount: 0, cancelledCount: 0, totalOrders: 0 };
	const prevSummary = prevSummaryRes[0] || { totalRevenue: 0, paidCount: 0, deliveredCount: 0, cancelledCount: 0, totalOrders: 0 };

	if (process.env.NODE_ENV === 'development') console.log('Analytics summary values:', { currSummary, prevSummary });

	// Development debug: return summaries & matches for troubleshooting
	if (_debug && process.env.NODE_ENV === 'development') {
		return res.success({ daily: dailyRes, byProduct: productRes, topProduct: null, summary: { currentRevenue: currSummary.totalRevenue || 0, previousRevenue: prevSummary.totalRevenue || 0, paidCount: currSummary.paidCount || 0, deliveredCount: currSummary.deliveredCount || 0, cancelledCount: currSummary.cancelledCount || 0, totalOrders: currSummary.totalOrders || 0 }, debug: { currSummary, prevSummary, currMatch, prevMatch, duration } }, 'Debug summary', 200);
	}

	let changePercent = null;
	let changeIsNew = false;
	if (prevSummary.totalRevenue > 0) {
		changePercent = ((currSummary.totalRevenue - prevSummary.totalRevenue) / prevSummary.totalRevenue) * 100;
		changePercent = Math.round(changePercent * 100) / 100;
	} else if (currSummary.totalRevenue > 0) {
		// previous period had zero revenue, mark as new instead of showing a misleading percentage
		changePercent = null;
		changeIsNew = true;
	} else {
		changePercent = 0;
	}

	const summary = {
		currentRevenue: Number(currSummary.totalRevenue || 0),
		previousRevenue: Number(prevSummary.totalRevenue || 0),
		changePercent,
		changeIsNew,
		paidCount: currSummary.paidCount || 0,
		deliveredCount: currSummary.deliveredCount || 0,
		cancelledCount: currSummary.cancelledCount || 0,
		totalOrders: currSummary.totalOrders || 0,
	};

	// --- Top product computation (unchanged logic)
	let topProduct = null;
	if (hasProduct) {
		const topProductPipeline = [dateConversion, { $match: matchFilter }];
		topProductPipeline.push({ $unwind: "$items" });
		topProductPipeline.push({ $lookup: { from: "products", localField: "items.product_id", foreignField: "_id", as: "product_info" } });
		topProductPipeline.push({ $unwind: { path: "$product_info", preserveNullAndEmptyArrays: true } });
		topProductPipeline.push({ $lookup: { from: "variants", localField: "items.variant_id", foreignField: "_id", as: "variant_info" } });
		topProductPipeline.push({ $unwind: { path: "$variant_info", preserveNullAndEmptyArrays: true } });
		topProductPipeline.push({
			$group: {
				_id: { $ifNull: ["$items.product_id", "$items.variant_id"] },
				productName: { $first: { $ifNull: ["$product_info.name", "$variant_info.name", "Không rõ"] } },
				productImage: { $first: { $ifNull: ["$product_info.images", []] } },
				totalQuantitySold: { $sum: { $ifNull: ["$items.quantity", 0] } },
				totalRevenue: { $sum: { $multiply: [ { $ifNull: ["$items.price", "$variant_info.price", "$product_info.price", 0] }, { $ifNull: ["$items.quantity", 0] } ] } },
				totalOrders: { $sum: 1 },
				averagePrice: { $avg: { $ifNull: ["$items.price", "$variant_info.price", "$product_info.price", 0] } },
			}
		});
		topProductPipeline.push({ $sort: { totalRevenue: -1 } });
		topProductPipeline.push({ $limit: 1 });

		const topRes = await Order.aggregate(topProductPipeline);
		topProduct = topRes[0] || null;
		if (process.env.NODE_ENV === 'development') console.log('Analytics getDailyAndProductRevenue topProduct (ignoring product filter):', JSON.stringify(topProduct));
	} else {
		topProduct = (productRes && productRes.length) ? productRes[0] : null;
	}

	return res.success({ daily: dailyRes, byProduct: productRes, topProduct, summary }, "Thống kê doanh thu (ngày & sản phẩm)", 200);
};

/**
 * Debug helper to return the built pipeline when in development.
 * Public only in development to help frontend debugging.
 */
export const getTotalRevenueDebug = async (req, res) => {
	if (process.env.NODE_ENV !== 'development') throw createError(403, 'Not allowed');

	const { startDate, endDate } = req.query;
	const rawProduct = req.query.product || req.query.productId || req.query.productName;
	const product = normalizeProductParam(rawProduct);

	const baseMatch = {
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

	if (product) {
		pipeline.push({ $unwind: "$items" });
		pipeline.push({ $lookup: { from: "products", localField: "items.product_id", foreignField: "_id", as: "product_info" } });
		pipeline.push({ $lookup: { from: "variants", localField: "items.variant_id", foreignField: "_id", as: "variant_info" } });
		pipeline.push({ $match: { $or: [ { $expr: { $eq: [{ $toString: "$items.product_id" }, product] } }, { $expr: { $eq: [{ $toString: "$items.variant_id" }, product] } }, { "product_info.name": { $regex: product, $options: "i" } }, { "variant_info.name": { $regex: product, $options: "i" } } ] } });
	}

	return res.success({ pipeline }, 'Debug pipeline', 200);
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
	getDailyAndProductRevenue,
	getOrderStats,
	getTopCustomers,
};
