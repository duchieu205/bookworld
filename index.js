import cors from "cors";
import express from "express";
import connectDB from "./src/configs/db.js";
import { PORT } from "./src/configs/enviroments.js";
import setupSwagger from "./src/configs/swaggerConfig.js";
import errorHandler from "./src/middlewares/errorHandler.js";
import jsonValid from "./src/middlewares/jsonInvalid.js";
import notFoundHandler from "./src/middlewares/notFoundHandler.js";
import { formatResponseSuccess } from "./src/middlewares/successHandler.js";
import routes from "./src/routes/index.js";
// var GoogleStrategy = require('passport-google-oauth20').Strategy;
import session from "express-session";
import passport from "passport";
import "./src/configs/passport.js"; //
import authRoutes from "./src/routes/auth.js";
const app = express();
app.use(express.json());

connectDB();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    credentials: true,
    // Them cac cau hinh can thiet
  })
);

app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: true,
  })
);

// ✅ Kích hoạt Passport middleware
app.use(passport.initialize());
app.use(passport.session());

setupSwagger(app);

// Middleware xử lý format dữ liệu JSON trả về
app.use(formatResponseSuccess);

// Middleware xử lý JSON không hợp lệ
app.use(jsonValid);

// Middleware xửa lý lỗi chung
app.use(errorHandler);
app.use("/", authRoutes);
app.use("/api", routes);

// Middleware xử lý route không tồn tại
app.use(notFoundHandler);

const server = app.listen(PORT, () => {
  console.log(`Server is running on: http://localhost:${PORT}/api`);
  console.log(`Swagger Docs available at http://localhost:${PORT}/api-docs`);
});

// Middleware xử lý lỗi không xác định
process.on("unhandledRejection", (error, promise) => {
  console.error(`Error: ${error.message}`);
  server.close(() => process.exit(1));
});
