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
import handleAsync from "../utils/handleAsync.js";

const router = express.Router();

router.use(verifyToken);

router.post("/", handleAsync(createWithdrawalMethod));
router.get("/", handleAsync(getWithdrawalMethods));

//admin
router.get("/allWithDrawalMethod", requireAdmin, handleAsync(getAllWithdrawalMethods));

router.get("/:id", handleAsync(getWithdrawalMethodById));

router.put("/:id", handleAsync(updateWithdrawalMethod));
router.delete("/:id", handleAsync(deleteWithdrawalMethod));

export default router;
