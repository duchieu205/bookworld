import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware.js"
import {getCart} from "../controllers/CartController.js";
import handleAsync from "../utils/handleAsync.js";

const router = Router();

router.get("/", authMiddleware.verifyToken, handleAsync(getCart));
// router.post("/", authMiddleware.verifyToken, handleAsync(CartController.createCart));

export default router;
