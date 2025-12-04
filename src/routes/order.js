import { Router } from "express";
const router = Router();

import {
	createOrder,
	getOrderById,
	getUserOrders,
	getAllOrders,
	updateOrderStatus,
	cancelOrder,
	payOrder,
	createMomoPayment,
    createZaloPayPayment,
	momoWebhook,
	paymentWebhook,
} from "../controllers/orderController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

// Create an order (from cart or provided items)
router.post("/", authMiddleware.verifyToken, createOrder);

// Get orders for authenticated user
router.get("/", authMiddleware.verifyToken, getUserOrders);

// Admin: list all orders
router.get("/admin/list", authMiddleware.verifyToken, getAllOrders);

// Get order detail
router.get("/:id", authMiddleware.verifyToken, getOrderById);

// Update order status (admin)
router.put("/:id/status", authMiddleware.verifyToken, updateOrderStatus);

// Cancel order (owner or admin)
router.delete("/:id", authMiddleware.verifyToken, cancelOrder);

// Start payment for an order (creates a checkout session / payment intent)
router.post("/:id/pay", authMiddleware.verifyToken, payOrder);

// Momo payment creation
router.post("/:id/pay/momo", authMiddleware.verifyToken, createMomoPayment);

// ZaloPay payment creation
router.post("/:id/pay/zalopay", authMiddleware.verifyToken, createZaloPayPayment);

// Payment webhook (no auth expected from gateway; keep auth for safety if needed)
router.post("/webhook/payment", paymentWebhook);

// Momo IPN webhook
router.post("/webhook/momo", momoWebhook);

// ZaloPay IPN webhook
router.post("/webhook/zalopay", zalopayWebhook);

export default router;
