import express from "express";
import { createTopUpVnPay, vnpayReturn, withdrawFromWallet, approveWithdraw, getAllWalletTransactions } from "../controllers/walletTransactionController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/getWalletTransaction", authMiddleware.requireAdmin, getAllWalletTransactions)

router.post("/create", authMiddleware.verifyToken, createTopUpVnPay);

router.post("/withdrawal", authMiddleware.verifyToken, withdrawFromWallet);


//admin
router.put("/approveWithDrawal/:transactionId", authMiddleware.requireAdmin, approveWithdraw);

router.get("/result", vnpayReturn);
export default router;
