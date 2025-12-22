import { validationResult } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import crypto from "crypto";
import {sendEmail} from "../utils/sendEmail.js";
import createError from "../utils/createError.js";

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
           

            return res.status(201).json({ token, message: "Đăng ký thành công" } );
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


            return res.json({ token, 
                user: {
                    _id: user._id,
                    fullname: user.name,
                    email: user.email
                }, 
            message: "Đăng nhập thành công" });
            } catch (err) {
            console.error(err);
            return res.status(500).json({ message: 'Lỗi server' });
            };
    
    };
        export const getUserId = async(req, res) => {
                try {
                    if (!req.user)
                    return res.status(404).json({ success: false, message: "User not found" });

                    const { password, ...userData } = req.user.toObject(); // loại bỏ password
                    return res.status(200).json({
                    success: true,
                    message: "User retrieved",
                    data: userData,
                    });
                } catch (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, message: "Server error" });
                }
                };


        export const getAllUser = async(req, res) => {
            try {
                const users = await User.find().select("-password");
                return res.status(200).json({
                success: true,
                message: "Lấy danh sách user thành công",
                data: users
                });
            }
            catch (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, message: "Lấy thông tin user thất bại" });
                };
        }   

        export const adminLogin = async (req, res) => {
            const errors = validationResult(req);
            if (!errors.isEmpty())
                return res.status(400).json({ errors: errors.array() });

            const { email, password } = req.body;

            try {
                const user = await User.findOne({ email });
                if (!user)
                return res.status(400).json({ message: "Thông tin đăng nhập không đúng" });

                if (user.role !== "admin") {
                return res.status(403).json({ message: "Không có quyền truy cập admin" });
                }

                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch)
                return res.status(400).json({ message: "Thông tin đăng nhập không đúng" });

                const payload = {
                userId: user._id,
                role: user.role, // nên gắn role vào token
                };

                const token = jwt.sign(
                payload,
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN }
                );

                return res.json({
                token,
                user: {
                    _id: user._id,
                    fullname: user.name,
                    email: user.email,
                    role: user.role,
                },
                message: "Đăng nhập admin thành công",
                });
            } catch (err) {
                console.error(err);
                return res.status(500).json({ message: "Lỗi server" });
            }
            };

            

        export const forgotPassword = async (req, res, next) => {
        try {
            const { email } = req.body;
            const now = Date.now();
            const user = await User.findOne({ email });
            if (!user) {
                return res.json({
                    message: "Nếu email tồn tại, OTP đã được gửi",
                });
                }
                // ⏱ Chặn gửi quá nhanh (60s)
            if (user.otpLastRequestAt && now - user.otpLastRequestAt.getTime() < 60 * 1000) {
                throw createError(429, "Vui lòng chờ 60 giây trước khi gửi lại OTP");
                }

                // 🔁 Reset counter sau 15 phút
            if (!user.otpLastRequestAt || now - user.otpLastRequestAt.getTime() > 15 * 60 * 1000) {
                user.otpRequestCount = 0;
            }

                // 🚫 Giới hạn 3 OTP / 15 phút
            if (user.otpRequestCount >= 3) {
                throw createError(429, "Bạn đã yêu cầu OTP quá nhiều lần");
            }



            // Sinh OTP 6 số
            const otp = Math.floor(100000 + Math.random() * 900000).toString();

            // Hash OTP trước khi lưu
            const hashedOTP = crypto
            .createHash("sha256")
            .update(otp)
            .digest("hex");

            user.resetPasswordOTP = hashedOTP;
            user.resetPasswordExpires = Date.now() + 5 * 60 * 1000; // 5 phút
            user.otpRequestCount += 1;
            user.otpLastRequestAt = now;

            await user.save();

            // Gửi email
            await sendEmail({
            to: user.email,
            subject: "Mã OTP đặt lại mật khẩu",
            html: `
                <h3>Đặt lại mật khẩu</h3>
                <p>Mã OTP của bạn là:</p>
                <h2>${otp}</h2>
                <p>Mã có hiệu lực trong 5 phút</p>
            `,
            });

            res.json({ message: "Đã gửi OTP về email" });
        } catch (err) {
            next(err);
        }
        };

        export const verifyResetOTP = async (req, res, next) => {
            try {
                const { email, otp } = req.body;

                const user = await User.findOne({
                email,
                resetPasswordExpires: { $gt: Date.now() },
                });

                if (!user) throw createError(400, "OTP không hợp lệ hoặc đã hết hạn");
                
                const hashedOTP = crypto
                .createHash("sha256")
                .update(otp)
                .digest("hex");

                if (hashedOTP !== user.resetPasswordOTP) {
                    user.otpVerifyAttempts += 1;
                    await user.save();
                    if (user.otpVerifyAttempts >= 5) {
                        user.resetPasswordOTP = undefined;
                        user.resetPasswordExpires = undefined;
                        await user.save();
                        throw createError(429, "OTP đã bị khóa, vui lòng gửi lại");
                        }
                    throw createError(400, "OTP không đúng");
                }
              

                // 👉 Tạo reset token (chỉ dùng cho reset password)
                const resetToken = jwt.sign(
                {
                    userId: user._id,
                    type: "reset-password",
                },
                process.env.JWT_SECRET,
                { expiresIn: "10m" }
                );
                user.resetPasswordOTP = undefined;
                user.resetPasswordExpires = undefined;
                user.otpRequestCount = undefined;
                user.otpVerifyAttempts = 0;
                await user.save();

                res.json({
                message: "OTP hợp lệ",
                resetToken,
                });
            } catch (err) {
                next(err);
            }
            };

            export const resetPassword = async (req, res, next) => {
                try {
                    const {newPassword } = req.body;
                    const userId = req.userId;
                    if (!newPassword || newPassword.length < 6) throw createError(400, "Mật khẩu quá ngắn");
                        const user = await User.findById(userId);
                        if (!user) throw createError(404, "User không tồn tại");

                        user.password = await bcrypt.hash(newPassword, 10);

                        // Cleanup OTP
                        user.resetPasswordOTP = undefined;
                        user.resetPasswordExpires = undefined;

                        await user.save();

                        res.json({ message: "Đổi mật khẩu thành công" });
                } catch (err) {
                    next(err);
                }
            };


