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


const routes = Router();

// API resource routes
routes.use("/products", productRoutes);
routes.use("/discounts", discountRoutes);
routes.use("/categories", categoryRoutes);
routes.use("/orders", orderRoutes);
routes.use("/variants", variantRoutes);
routes.use("/cart", cartRoutes);
routes.use("/auth", authRoutes);




export default routes;
