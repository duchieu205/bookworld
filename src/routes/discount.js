import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import discountController from "../controllers/discountController.js";
const router = Router();

router.post("/", handleAsync(discountController.createDiscount));
router.get("/", handleAsync(discountController.getDiscount));
router.delete("/", handleAsync(discountController.deleteDiscount));


export default router;
