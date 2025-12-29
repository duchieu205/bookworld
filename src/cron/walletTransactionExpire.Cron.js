import cron from "node-cron";
import WalletTransaction from "../models/walletTransaction.model.js";

export const startWalletTransactionExpireCron = () => {
  cron.schedule("*/1 * * * *", async () => {
    try {
      const now = new Date();

      const expiredWalletTransactions = await WalletTransaction.find({
        "status": "Chờ xử lý",
        expiredAt: { $lt: now }
      });

      for (const walletTransaction of expiredWalletTransactions) {
        walletTransaction.status = "Thất bại";

        await walletTransaction.save();
      }

      if (expiredWalletTransactions.length) {
        console.log(
          `[CRON] Đã cập nhật ${expiredWalletTransactions.length} lệnh nạp tiền quá hạn thanh toán`
        );
      }
    } catch (err) {
      console.error("[CRON] Lỗi xử lý lệnh nạp tiền quá hạn:", err);
    }
  });
};
