import WithdrawalMethod from "../models/withDrawalMethod.model.js";
import createError from "../utils/createError.js";


export const createWithdrawalMethod = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) throw createError(401, "Chưa đăng nhập");

    const { bankName, accountNumber, accountName, isDefault } = req.body;

    if (!bankName || !accountNumber || !accountName) {
      throw createError(400, "Thiếu thông tin ngân hàng");
    }
    const existed = await WithdrawalMethod.findOne({
        user: userId,
        bankName: bankName.toUpperCase(),
        accountNumber: accountNumber.trim(),
    });

    if (existed) {
        throw createError(400, "Tài khoản ngân hàng đã tồn tại");
    }

    // Nếu tạo method mặc định → bỏ mặc định cũ
    if (isDefault) {
      await WithdrawalMethod.updateMany(
        { user: userId, isDefault: true },
        { isDefault: false }
      );
    }

    const method = await WithdrawalMethod.create({
      user: userId,
      bankName,
      accountNumber,
      accountName,
      isDefault: !!isDefault,
    });

    res.status(201).json({
      success: true,
      message: "Tạo phương thức rút tiền thành công",
      data: method,
    });
  } catch (err) {
    next(err);
  }
};


export const getWithdrawalMethods = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) throw createError(401, "Chưa đăng nhập");

    const methods = await WithdrawalMethod.find({ user: userId }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    res.json({
      success: true,
      data: methods,
    });
  } catch (err) {
    next(err);
  }
};


export const getWithdrawalMethodById = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const method = await WithdrawalMethod.findOne({
      _id: id,
      user: userId,
    });

    if (!method) throw createError(404, "Không tìm thấy phương thức rút tiền");

    res.json({
      success: true,
      data: method,
    });
  } catch (err) {
    next(err);
  }
};


export const updateWithdrawalMethod = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const { bankName, accountNumber, accountName, isDefault } = req.body;

    const method = await WithdrawalMethod.findOne({
      _id: id,
      user: userId,
    });

    if (!method) throw createError(404, "Không tìm thấy phương thức");

    // Nếu set default → reset các method khác
    if (isDefault) {
      await WithdrawalMethod.updateMany(
        { user: userId, _id: { $ne: id } },
        { isDefault: false }
      );
    }

    method.bankName = bankName ?? method.bankName;
    method.accountNumber = accountNumber ?? method.accountNumber;
    method.accountName = accountName ?? method.accountName;
    method.isDefault = isDefault ?? method.isDefault;

    await method.save();

    res.json({
      success: true,
      message: "Cập nhật phương thức rút tiền thành công",
      data: method,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteWithdrawalMethod = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { id } = req.params;

    const method = await WithdrawalMethod.findOneAndDelete({
      _id: id,
      user: userId,
    });

    if (!method) throw createError(404, "Không tìm thấy phương thức");

    res.json({
      success: true,
      message: "Xoá phương thức rút tiền thành công",
    });
  } catch (err) {
    next(err);
  }

};

export const getAllWithdrawalMethods = async (req, res) => {
    const {
      page = 1,
      limit = 10,
      user,
      bankName,
      isDefault,
    } = req.query;

    const filter = {};

    if (user) filter.user = user;
    if (bankName) filter.bankName = bankName.toUpperCase();
    if (isDefault !== undefined) filter.isDefault = isDefault === "true";

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      WithdrawalMethod.find(filter)
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),

      WithdrawalMethod.countDocuments(filter),
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
