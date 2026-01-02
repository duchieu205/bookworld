import Discount from "../models/Discount.js";
import Order from "../models/order.js";
import createError from "../utils/createError.js";

// Admin-only: create a percent-type discount with uppercase+digits code
export const createDiscount = async (req, res, next) => {
  try {
    const body = req.body || {};
    let { code, type = "percent", value, title = "", description = "", minOrderValue = 0, startsAt, endsAt, totalUsageLimit, perUserLimit = 1, applicableProducts = [] } = body;

    if (!code) return next(createError(400, "Thiếu trường 'code'"));

    // Normalize code to uppercase, trim spaces and strip leading $
    code = String(code).trim().toUpperCase().replace(/^\$/,'');

    const codeRegex = /^[A-Z0-9]+$/;
    if (!codeRegex.test(code)) return next(createError(400, "Mã giảm giá chỉ gồm chữ HOA và số, không khoảng trắng"));

    // Normalize type values (accept percent or fixed), also accept Vietnamese labels
    const t = String(type || "").trim().toLowerCase();
    if (["%", "percent", "percentage", "phan tram", "phần trăm", "phần trăm"].includes(t)) {
      type = "percent";
    } else if (["fixed", "money", "cash", "tien mat", "tiền mặt"].includes(t)) {
      type = "fixed";
    } else {
      // default to percent to be forgiving
      type = "percent";
    }

    // Coerce numeric fields: allow '15', '15%', '15 %', '50,000', '50.000đ'
    const numeric = (v) => {
      if (v === undefined || v === null) return NaN;
      return Number(String(v).replace(/[^0-9.-]+/g, ""));
    };

    value = numeric(value);
    if (Number.isNaN(value) || value <= 0) return next(createError(400, "Giá trị giảm phải là số lớn hơn 0"));
    if (type === "percent" && value > 100) return next(createError(400, "Giá trị phần trăm phải <= 100"));

    minOrderValue = numeric(minOrderValue) || 0;
    totalUsageLimit = numeric(totalUsageLimit) || undefined;
    perUserLimit = numeric(perUserLimit) || 1;

    const newDiscount = await Discount.create({ code, type, value, title, description, minOrderValue, startsAt, endsAt, totalUsageLimit, perUserLimit, applicableProducts });
    return res.success(newDiscount, "Tạo mã giảm giá thành công", 201);
  } catch (err) {
    if (err && err.code === 11000) return next(createError(400, "Mã giảm giá đã tồn tại"));
    next(err);
  }
};

// Validate a discount for a given cart (items or subtotal)
export const validateDiscount = async (req, res, next) => {
  try {
    const { code, items = [], subtotal = 0 } = req.body;
    const userId = req.user?._id;

    if (!code) return next(createError(400, "Thiếu trường 'code'"));

    const codeNorm = String(code).trim().toUpperCase().replace(/^\$/,'');
    const discount = await Discount.findOne({ code: codeNorm, status: "active" });
    if (!discount) return next(createError(404, "Mã không tồn tại hoặc không hoạt động"));

    const now = new Date();
    if (discount.startsAt && now < discount.startsAt) return next(createError(400, "Mã chưa đến hạn sử dụng"));
    if (discount.endsAt && discount.endsAt < now) return next(createError(400, "Mã đã hết hạn"));

    const limit = Number(discount.totalUsageLimit);
    if (Number.isFinite(limit) && discount.usedCount >= limit) return next(createError(400, "Mã đã đạt giới hạn sử dụng"));

    if (discount.perUserLimit && userId) {
      // Count only successful/paid orders so pending or cancelled attempts don't consume the per-user limit
      const successStatuses = ['Đã xác nhận','Giao hàng thành công','Hoàn tất','confirmed'];
      const usedByUser = await Order.countDocuments({
        "discount.code": discount.code,
        user_id: userId,
        $or: [
          { status: { $in: successStatuses } },
          { "payment.status": { $in: ['paid','Đã thanh toán'] } }
        ]
      });
      if (usedByUser >= discount.perUserLimit) return next(createError(400, "Bạn đã đạt giới hạn sử dụng mã này"));
    }

    if (discount.minOrderValue && subtotal < discount.minOrderValue) return next(createError(400, `Đơn hàng cần tối thiểu ${discount.minOrderValue}`));

    // Compute applicable subtotal if applicableProducts specified
    let applicableSubtotal = subtotal;
    if (Array.isArray(discount.applicableProducts) && discount.applicableProducts.length > 0 && Array.isArray(items) && items.length > 0) {
      applicableSubtotal = 0;
      for (const item of items) {
        if (discount.applicableProducts.map(p => String(p)).includes(String(item.product_id))) {
          applicableSubtotal += (Number(item.price) || 0) * (Number(item.quantity) || 0);
        }
      }
    }

    let amount = 0;
    if (discount.type === "percent") {
      amount = applicableSubtotal * (discount.value / 100);
    } else {
      amount = discount.value;
    }

    amount = Math.max(0, Math.min(amount, applicableSubtotal));

    // Helpful message when amount is zero
    let message = "Hợp lệ";
    if (amount === 0) {
      if (Array.isArray(discount.applicableProducts) && discount.applicableProducts.length > 0) {
        message = "Không có sản phẩm nào trong giỏ hàng áp dụng mã này";
      } else if (subtotal === 0) {
        message = "Giỏ hàng rỗng";
      } else {
        message = "Không có khoản giảm (có thể do giá trị áp dụng bằng 0)";
      }
    }

    return res.json({ success: true, valid: amount > 0, amount, message, discount: { code: discount.code, type: discount.type, value: discount.value, title: discount.title || "", description: discount.description || "" } });
  } catch (err) {
    next(err);
  }
};

export const getDiscount = async (req, res, next) => {
  try {
    const { code, status } = req.query;
    if (code) {
      const codeNorm = String(code).trim().toUpperCase().replace(/^\$/,'');
      const discount = await Discount.findOne({ code: codeNorm });
      if (!discount) return next(createError(404, "Không tìm thấy mã giảm giá"));
      return res.json({ success: true, data: discount });
    }

    const filter = {};
    if (status) filter.status = status;
    const discounts = await Discount.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, data: discounts });
  } catch (err) {
    next(err);
  }
};

export const deleteDiscount = async (req, res, next) => {
  try {
    let { code, id } = req.body;
    if (!code && !id) return next(createError(400, "Cần cung cấp 'code' hoặc 'id' để xóa"));

    if (code) code = String(code).trim().toUpperCase().replace(/^\$/,'');

    let deleted = null;
    if (id) {
      deleted = await Discount.findByIdAndDelete(id);
    } else {
      deleted = await Discount.findOneAndDelete({ code });
    }

    if (!deleted) return next(createError(404, "Không tìm thấy mã để xóa"));

    return res.json({ success: true, message: "Xóa mã giảm giá thành công" });
  } catch (err) {
    next(err);
  }
};

export const getDiscountById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(createError(400, "Thiếu id"));
    const discount = await Discount.findById(id);
    if (!discount) return next(createError(404, "Không tìm thấy mã giảm giá"));
    return res.json({ success: true, data: discount });
  } catch (err) {
    next(err);
  }
};

export const updateDiscount = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return next(createError(400, "Thiếu id"));

    // reuse normalization from create
    const body = req.body || {};
    let { code, type, value, title, description, minOrderValue = 0, startsAt, endsAt, totalUsageLimit, perUserLimit = 1, applicableProducts = [], status } = body;

    const updates = {};

    if (code !== undefined) {
      code = String(code).trim().toUpperCase().replace(/^\$/,'');
      const codeRegex = /^[A-Z0-9]+$/;
      if (!codeRegex.test(code)) return next(createError(400, "Mã giảm giá chỉ gồm chữ HOA và số, không khoảng trắng"));
      updates.code = code;
    }

    if (type !== undefined) {
      const t = String(type).trim().toLowerCase();
      if (["%","percent","percentage","phan tram","phần trăm"].includes(t)) updates.type = "percent";
      else updates.type = "fixed";
    }

    // Treat empty string or null as "not provided" so frontend doesn't wipe the existing value
    const hasValue = value !== undefined && value !== null && value !== '';
    if (hasValue) {
      const numeric = (v) => {
        if (v === undefined || v === null) return NaN;
        return Number(String(v).replace(/[^0-9.-]+/g, ""));
      };
      const vNum = numeric(value);
      if (Number.isNaN(vNum) || vNum <= 0) return next(createError(400, "Giá trị giảm phải là số lớn hơn 0"));

      // Determine whether the discount's type is percent (either newly set or existing)
      const isPercent = (updates.type === "percent") || (updates.type === undefined && String((await Discount.findById(id)).type) === "percent");
      if (isPercent && vNum > 100) return next(createError(400, "Giá trị phần trăm phải <= 100"));

      updates.value = vNum;
    } else if (updates.type === "percent") {
      // If admin switches type to percent but doesn't provide a new value, verify the existing value is valid
      const existing = await Discount.findById(id);
      if (!existing) return next(createError(404, "Không tìm thấy mã để cập nhật"));
      if (existing.type !== "percent" && existing.value > 100) {
        return next(createError(400, "Mã hiện có giá trị >100%. Vui lòng cung cấp 'value' <= 100 khi đổi sang percent"));
      }
    }

    if (minOrderValue !== undefined) updates.minOrderValue = Number(String(minOrderValue).replace(/[^0-9.-]+/g, "")) || 0;
    if (startsAt !== undefined) updates.startsAt = startsAt;
    if (endsAt !== undefined) updates.endsAt = endsAt;
    if (totalUsageLimit !== undefined) updates.totalUsageLimit = Number(totalUsageLimit) || undefined;
    if (perUserLimit !== undefined) updates.perUserLimit = Number(perUserLimit) || 1;
    if (applicableProducts !== undefined) updates.applicableProducts = applicableProducts;
    if (status !== undefined) updates.status = status;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;

    const updated = await Discount.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!updated) return next(createError(404, "Không tìm thấy mã để cập nhật"));

    return res.json({ success: true, message: "Cập nhật mã giảm giá thành công", data: updated });
  } catch (err) {
    if (err && err.code === 11000) return next(createError(400, "Mã giảm giá đã tồn tại"));
    next(err);
  }
};

export default { createDiscount, validateDiscount, getDiscount, deleteDiscount, getDiscountById, updateDiscount };