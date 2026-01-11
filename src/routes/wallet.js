import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import { createOrderWithWallet, getWalletUser, getAllWallet, lockWallet, unlockWallet } from "../controllers/orderWalletController.js";
const router = express.Router();

router.get("/", authMiddleware.verifyToken, getWalletUser);
router.get("/getAllWallet", authMiddleware.requireAdmin, getAllWallet);

router.post("/create", authMiddleware.verifyToken, createOrderWithWallet);

router.post("/lock/:id", authMiddleware.requireAdmin, lockWallet );
router.post("/unlock/:id", authMiddleware.requireAdmin, unlockWallet );



export default router;
