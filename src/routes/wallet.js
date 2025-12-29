import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import { createOrderWithWallet, getWalletUser } from "../controllers/orderWalletController.js";
const router = express.Router();

router.get("/", authMiddleware.verifyToken, getWalletUser);
router.post("/create", authMiddleware.verifyToken, createOrderWithWallet);



export default router;
