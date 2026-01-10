import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import categoryController from "../controllers/categoryController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

// List categories
router.get("/", handleAsync(categoryController.getCategories));
router.get("/admin/categories", authMiddleware.requireAdmin, (req, res, next) => {
  req.isAdminRequest = true;
  next();
}, handleAsync(categoryController.getCategories));
// Create category
router.post("/", authMiddleware.requireAdmin, handleAsync(categoryController.createCategory));

// Get category by id
router.get("/:id", handleAsync(categoryController.getCategoryById));
// Update category
router.put("/:id", authMiddleware.requireAdmin, handleAsync(categoryController.updateCategory));
router.put("/status/:id", authMiddleware.requireAdmin, handleAsync(categoryController.updateCategoryStatus));

// Delete category
router.delete("/:id", authMiddleware.requireAdmin, handleAsync(categoryController.deleteCategory));

export default router;
