import express from "express";
import { createOrderWithVnPay, vnpayReturn } from "../controllers/orderVnpayController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import handleAsync from "../utils/handleAsync.js";

const router = express.Router();


router.post("/create", authMiddleware.verifyToken, handleAsync(createOrderWithVnPay));
// router.post("/ipnUrl", vnpayIPN);

router.get("/result", handleAsync(vnpayReturn));

export default router;
