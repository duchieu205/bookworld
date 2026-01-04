import { Router } from "express";
import {
	getTotalRevenue,
	getRevenueByProduct,
	getDailyRevenue,
	getDailyAndProductRevenue,
	getOrderStats,
	getTopCustomers,
	getTotalRevenueDebug,
} from "../controllers/analyticsController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import handleAsync from "../utils/handleAsync.js";

const router = Router();

/**
 * GET /api/analytics/revenue
 * Get total revenue with optional date range filter and optional product filter
 * Query: ?startDate=2024-01-01&endDate=2024-12-31&product=<id_or_name>
 */
router.get("/revenue", authMiddleware.verifyToken, authMiddleware.requireAdmin, handleAsync(getTotalRevenue));

// Debug route to view pipeline (development only). Use ?startDate=&endDate=&product=&_debug=1
if (process.env.NODE_ENV === 'development') {
	router.get("/revenue-debug", handleAsync(getTotalRevenueDebug));
}

/**
 * GET /api/analytics/revenue-by-product
 * Get revenue breakdown by product
 * Query: ?startDate=2024-01-01&endDate=2024-12-31
 */
router.get("/revenue-by-product", authMiddleware.verifyToken, authMiddleware.requireAdmin, handleAsync(getRevenueByProduct));

/**
 * GET /api/analytics/revenue-daily
 * Get daily revenue breakdown with optional product filter
 * Query: ?startDate=2024-01-01&endDate=2024-12-31&product=<id_or_name>
 */
router.get("/revenue-daily", authMiddleware.verifyToken, authMiddleware.requireAdmin, handleAsync(getDailyRevenue));

/**
 * GET /api/analytics/revenue-daily-and-product
 * Returns daily revenue and revenue-by-product in one response (applies same startDate/endDate/product filters)
 * Query: ?startDate=2024-01-01&endDate=2024-12-31&product=<id_or_name>
 */
router.get("/revenue-daily-and-product", authMiddleware.verifyToken, authMiddleware.requireAdmin, handleAsync(getDailyAndProductRevenue));

/**
 * GET /api/analytics/order-stats
 * Get order statistics by status
 * Query: ?startDate=2024-01-01&endDate=2024-12-31&status=confirmed
 */
router.get("/order-stats", authMiddleware.verifyToken, authMiddleware.requireAdmin, handleAsync(getOrderStats));

/**
 * GET /api/analytics/top-customers
 * Get top customers by spending
 * Query: ?startDate=2024-01-01&endDate=2024-12-31&limit=10
 */
router.get("/top-customers", authMiddleware.verifyToken, authMiddleware.requireAdmin, handleAsync(getTopCustomers));

export default router;
