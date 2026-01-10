import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import reviewController from "../controllers/reviewController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

// Public: Get approved reviews for a specific product
router.get(
  "/products/:id",
  handleAsync(reviewController.getReviewsByProduct)
);

router.get(
  "/products/:id/can-review",
  authMiddleware.verifyToken,
  handleAsync(reviewController.canUserReview)
);

// Authenticated: Create a review for a product
router.post(
  "/products/:id",
  authMiddleware.verifyToken,
  handleAsync(reviewController.createReview)
);

// Admin-only list (filter by status)
router.get(
  "/admin",
  authMiddleware.verifyToken,
  authMiddleware.requireAdmin,
  handleAsync(reviewController.listReviewsForAdmin)
);

// Approve / reject
router.patch(
  "/:id/approve",
  authMiddleware.verifyToken,
  authMiddleware.requireAdmin,
  handleAsync(reviewController.approveReview)
);

router.patch(
  "/:id/reject",
  authMiddleware.verifyToken,
  authMiddleware.requireAdmin,
  handleAsync(reviewController.rejectReview)
);

router.delete(
  "/:id",
  authMiddleware.verifyToken,
  handleAsync(reviewController.deleteReview)
);

router.put(
  "/:id",
  authMiddleware.verifyToken,
  handleAsync(reviewController.updateReview)
);

export default router;