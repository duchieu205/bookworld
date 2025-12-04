import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import variantController from "../controllers/variantController.js";

const router = Router();

// List variants (optionally filter by product)
router.get("/", handleAsync(variantController.getVariants));

// Create variant
router.post("/", handleAsync(variantController.createVariant));

// Temporary: accept PUT /api/variants with id/_id in body
router.put("/", handleAsync(variantController.updateVariantByBody));

// Get variant by id
router.get("/:id", handleAsync(variantController.getVariantById));

// Update variant
router.put("/:id", handleAsync(variantController.updateVariant));

// Delete variant
router.delete("/:id", handleAsync(variantController.deleteVariant));

export default router;
