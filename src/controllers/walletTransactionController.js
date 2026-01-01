import { VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat } from "vnpay";
import crypto from "crypto";
import createError from "../utils/createError.js";
import WalletTransaction from "../models/walletTransaction.model.js";
import Wallet from "../models/wallet.js";
  export const verifyVnPayChecksum = (query, secretKey) => {
      const params = { ...query };
      const secureHash = params.vnp_SecureHash;

      delete params.vnp_SecureHash;
      delete params.vnp_SecureHashType;

      const sortedKeys = Object.keys(params).sort();

      const signData = sortedKeys
        .map(
          (key) =>
            `${key}=${encodeURIComponent(params[key]).replace(/%20/g, "+")}`
        )
        .join("&");

      const signed = crypto
        .createHmac("sha512", secretKey)
        .update(signData)
        .digest("hex");

      return signed === secureHash;
  };

  export const createTopUpVnPay = async(req, res) => {
      const userId = req.user && req.user._id;
      if (!userId) throw createError(401, "Chưa đăng nhập");
      const {amount} = req.body;
      if (!amount || amount <= 5000) {
        return res.status(400).json({ message: "Vui lòng nạp trên 5.000Đ" });
      }   
      let wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
      wallet = await Wallet.create({
          user: userId,
          balance: 0,
          status: "active",
      });
      }
      const balance = await WalletTransaction.create({
          wallet: wallet._id,
          user: userId,
          type: "Nạp tiền",
          amount,
          status: "Chờ xử lý",
          description: "Nạp tiền qua ví VNPAY"
      })
      
      const vnpay = new VNPay({
              tmnCode: process.env.VNP_TMN_CODE,
              secureSecret: process.env.VNP_HASH_SECRET,
              vnpayHost: "https://sandbox.vnpayment.vn",
              testMode: true,
              loggerFn: ignoreLogger,
          });
      
          // ===== 4. TẠO LINK THANH TOÁN VNPay =====
          const expire = new Date();
          expire.setMinutes(expire.getMinutes() + 15);
          
          const paymentUrl = await vnpay.buildPaymentUrl({
              vnp_Amount: amount,
              vnp_IpAddr:"127.0.0.1",
              vnp_TxnRef: balance._id.toString(),
              vnp_OrderInfo: `Giao dich`,
              vnp_OrderType: "billpayment",
              vnp_ReturnUrl: `http://localhost:${process.env.PORT}/api/walletTransaction/result`,
              // vnp_IpnUrl: process.env.VNP_IPN_URL, 
              vnp_Locale: "vn",
              vnp_BankCode: "VNBANK",
              vnp_CreateDate: dateFormat(new Date()),
              vnp_ExpireDate: dateFormat(expire),
          });
          
      console.log("VNPay paymentUrl:", paymentUrl);
          return res.status(201).json({
              success: true,
              message: "Tạo lệnh nạp tiền thành công",
              data: {
                  balance,
                  paymentUrl,
              },
          });

      
  }

    export const vnpayReturn = async (req, res) => {
      try {
        console.log("🔄 VNPay callback received:", req.query);
        
        const params = req.query;

        // Verify checksum
        const isValid = verifyVnPayChecksum(
          params,
          process.env.VNP_HASH_SECRET
        );

        if (!isValid) {
          console.error("❌ Checksum không hợp lệ");
          return res.redirect(`${process.env.FRONTEND_URL}/user-profile`);
        }

        const { 
          vnp_ResponseCode, 
          vnp_TxnRef, 
          vnp_Amount, 
          vnp_TransactionNo,
          vnp_BankCode 
        } = params;
        const transaction = await WalletTransaction.findById(vnp_TxnRef);
        if (!transaction) {
          return res.status(404).json({ message: "Không tìm thấy giao dịch" });
        }
        if (Number(vnp_Amount) !== transaction.amount * 100) {
            return res.redirect(`${process.env.FRONTEND_URL}/user-profile`);
        }

        if (transaction.status !== "Chờ xử lý") {
            return res.redirect(`${process.env.FRONTEND_URL}/user-profile`);
        }

        if (vnp_ResponseCode === "00") {
          // Thành công
          const wallet = await Wallet.findById(transaction.wallet);

          wallet.balance += transaction.amount;
          await wallet.save();

          transaction.status = "Thành công";
          await transaction.save();

          return res.redirect(`${process.env.FRONTEND_URL}/user-profile`);
        } 
        else {
            transaction.status = "Thất bại";
            await transaction.save();

            return res.redirect(`${process.env.FRONTEND_URL}/user-profile`);
      
        }

        
        
      } catch (err) {
        console.error("❌ VNPay return fatal error:", err);
        return res.redirect(`${process.env.FRONTEND_URL}/user-profile`);
      }
    };

    

  export const withdrawFromWallet = async (req, res) => {
  const userId = req.user?._id;
  const { amount, withdrawalMethodId } = req.body;

  if (!amount || amount <= 0)
    return res.status(400).json({ message: "Số tiền không hợp lệ" });

  const wallet = await Wallet.findOne({ user: userId });
  if (!wallet)
    return res.status(404).json({ message: "Ví không tồn tại" });

  if (wallet.balance < amount)
    return res.status(400).json({ message: "Số dư không đủ" });

  const transaction = await WalletTransaction.create({
    wallet: wallet._id,
    user: userId,
    type: "Rút tiền",
    status: "Chờ xử lý",
    amount,
    withdrawalMethod: withdrawalMethodId,
    description: "Rút tiền từ ví"
  });

  return res.status(201).json({
    success: true,
    message: "Yêu cầu rút tiền đã được gửi, chờ admin duyệt",
    transaction,
  });
};


   export const approveWithdraw = async (req, res) => {
  const { transactionId } = req.params;

  const transaction = await WalletTransaction.findById(transactionId);
  if (!transaction)
    return res.status(404).json({ message: "Không tìm thấy giao dịch" });

  if (transaction.type !== "Rút tiền")
    return res.status(400).json({ message: "Giao dịch không hợp lệ" });

  if (transaction.status !== "Chờ xử lý")
    return res.status(400).json({ message: "Giao dịch đã được xử lý" });

  const wallet = await Wallet.findById(transaction.wallet);
  if (!wallet)
    return res.status(404).json({ message: "Không tìm thấy ví" });

  if (wallet.balance < transaction.amount)
    return res.status(400).json({ message: "Số dư không đủ để duyệt rút" });

  
  wallet.balance -= transaction.amount;
  await wallet.save();

  transaction.status = "Thành công";
  await transaction.save();

  return res.json({
    success: true,
    message: "Duyệt rút tiền thành công",
  });
};

    export const getAllWalletTransactions = async (req, res) => {
      const {
        page = 1,
        limit = 10,
        status,
        type,
        user,
        order,
        dateFrom,
        dateTo,
      } = req.query;

      const filter = {};

      if (status) filter.status = status;
      if (type) filter.type = type;
      if (user) filter.user = user;
      if (order) filter.order = order;

      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }

      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        WalletTransaction.find(filter)
          .populate("user", "name email")
          .populate("wallet")
          .populate("order", "total status")
          .populate("withdrawalMethod")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),

        WalletTransaction.countDocuments(filter),
      ]);

      return res.json({
        success: true,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
        data,
      });
    };
export const getMyWalletTransactions = async (req, res) => {
  const userId = req.user._id;

  const { page = 1, limit = 10 } = req.query;

  const filter = { user: userId };

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    WalletTransaction.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};



export default {
    createTopUpVnPay,
    vnpayReturn,
    withdrawFromWallet,
    approveWithdraw,
    getAllWalletTransactions,
    getMyWalletTransactions
}