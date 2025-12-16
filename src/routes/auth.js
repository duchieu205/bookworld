import express from "express";

import { body } from "express-validator";
import * as authController from "../controllers/authController.js";
import authMiddleware, { verifyToken, requireAdmin } from "../middlewares/authMiddleware.js";

import User from "../models/User.js";
const router = express.Router();

// POST /api/auth/register
    router.post('/register',
    [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Email không hợp lệ'),
    body('password').isLength({ min: 6 }).withMessage('Password phải >= 6 ký tự')
    ],
    authController.register
    );


    // POST /api/auth/login
    router.post('/login',
    [
    body('email').isEmail().withMessage('Email không hợp lệ'),
    body('password').exists().withMessage('Password required')
    ],
    authController.login
    );


    router.get('/me', authMiddleware.verifyToken ,authController.getUserId);
    router.get('/allUser', authMiddleware.verifyToken, requireAdmin ,authController.getAllUser);

    


export default router;