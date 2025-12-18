import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

/* ================= MULTER CONFIG ================= */
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const uploadPath = "uploads/reviews";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only images allowed"), false);
    }
    cb(null, true);
  },
});

/* ================= ROUTE QUAN TRỌNG ================= */
router.post("/image", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  res.json({
    url: `${req.protocol}://${req.get("host")}/uploads/reviews/${req.file.filename}`,
  });
});

export default router;
