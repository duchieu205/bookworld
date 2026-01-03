import cron from "node-cron";
import Order from "../models/order.js";

export const startOrderExpireCron = () => {
  cron.schedule("*/1 * * * *", async () => {
    try {
      const now = new Date();

      const expiredOrders = await Order.find({
        status: { $ne: "Đã hủy" },
        "payment.status": "Chưa thanh toán",
         "payment.method": { $in: ["wallet", "vnpay"] },
        expiredAt: { $lt: now }
      });

      for (const order of expiredOrders) {
        order.status = "Đã hủy";
        order.payment.status = "Thất bại";
        await order.save();
      }

      if (expiredOrders.length) {
        console.log(
          `[CRON] Đã cập nhật ${expiredOrders.length} đơn quá hạn thanh toán
          ID: ${expiredOrders._id}`
       
        );
      }
    } catch (err) {
      console.error("[CRON] Lỗi xử lý đơn quá hạn:", err);
    }
  });
};
