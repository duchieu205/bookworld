import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import Order from "../models/order.js";
import authMiddleware from "../middlewares/authMiddleware.js";

import {
  createOrder,
  getOrderById,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  requestReturnOrder,
  approveReturnOrder,
  refundOrderToWallet,
  rejectReturnOrder,
  rejectReturnOrderClient

} from "../controllers/orderController.js";

import {
  createOrderWithVnPay,
  vnpayReturn
} from "../controllers/orderVnpayController.js";

const router = Router();

/* ================= CHECK PURCHASE ================= */
router.get(
  "/check-purchase/:productId",
  authMiddleware.verifyToken,
  handleAsync(async (req, res) => {
    const { productId } = req.params;

    const order = await Order.findOne({
      user_id: req.user._id,
      status: "Giao hàng thành công",
      "items.product_id": productId,
    });

    return res.status(200).json({
      success: true,
      message: "Check purchase complete",
      data: { hasPurchased: !!order },
    });
  })
);

/* ================= ORDER APIs ================= */

// Create an order
router.post("/", authMiddleware.verifyToken, handleAsync(createOrder));

// Get orders for authenticated user
router.get("/", authMiddleware.verifyToken, handleAsync(getUserOrders));

// Admin: list all orders

router.get("/admin/list", authMiddleware.requireAdmin, handleAsync(getAllOrders));

// Get order detail
router.get("/:id", authMiddleware.verifyToken, handleAsync(getOrderById));

// Update order status (admin)

router.put("/:id/status", authMiddleware.requireAdmin, handleAsync(updateOrderStatus));

// Cancel order
router.put("/:id", authMiddleware.verifyToken, handleAsync(cancelOrder));

// Refund to wallet
router.post("/:id/refund", authMiddleware.verifyToken, handleAsync(refundOrderToWallet));

// Start payment for existing order




router.put("/return-request/:orderId",authMiddleware.verifyToken, handleAsync(requestReturnOrder));


router.put("/approveReturnOrder/:orderId",authMiddleware.requireAdmin, handleAsync(approveReturnOrder));

router.put("/rejectReturnOrder/:orderId", authMiddleware.requireAdmin, handleAsync(rejectReturnOrder));
router.put("/rejectReturnOrderCient/:orderId",authMiddleware.verifyToken, handleAsync(rejectReturnOrderClient));


// VNPay specific routes
router.post("/vnpay/create", authMiddleware.verifyToken, handleAsync(createOrderWithVnPay));
router.get("/vnpay-return", handleAsync(vnpayReturn));

export default router;
