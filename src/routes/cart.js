import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import {
	getCart,
	addItem,
	updateItem,
	removeItem,
	clearCart,
	clearSelectedItems
} from "../controllers/CartController.js";
import handleAsync from "../utils/handleAsync.js";

const router = Router();

// Get current user's cart
router.get("/", authMiddleware.verifyToken, handleAsync(getCart));

// Add item to cart
router.post("/items", authMiddleware.verifyToken, handleAsync(addItem));
router.post("/items/clear-selected",authMiddleware.verifyToken, handleAsync(clearSelectedItems));
// Update item quantity (or remove if quantity <= 0)
router.put("/items/:productId", authMiddleware.verifyToken, handleAsync(updateItem));

// Remove specific item
router.delete("/items/:productId", authMiddleware.verifyToken, handleAsync(removeItem));

// Clear whole cart
router.delete("/", authMiddleware.verifyToken, handleAsync(clearCart));

export default router;
