import { Router } from "express";
import {
	getTotalRevenue,
	getRevenueByProduct,
	getDailyRevenue,
	getOrderStats,
	getTopCustomers,
} from "../controllers/analyticsController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import handleAsync from "../utils/handleAsync.js";

const router = Router();

/**
 * GET /api/analytics/revenue
 * Get total revenue with optional date range filter
 * Query: ?startDate=2024-01-01&endDate=2024-12-31
 */
router.get("/revenue", authMiddleware.verifyToken, handleAsync(getTotalRevenue));

/**
 * GET /api/analytics/revenue-by-product
 * Get revenue breakdown by product
 * Query: ?startDate=2024-01-01&endDate=2024-12-31
 */
router.get("/revenue-by-product", authMiddleware.verifyToken, handleAsync(getRevenueByProduct));

/**
 * GET /api/analytics/revenue-daily
 * Get daily revenue breakdown
 * Query: ?startDate=2024-01-01&endDate=2024-12-31
 */
router.get("/revenue-daily", authMiddleware.verifyToken, handleAsync(getDailyRevenue));

/**
 * GET /api/analytics/order-stats
 * Get order statistics by status
 * Query: ?startDate=2024-01-01&endDate=2024-12-31&status=confirmed
 */
router.get("/order-stats", authMiddleware.verifyToken, handleAsync(getOrderStats));

/**
 * GET /api/analytics/top-customers
 * Get top customers by spending
 * Query: ?startDate=2024-01-01&endDate=2024-12-31&limit=10
 */
router.get("/top-customers", authMiddleware.verifyToken, handleAsync(getTopCustomers));

export default router;
