import cron from "node-cron";
import Order from "../models/order.js";

const RETURN_MINUTES = 5;

export const completeOrderExpireCron = () => {
  // Chạy mỗi 5 phút
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();
      const deadline = new Date(
        now.getTime() - RETURN_MINUTES * 60 * 1000
      );

      const result = await Order.updateMany(
        {
          status: "Giao hàng thành công",
          delivered_at: { $lte: deadline },
        },
        {
          $set: {
            status: "Hoàn tất",
          },
           $push: {
            status_logs: {
              status: "Hoàn tất",
              note: `Tự động hoàn tất sau ${RETURN_MINUTES} phút`,
              updatedAt: new Date(),
            },
          },
        }
      );
   

 
      if (result.modifiedCount > 0) {
        console.log(`⏱ Auto completed ${result.modifiedCount} orders`);
      }
      console.log(`Cron hoàn tất đơn hàng chạy lúc:`, new Date().toLocaleString());

    } catch (err) {
      console.error("❌ Cron auto complete order error:", err);
    }
  });
};
