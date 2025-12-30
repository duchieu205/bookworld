import express from "express";
import {
  createTopUpVnPay,
  vnpayReturn,
  withdrawFromWallet,
  approveWithdraw,
  getAllWalletTransactions,
  getMyWalletTransactions
} from "../controllers/walletTransactionController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = express.Router();

// USER
router.post("/create", authMiddleware.verifyToken, createTopUpVnPay);
router.post("/withdrawal", authMiddleware.verifyToken, withdrawFromWallet);
router.get("/my-transactions", authMiddleware.verifyToken, getMyWalletTransactions);

// ADMIN
router.get("/getWalletTransaction", authMiddleware.requireAdmin, getAllWalletTransactions);
router.put("/approveWithDrawal/:transactionId", authMiddleware.requireAdmin, approveWithdraw);

// VNPay callback
router.get("/result", vnpayReturn);

export default router;
