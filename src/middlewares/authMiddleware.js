import jwt from "jsonwebtoken";
import User from "../models/User.js";
import createError from "../utils/createError.js";
import rateLimit from "express-rate-limit";

export const verifyToken = async (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader)
    return res.status(401).json({ message: "Không có token" });

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer")
    return res.status(401).json({ message: "Token sai định dạng" });

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.id).select("-password");

    if (!user)
      return res.status(401).json({ message: "Token không hợp lệ" });
  
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }
};

// Middleware kiểm tra quyền linh hoạt
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    next();
  };
};

// SỬA LẠI requireAdmin ĐỂ TỰ XÁC THỰC MÀ KHÔNG CẦN verifyToken TRƯỚC ĐÓ
export const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Không có quyền, thiếu Token" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId || decoded.id);

    console.log("--- KIỂM TRA QUYỀN ADMIN ---");
    console.log("Email:", user ? user.email : "Không tìm thấy user");
    console.log("Role trong DB:", user ? user.role : "N/A");

    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ admin mới được truy cập" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Lỗi xác thực Admin:", err.message);
    return res.status(401).json({ message: "Token không hợp lệ hoặc hết hạn" });
  }
};




export const verifyResetToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw createError(401, "Thiếu reset token");

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== "reset-password")
      throw createError(403, "Token không hợp lệ");

    req.userId = decoded.userId;
    next();
  } catch (err) {
    next(createError(401, "Reset token không hợp lệ hoặc đã hết hạn"));
  }
};

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Quá nhiều yêu cầu, thử lại sau",
});



export default {
  verifyToken, authorize, requireAdmin, verifyResetToken, forgotPasswordLimiter
};