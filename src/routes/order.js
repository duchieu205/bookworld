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
  approveReturnOrder
} from "../controllers/orderController.js";

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

    return res.success(
      { hasPurchased: !!order },
      "Check purchase complete"
    );
  })
);

/* ================= ORDER APIs ================= */

// Create an order
router.post("/", authMiddleware.verifyToken, createOrder);

// Get orders for authenticated user
router.get("/", authMiddleware.verifyToken, getUserOrders);

// Admin: list all orders
router.get("/admin/list", authMiddleware.requireAdmin, getAllOrders);

// Get order detail
router.get("/:id", authMiddleware.verifyToken, getOrderById);

// Update order status (admin)
router.put("/status/:id", authMiddleware.requireAdmin, updateOrderStatus);

// Cancel order
router.put("/:id", authMiddleware.verifyToken, cancelOrder);

router.post("/return-request/:id",authMiddleware.verifyToken,requestReturnOrder);


router.post("/approveReturnOrder/:id",authMiddleware.requireAdmin,approveReturnOrder);



export default router;
