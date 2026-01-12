import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import handleAsync from "../utils/handleAsync.js";

import { createOrderWithWallet, getWalletUser, getAllWallet, lockWallet, unlockWallet } from "../controllers/orderWalletController.js";
const router = express.Router();

router.get("/", authMiddleware.verifyToken, handleAsync(getWalletUser));
router.get("/getAllWallet", authMiddleware.requireAdmin, handleAsync(getAllWallet));

router.post("/create", authMiddleware.verifyToken, handleAsync(createOrderWithWallet));

router.post("/lock/:id", authMiddleware.requireAdmin, handleAsync(lockWallet));
router.post("/unlock/:id", authMiddleware.requireAdmin, handleAsync(unlockWallet));



export default router;
