import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import productController from "../controllers/productController.js";

const router = Router();

// List products (with pagination & filters)
router.get("/", handleAsync(productController.getProducts));

// Create product
router.post("/", handleAsync(productController.createProduct));

// Get product by id
router.get("/:id", handleAsync(productController.getProductById));

// Update product
router.put("/:id", handleAsync(productController.updateProduct));

// Delete product
router.delete("/:id", handleAsync(productController.deleteProduct));

export default router;
