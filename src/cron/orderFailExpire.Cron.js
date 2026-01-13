import cron from "node-cron";
import Order from "../models/order.js";
import Wallet from "../models/wallet.js";
import WalletTransaction from "../models/walletTransaction.model.js";
import Variant from "../models/variant.js";


export const orderFailExpireCron = () => {
    cron.schedule("*/5 * * * *", async () => {
    try {
        const orders = await Order.find({
        status: "Giao hàng không thành công",
        auto_cancelled: { $ne: true },
        });

        for (const order of orders) {
        const failCount = order.status_logs.filter(
            l => l.status === "Giao hàng không thành công"
        ).length;

        if (failCount < 2) continue;

        /* =====================
            HOÀN TỒN KHO
        ===================== */
        for (const item of order.items) {
            if (item.variant_id) {
            await Variant.findByIdAndUpdate(item.variant_id, {
                $inc: { quantity: item.quantity },
            });
            }
        }
        if (order.payment.method === "wallet" || order.payment.method === "vnpay" ) {
            const wallet = await Wallet.findOne({ user: order.user_id });
            wallet.balance += order.total;
            await wallet.save();

            await WalletTransaction.create({
                wallet: wallet._id,
                user: order.user_id,
                type: "Hoàn tiền",
                status: "Thành công",
                amount: order.total,
                description: `Hoàn tiền đơn ${order._id} - do giao hàng thất bại`,
            });
        }
        /* =====================
            UPDATE ORDER
        ===================== */
        order.status = "Tự động hủy đơn do giao hàng thất bại sau 2 lần. Đơn hàng sẽ được hoàn tiền nếu quý khách hành đã thanh toán với ví hoặc VnPay";
        order.auto_cancelled = true;

        order.status_logs.push({
            status: order.status,
            note: "Tự động hủy đơn do giao hàng thất bại sau 2 lần. Đơn hàng sẽ được hoàn tiền nếu quý khách hành đã thanh toán với ví hoặc VnPay",
            updatedBy: null,
        });

        order.status = "Đã hủy";
        order.status_logs.push({
            status: order.status,
            note: "Cron tự động hủy đơn sau 2 lần giao hành không thành công",
            updatedBy: null,
        });

        await order.save();
        console.log("CRON tự động hủy đơn hàng sau 2 lần giao hàng không thành công", new Date().toLocaleString());
    
      }
    } catch (err) {
        console.error("CRON auto-cancel error:", err);
    }
    })
};
