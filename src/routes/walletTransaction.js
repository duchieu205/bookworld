import express from "express";
import {
  createTopUpVnPay,
  vnpayReturn,
  withdrawFromWallet,
  approveWithdraw,
  getAllWalletTransactions,
  getMyWalletTransactions,
  rejectWithdrawTransaction
} from "../controllers/walletTransactionController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import handleAsync from "../utils/handleAsync.js";

const router = express.Router();

// USER
router.post("/create", authMiddleware.verifyToken, handleAsync(createTopUpVnPay));
router.post("/withdrawal", authMiddleware.verifyToken, handleAsync(withdrawFromWallet));
router.get("/my-transactions", authMiddleware.verifyToken, handleAsync(getMyWalletTransactions));

// ADMIN
router.get("/getWalletTransaction", authMiddleware.requireAdmin, handleAsync(getAllWalletTransactions));
router.put("/approveWithDrawal/:transactionId", authMiddleware.requireAdmin, handleAsync(approveWithdraw));
router.put("/rejectWithdrawTransaction/:transactionId", authMiddleware.requireAdmin, handleAsync(rejectWithdrawTransaction));

// VNPay callback
router.get("/result", handleAsync(vnpayReturn));

export default router;
