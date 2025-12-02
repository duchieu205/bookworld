import express from "express";

import { body } from "express-validator";
import * as authController from "../controllers/authController.js";
import auth from "../middlewares/authMiddleware.js";
import bcrypt from "bcrypt";
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

    router.post("/create-admin", async (req, res) => {
    const hashed = await bcrypt.hash(req.body.password, 10);

    const admin = await User.create({
        name: req.body.name,
        email: req.body.email,
        password: hashed,
        role: "admin",
    });

    return res.json({ message: "Tạo admin thành công", admin });
});


    // GET /api/auth/me
    // router.get('/me', auth, authController.getMe);


export default router;