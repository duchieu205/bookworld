import jwt from "jsonwebtoken";
import User from "../models/User.js";

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
    return res.status(401).json({ message: "Token hết hạn hoặc không hợp lệ" });
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

    // Kiểm tra cả 'userId' hoặc 'id' tùy theo lúc bạn sign token ở file login
    const user = await User.findById(decoded.userId || decoded.id);

    // LOG ĐỂ DEBUG - Hãy nhìn vào Terminal chạy Node.js của bạn
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

export default {
  verifyToken, authorize, requireAdmin
};