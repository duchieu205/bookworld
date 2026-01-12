import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import variantController from "../controllers/variantController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

// List variants (optionally filter by product)
router.get("/", handleAsync(variantController.getVariants));
router.get("/admin/variants", authMiddleware.requireAdmin, (req, res, next) => {
  req.isAdminRequest = true;
  next();
}, handleAsync(variantController.getVariants));
// Create variant
router.post("/", authMiddleware.requireAdmin, handleAsync(variantController.createVariant));

// Temporary: accept PUT /api/variants with id/_id in body
// router.put("/", authMiddleware.requireAdmin, handleAsync(variantController.updateVariantByBody));

// Get variant by id
router.get("/:id", handleAsync(variantController.getVariantById));

// Update variant
router.put("/:id", authMiddleware.requireAdmin, handleAsync(variantController.updateVariant));

// Delete variant
router.delete("/:id", authMiddleware.requireAdmin, handleAsync(variantController.deleteVariant));

export default router;
