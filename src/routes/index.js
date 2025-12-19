import { Router } from "express";

// Middlewares
import { verifyToken } from "../middlewares/authMiddleware.js";

// Route modules
import productRoutes from "./product.js";
import discountRoutes from "./discount.js";
import categoryRoutes from "./category.js";
import orderRoutes from "./order.js";
import variantRoutes from "./variant.js";
import cartRoutes from "./cart.js";
import authRoutes from "./auth.js";
import analyticsRoutes from "./analytics.js";
import inforUserRoutes from "./infoUser.js"
import authAdmin from "./authAdmin.js";
import reviewRoutes from "./review.js";
import uploadRoutes from "./upload.js";
import vnpayRoutes from "./vnpay.js";

const routes = Router();

// API resource routes
routes.use("/products", productRoutes);
routes.use("/discounts", discountRoutes);
routes.use("/categories", categoryRoutes);
routes.use("/orders", orderRoutes);
routes.use("/variants", variantRoutes);
routes.use("/cart", cartRoutes);
routes.use("/auth", authRoutes);
routes.use("/analytics", analyticsRoutes);
routes.use("/me", inforUserRoutes);
routes.use("/admin", authAdmin);
routes.use("/vnpay", vnpayRoutes);
// Review admin endpoints (approve/reject, list)
routes.use("/reviews", reviewRoutes);
routes.use("/upload",uploadRoutes);



export default routes;
