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
import session from "express-session";
import passport from "passport";
import "./src/configs/passport.js";
import authRoutes from "./src/routes/auth.js";

const app = express();

/* ================= BASIC MIDDLEWARE ================= */
app.use(express.json());


app.use("/uploads", express.static("uploads"));

connectDB();

/* ================= CORS ================= */
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    credentials: true,
  })
);

/* ================= SESSION & PASSPORT ================= */
app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: true,
  })
);

app.use(passport.initialize());
app.use(passport.session());

/* ================= SWAGGER ================= */
setupSwagger(app);

/* ================= CUSTOM MIDDLEWARE ================= */
app.use(formatResponseSuccess);
app.use(jsonValid);

/* ================= ROUTES ================= */
app.use("/", authRoutes);
app.use("/api", routes);

/* ================= ERROR HANDLING ================= */
app.use(notFoundHandler);
app.use(errorHandler);

/* ================= START SERVER ================= */
const server = app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});

/* ================= PROCESS ERROR ================= */
process.on("unhandledRejection", (error) => {
  console.error(error.message);
  server.close(() => process.exit(1));
});
