
import Order from "../models/order.js";
import Variant from "../models/variant.js";
import Discount from "../models/Discount.js";
import createError from "../utils/createError.js";
import Wallet from "../models/wallet.js";



export const createOrderWithWallet = async (req, res) => {
    const userId = req.user && req.user._id;
    if (!userId) throw createError(401, "Chưa đăng nhập");
    const wallet = await Wallet.findOne({ user: userId});
    const {
        items: bodyItems,
        shipping_address = {},
        shipping_fee = 0,
        note = "",
        discountCode,
    } = req.body;

    if (!Array.isArray(bodyItems) || bodyItems.length === 0)
        throw createError(400, "Không có sản phẩm để đặt hàng");

    let items = [];
    let subtotal = 0;

    // ===== 1. Validate items + tính subtotal =====
    for (const it of bodyItems) {
        if (!it.product_id) throw createError(400, "Thiếu product_id");
        if (!it.variant_id) throw createError(400, "Thiếu variant_id");
        if (!it.quantity) throw createError(400, "Thiếu quantity");

        const variant = await Variant.findById(it.variant_id);
        if (!variant)
            throw createError(404, `Biến thể không tồn tại (${it.variant_id})`);

        if (String(variant.product_id) !== String(it.product_id)) {
            throw createError(400, "Biến thể không thuộc sản phẩm này");
        }

        if (variant.quantity < it.quantity) {
            throw createError(
                400,
                `Biến thể '${variant.type}' không đủ số lượng`
            );
        }

        subtotal += variant.price * it.quantity;

        items.push({
            product_id: it.product_id,
            variant_id: it.variant_id,
            quantity: it.quantity,
        });
    }

    // ===== 2. Discount =====
    let discountAmount = 0;
    if (discountCode) {
        for (const it of items) {
            const variant = await Variant.findById(it.variant_id);
            const d = await Discount.findOne({
                code: discountCode,
                productID: String(it.product_id),
                status: "active",
            });

            if (d) {
                const price = variant.price * it.quantity;
                if (d.discount_type === "%") {
                    discountAmount += price * (Number(d.discount_value) / 100);
                } else {
                    discountAmount += Number(d.discount_value);
                }
            }
        }
    }

    const total = Math.max(
        0,
        subtotal + Number(shipping_fee) - discountAmount
    );

    if (wallet.balance < total) {
        throw createError(400, "Số dư không đủ. Vui lòng nạp thêm tiền");
    }


    // ===== 3. TẠO ORDER (CHƯA TRỪ KHO) =====
    const order = await Order.create({
        user_id: userId,
        items,
        subtotal,
        shipping_fee,
        discount: { code: discountCode || "", amount: discountAmount },
        total,
        shipping_address,
        note,
        status: "Chờ xử lý",
        payment: {
            method: "wallet",
            status: "Đã thanh toán",
        },
    });

    const updatedWallet = await Wallet.findOneAndUpdate(
        { user: userId, balance: { $gte: total } },
        { $inc: { balance: -total } },
        { new: true }
    );

    if (!updatedWallet) {
        throw createError(400, "Số dư không đủ");
    } 
    await wallet.save();
    for (const it of items) {
        const updated = await Variant.findOneAndUpdate(
            { _id: it.variant_id, quantity: { $gte: it.quantity } },
            { $inc: { quantity: -it.quantity } },
            { new: true }
        );
    
        if (!updated) {
            throw createError(
                400,
                `Biến thể ${it.variant_id} không đủ số lượng để trừ kho`
            );
        }
    }
    
    return res.status(201).json({
        success: true,
        message: "Đơn hàng đã tạo",
        data: order
    });
};

export const getWalletUser = async(req, res ) => {
    const userId = req.user && req.user._id;
        if (!userId) throw createError(401, "Chưa đăng nhập");
    const wallet = await Wallet.findOne({user: userId});
    if (!wallet) {
        throw createError(400, "Không thể lấy thông tin số dư ví");
    }
    return res.status(200).json({
        message: "Lấy thông tin số dư ví thành công",
        data: wallet
    });
}

export default {createOrderWithWallet}
