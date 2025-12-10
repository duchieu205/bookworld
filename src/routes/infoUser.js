import express from "express";

import authMiddleware from "../middlewares/authMiddleware.js";


const router = express.Router();
import {
    getInfo,
    updateInfo,
    getFavorites,
    addFavorite,
    removeFavorite,
    checkFavorite 
} from "../controllers/userInforController.js";
import handleAsync from "../utils/handleAsync.js";
router.get("/infor", authMiddleware.verifyToken, handleAsync(getInfo) );
router.put("/infor", authMiddleware.verifyToken, handleAsync(updateInfo) );

    
router.get("/favorites", authMiddleware.verifyToken, handleAsync(getFavorites));
router.post("/favorites", authMiddleware.verifyToken, handleAsync(addFavorite));
router.delete("/favorite/:productId", authMiddleware.verifyToken, handleAsync(removeFavorite));
router.get("/favorite/check/:productId", authMiddleware.verifyToken, handleAsync(checkFavorite));

export default router;