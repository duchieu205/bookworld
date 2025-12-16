import express from "express";

import { body } from "express-validator";
import {adminLogin} from "../controllers/authController.js";
import authMiddleware, { verifyToken, requireAdmin } from "../middlewares/authMiddleware.js";

import User from "../models/User.js";
const router = express.Router();


   router.post("/login", adminLogin);

    


export default router;