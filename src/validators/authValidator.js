import { body } from "express-validator";

export const resetPasswordValidator = [
  body("newPassword")
    .trim() 
    .isLength({ min: 6 })
    .withMessage("Mật khẩu phải >= 6 ký tự"),
];

export const verifyOTPValidator = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Email không hợp lệ"),

  body("otp")
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP phải đủ 6 chữ số")
    .isNumeric()
    .withMessage("OTP chỉ gồm số"),
];

export const forgotPasswordValidator = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Email không hợp lệ")
    .normalizeEmail(),
];

export const loginValidator = [
  body("email")
    .trim()
    .isEmail()
    .withMessage("Email không hợp lệ")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Mật khẩu không được để trống"),
];