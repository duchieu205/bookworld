import { Router } from "express";
import handleAsync from "../utils/handleAsync.js";
import reviewController from "../controllers/reviewController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

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

export default router;
