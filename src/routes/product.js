import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import productController from "../controllers/productController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

// List products (with pagination & filters)
router.get("/", handleAsync(productController.getProducts));

router.get("/search", handleAsync(productController.searchProducts));
router.get("/:id/related", handleAsync(productController.getRelatedProducts));
// Create product
router.post("/", authMiddleware.requireAdmin, handleAsync(productController.createProduct));

// Get product by id
router.get("/:id", handleAsync(productController.getProductById));

// Update product
router.put("/:id", authMiddleware.requireAdmin, handleAsync(productController.updateProduct));

// Delete product
router.delete("/:id",authMiddleware.requireAdmin, handleAsync(productController.deleteProduct));




export default router;
