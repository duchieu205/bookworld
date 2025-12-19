import express from "express";
import { createOrderWithVnPay, vnpayReturn } from "../controllers/vnpayController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = express.Router();


router.post("/create", authMiddleware.verifyToken, createOrderWithVnPay);
// router.post("/ipnUrl", vnpayIPN);

router.get("/result", vnpayReturn);

export default router;
