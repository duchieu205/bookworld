import jwt from "jsonwebtoken";


export const verifyToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) return res.status(401).json({ message: 'Không có token' });


  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Token sai định dạng' });


  const token = parts[1];
  try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decoded; // { userId }
  next();
  } catch (err) {
  return res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

export default { verifyToken };