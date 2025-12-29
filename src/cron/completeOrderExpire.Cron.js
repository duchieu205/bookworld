import cron from "node-cron";
import Order from "../models/order.js";

const RETURN_DAYS = 3;
export const completeOrderExpriceCron = () => {
cron.schedule("0 * * * *", async () => {
  try {
    const now = new Date();
    const deadline = new Date(
      now.getTime() - RETURN_DAYS * 24 * 60 * 60 * 1000
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
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Auto completed ${result.modifiedCount} orders`);
    }
  } catch (err) {
    console.error("Cron auto complete order error:", err);
  }
})
};
