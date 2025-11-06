import { validationResult } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";


    export const register = async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const { name, email, password } = req.body;

        try {
        // check exists
            let user = await User.findOne({ email });
            if (user) return res.status(400).json({ message: 'Email đã được đăng ký' });


            // hash password
            const salt = await bcrypt.genSalt(10);
            const hashed = await bcrypt.hash(password, salt);


            user = new User({ name, email, password: hashed });
            await user.save();


            const payload = { userId: user._id };
          
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
           

            return res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
        } 
        catch (err) {
            console.error('Register error:', err);
            return res.status(500).json({
                message: 'Lỗi server',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
}
        };

        export const login = async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });


            const { email, password } = req.body;


            try {
            const user = await User.findOne({ email });
            if (!user) return res.status(400).json({ message: 'Thông tin đăng nhập không đúng' });


            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(400).json({ message: 'Thông tin đăng nhập không đúng' });


            const payload = { userId: user._id };
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });


            return res.json({ token, user: { id: user._id, name: user.name, email: user.email }, message: "Đăng nhập thành công" });
            } catch (err) {
            console.error(err);
            return res.status(500).json({ message: 'Lỗi server' });
            }
    };