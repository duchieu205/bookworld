import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import categoryController from "../controllers/categoryController.js";

const router = Router();

// List categories
router.get("/", handleAsync(categoryController.getCategories));

// Create category
router.post("/", handleAsync(categoryController.createCategory));

// Get category by id
router.get("/:id", handleAsync(categoryController.getCategoryById));

// Update category
router.put("/:id", handleAsync(categoryController.updateCategory));

// Delete category
router.delete("/:id", handleAsync(categoryController.deleteCategory));

export default router;
