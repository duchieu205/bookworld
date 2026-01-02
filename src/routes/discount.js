    import { Router } from "express";
    import handleAsync from "../utils/handleAsync.js";
    import discountController from "../controllers/discountController.js";
    import { requireAdmin, verifyToken } from "../middlewares/authMiddleware.js";
    const router = Router();

    // Admin-only: create and delete
    router.post("/", requireAdmin, handleAsync(discountController.createDiscount));
    // Admin: update and get by id for admin UI compatibility
    router.put("/update/:id", requireAdmin, handleAsync(discountController.updateDiscount));
    router.get("/:id", requireAdmin, handleAsync(discountController.getDiscountById));

    // Allow authenticated users to validate a code for their cart
    router.post("/validate", verifyToken, handleAsync(discountController.validateDiscount));
    router.get("/", handleAsync(discountController.getDiscount));
    router.delete("/", requireAdmin, handleAsync(discountController.deleteDiscount));

    export default router;
