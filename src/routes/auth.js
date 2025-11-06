import express from "express";

import { body } from "express-validator";
import * as authController from "../controllers/authController.js";
import auth from "../middlewares/authMiddleware.js";

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


    // GET /api/auth/me
    // router.get('/me', auth, authController.getMe);


export default router;