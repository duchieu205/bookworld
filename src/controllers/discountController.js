import Discount from "../models/Discount.js";

export const createDiscount = async (req, res) => {
    const body = req.body;
    try {
        const newDiscount = await Discount.create(body);
        return res.success(newDiscount, "Tạo mã giảm giá thành công", 201);
    }
    catch {
        return res.success("Tạo mã giảm giá thất bại", 400);
    }
}
export default {createDiscount};