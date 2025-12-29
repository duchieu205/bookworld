import express from "express";
import {
  createWithdrawalMethod,
  getWithdrawalMethods,
  getWithdrawalMethodById,
  updateWithdrawalMethod,
  deleteWithdrawalMethod,
  getAllWithdrawalMethods
} from "../controllers/withDrawalMethodController.js";
import { verifyToken, requireAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(verifyToken);

router.post("/", createWithdrawalMethod);
router.get("/", getWithdrawalMethods);

//admin
router.get("/allWithDrawalMethod", requireAdmin, getAllWithdrawalMethods);

router.get("/:id", getWithdrawalMethodById);

router.put("/:id", updateWithdrawalMethod);
router.delete("/:id", deleteWithdrawalMethod);

export default router;
