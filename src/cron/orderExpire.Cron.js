import cron from "node-cron";
import Order from "../models/order.js";
import Variant from "../models/variant.js"
export const startOrderExpireCron = () => {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();

      const expiredOrders = await Order.find({
        status: { $ne: "Đã hủy" },
        "payment.status": "Chưa thanh toán",
         "payment.method": "vnpay",
        expiredAt: { $lt: now }
      });

     for (const order of expiredOrders) {
        for (const item of order.items) {
          if (item.variant_id) {
            await Variant.findByIdAndUpdate(
              item.variant_id,
              { $inc: { quantity: item.quantity } }
            );
          }
        } 
        order.status = "Đã hủy";
        order.payment.status = "Thất bại";
        order.status_logs = order.status_logs || [];
        order.status_logs.push({
          status: order.status,
          note: `Cron tự động hủy đơn do khách hàng không thanh toán`,
          updatedAt: new Date(),
        });
        await order.save();
      }
    
      if (expiredOrders.length) {
        const ids = expiredOrders.map(o => o._id).join(", ");
        console.log(
          `[CRON] Đã hủy ${expiredOrders.length} đơn quá hạn. IDs: ${ids}`
        );
      }
      console.log(`Cron hủy đơn hàng chưa thanh toán với VnPay chạy lúc:`, new Date().toLocaleString());

    } catch (err) {
      console.error("[CRON] Lỗi xử lý đơn quá hạn:", err);
    }
  });
};
