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
                role: user.role, // gắn role vào token
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
    console.log('📧 Forgot password request received');
    console.log('📧 Email config:', {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS ? '***có***' : '❌THIẾU',
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
    });
    
    const { email } = req.body;
    console.log('📧 Looking for user:', email);
    
    const now = Date.now();
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('⚠️ User not found:', email);
      return res.json({
        message: "Nếu email tồn tại, OTP đã được gửi",
      });
    }
    
    console.log('✅ User found:', user.email);
    
    // Chặn gửi quá nhanh (60s)
    if (user.otpLastRequestAt && now - user.otpLastRequestAt.getTime() < 60 * 1000) {
      throw createError(429, "Vui lòng chờ 60 giây trước khi gửi lại OTP");
    }

    // Reset counter sau 15 phút
    if (!user.otpLastRequestAt || now - user.otpLastRequestAt.getTime() > 15 * 60 * 1000) {
      user.otpRequestCount = 0;
    }

    // Giới hạn 3 OTP / 15 phút
    if (user.otpRequestCount >= 3) {
      throw createError(429, "Bạn đã yêu cầu OTP quá nhiều lần");
    }

    // Sinh OTP 6 số
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('🔑 Generated OTP:', otp);

    // Hash OTP trước khi lưu
    const hashedOTP = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex");

    user.resetPasswordOTP = hashedOTP;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // ĐỔI THÀNH 15 PHÚT
    user.otpRequestCount = (user.otpRequestCount || 0) + 1;
    user.otpLastRequestAt = now;
    user.otpVerifyAttempts = 0; // Reset attempts khi gửi OTP mới

    await user.save();

    console.log('📤 Sending email to:', user.email);
    // Gửi email
    await sendEmail({
      to: user.email,
      subject: "Mã OTP đặt lại mật khẩu",
      html: `
        <h3>Đặt lại mật khẩu</h3>
        <p>Mã OTP của bạn là:</p>
        <h2>${otp}</h2>
        <p>Mã có hiệu lực trong <strong>15 phút</strong></p>
      `,
    });

    console.log('✅ Email sent successfully!');
    res.json({ message: "Đã gửi OTP về email" });
  } catch (err) {
    console.error('❌ ERROR in forgotPassword:', err);
    next(err);
  }
};

  export const verifyResetOTP = async (req, res, next) => {
  try {
    console.log('=== VERIFY OTP DEBUG ===');
    console.log('📥 Raw body:', JSON.stringify(req.body));
    console.log('📥 Body keys:', Object.keys(req.body));
    
    // Kiểm tra validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({ 
        message: errors.array()[0].msg,
        errors: errors.array() 
      });
    }
    
    const { email, otp } = req.body;
    
    console.log('📧 Email:', `"${email}"`);
    console.log('🔑 OTP:', `"${otp}"`);
    console.log('🔑 OTP type:', typeof otp);
    console.log('🔑 OTP length:', otp?.length);
    console.log('🔑 OTP is numeric:', /^\d+$/.test(otp));

    const user = await User.findOne({
      email,
      resetPasswordExpires: { $gt: Date.now() },
    });

    console.log('👤 User found:', user ? 'YES' : 'NO');
    
    if (!user) {
      console.log('❌ Reasons: user not found OR OTP expired');
      console.log('⏰ Current time:', new Date());
      
      // Kiểm tra user có tồn tại không
      const userExists = await User.findOne({ email });
      if (userExists) {
        console.log('👤 User exists but:', {
          hasOTP: !!userExists.resetPasswordOTP,
          expiresAt: userExists.resetPasswordExpires ? new Date(userExists.resetPasswordExpires) : 'NO EXPIRY',
          isExpired: userExists.resetPasswordExpires ? Date.now() > userExists.resetPasswordExpires : 'N/A'
        });
      } else {
        console.log('👤 User does not exist in database');
      }
      
      throw createError(400, "OTP không hợp lệ hoặc đã hết hạn");
    }
    
    console.log('📊 User OTP info:', {
      storedHash: user.resetPasswordOTP,
      expiresAt: new Date(user.resetPasswordExpires),
      attempts: user.otpVerifyAttempts || 0
    });
    
    // Hash OTP người dùng nhập vào
    const hashedOTP = crypto
      .createHash("sha256")
      .update(otp.toString()) // Đảm bảo convert sang string
      .digest("hex");
    
    console.log('🔐 Hashed OTP (stored):', user.resetPasswordOTP);
    console.log('🔐 Hashed OTP (input):', hashedOTP);
    console.log('✅ Match:', hashedOTP === user.resetPasswordOTP);

    if (hashedOTP !== user.resetPasswordOTP) {
      user.otpVerifyAttempts = (user.otpVerifyAttempts || 0) + 1;
      await user.save();
      
      console.log('❌ OTP không khớp. Số lần thử:', user.otpVerifyAttempts);
      
      if (user.otpVerifyAttempts >= 5) {
        user.resetPasswordOTP = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        throw createError(429, "OTP đã bị khóa, vui lòng gửi lại");
      }
      throw createError(400, "OTP không đúng");
    }

    // Tạo reset token
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
    user.otpRequestCount = 0;
    user.otpVerifyAttempts = 0;
    await user.save();

    console.log('✅ OTP verified successfully!');
    res.json({
      message: "OTP hợp lệ",
      resetToken,
    });
  } catch (err) {
    console.error('❌ Error in verifyResetOTP:', err.message);
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


