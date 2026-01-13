import cron from "node-cron";
import WalletTransaction from "../models/walletTransaction.model.js";

export const startWalletTransactionExpireCron = () => {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();
     const result = await WalletTransaction.updateMany(
        {
          status: "Chờ xử lý",
          type: "Nạp tiền",
          expiredAt: { $lt: now },
        },
        {
          $set: {
            status: "Thất bại",
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount > 0) {
        console.log(
          `[CRON] Đã huỷ ${result.modifiedCount} lệnh nạp tiền quá hạn`
        );
      }

    } catch (err) {
      console.error("[CRON] Lỗi xử lý lệnh nạp tiền quá hạn:", err);
    }
  });
};
