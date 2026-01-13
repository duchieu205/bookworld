import cron from "node-cron";
import WalletTransaction from "../models/walletTransaction.model.js";

export const startWalletTransactionExpireCron = () => {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const now = new Date();

      const expiredWalletTransactions = await WalletTransaction.find({
        "status": "Chờ xử lý",
        "type": "Nạp tiền",
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
      console.log(`Cron hủy lệnh nạp tiền quá hạn chạy lúc:`, new Date().toLocaleString());

    } catch (err) {
      console.error("[CRON] Lỗi xử lý lệnh nạp tiền quá hạn:", err);
    }
  });
};
