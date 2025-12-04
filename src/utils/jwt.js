import jwt from "jsonwebtoken";
import { JWT_REFRESH_SECRET, JWT_SECRET } from "../configs/enviroments.js";

/**
 * Tạo access token dùng trong xác thực chính
 * @param {Object} user - đối tượng người dùng
 * @returns {String} token
 */
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
};

/**
 * Tạo refresh token để cấp lại access token
 * @param {Object} user - đối tượng người dùng
 * @returns {String} refresh token
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    JWT_REFRESH_SECRET,
    { expiresIn: "60d" }
  );
};

export { generateToken, generateRefreshToken };
