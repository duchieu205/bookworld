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
<<<<<<< HEAD
  payOrder,
  paymentWebhook
=======
  requestReturnOrder,
  approveReturnOrder
>>>>>>> 4288b598e657ca07bea02421733513faddee5ab6
} from "../controllers/orderController.js";

import {
  createOrderWithVnPay,
  vnpayReturn
} from "../controllers/vnpayController.js";

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
<<<<<<< HEAD
router.get("/admin/list", authMiddleware.requireAdmin, handleAsync(getAllOrders));
=======
router.get("/admin/list", authMiddleware.requireAdmin, getAllOrders);
>>>>>>> 4288b598e657ca07bea02421733513faddee5ab6

// Get order detail
router.get("/:id", authMiddleware.verifyToken, handleAsync(getOrderById));

// Update order status (admin)
<<<<<<< HEAD
router.put("/:id/status", authMiddleware.requireAdmin, handleAsync(updateOrderStatus));
=======
router.put("/status/:id", authMiddleware.requireAdmin, updateOrderStatus);
>>>>>>> 4288b598e657ca07bea02421733513faddee5ab6

// Cancel order
router.put("/:id", authMiddleware.verifyToken, handleAsync(cancelOrder));

<<<<<<< HEAD
// Start payment for existing order
router.post("/:id/pay", authMiddleware.verifyToken, handleAsync(payOrder));
=======
router.post("/return-request/:id",authMiddleware.verifyToken,requestReturnOrder);


router.post("/approveReturnOrder/:id",authMiddleware.requireAdmin,approveReturnOrder);

>>>>>>> 4288b598e657ca07bea02421733513faddee5ab6

// Payment webhook
router.post("/webhook/payment", handleAsync(paymentWebhook));

// VNPay specific routes
router.post("/vnpay/create", authMiddleware.verifyToken, handleAsync(createOrderWithVnPay));
router.get("/vnpay-return", vnpayReturn);

export default router;
