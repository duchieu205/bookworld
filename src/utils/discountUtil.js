import Discount from '../models/Discount.js';
import Variant from '../models/variant.js';
import Product from '../models/Product.js';
import Order from '../models/order.js';
import createError from './createError.js';

export async function computeDiscountForItems({ items = [], discountCode, userId } = {}) {
  // Build line items and subtotal
  const lineItems = [];
  let subtotal = 0;

  for (const it of items) {
    const { product_id, variant_id, quantity } = it;
    let price = 0;
    if (variant_id) {
      const v = await Variant.findById(variant_id);
      price = v ? v.price : 0;
    } else {
      const p = await Product.findById(product_id);
      price = p ? p.price : 0;
    }
    const itemSubtotal = (Number(price) || 0) * (Number(quantity) || 0);
    subtotal += itemSubtotal;
    lineItems.push({ product_id, variant_id, quantity, price, itemSubtotal });
  }

  let discountAmount = 0;
  let appliedDiscount = null;
  let appliedItems = [];

  if (discountCode) {
    const code = String(discountCode || '').trim().toUpperCase().replace(/^\$/,'');
    const discount = await Discount.findOne({ code, status: 'active' });
    if (!discount) throw createError(400, 'Mã giảm giá không tồn tại hoặc không hoạt động');

    const now = new Date();
    if (discount.startsAt && now < discount.startsAt) throw createError(400, 'Mã chưa đến hạn sử dụng');
    if (discount.endsAt && discount.endsAt < now) throw createError(400, 'Mã đã hết hạn');

    const limit = Number(discount.totalUsageLimit);
    if (Number.isFinite(limit) && discount.usedCount >= limit) throw createError(400, 'Mã đã đạt giới hạn sử dụng');

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
      if (usedByUser >= discount.perUserLimit) throw createError(400, 'Bạn đã đạt giới hạn sử dụng mã này');
    }

    if (discount.minOrderValue && subtotal < discount.minOrderValue) throw createError(400, `Đơn hàng cần tối thiểu ${discount.minOrderValue}`);

    // compute applicable subtotal
    let applicableSubtotal = subtotal;
    const hasScope = Array.isArray(discount.applicableProducts) && discount.applicableProducts.length > 0;
    if (hasScope) {
      applicableSubtotal = 0;
      for (const li of lineItems) {
        if (discount.applicableProducts.map(p => String(p)).includes(String(li.product_id))) {
          applicableSubtotal += li.itemSubtotal;
        }
      }
    }

    if (discount.type === 'percent') {
      discountAmount = Math.round(applicableSubtotal * (Number(discount.value) / 100));
      // per item percent distribution
      appliedItems = lineItems
        .filter(li => !hasScope || discount.applicableProducts.map(p => String(p)).includes(String(li.product_id)))
        .map(li => ({ product_id: li.product_id, itemSubtotal: li.itemSubtotal, discountAmount: Math.round(li.itemSubtotal * (Number(discount.value) / 100)) }));
    } else {
      discountAmount = Math.round(Number(discount.value));
      // distribute fixed discount proportionally across applicable items
      const applicableLines = hasScope ? lineItems.filter(li => discount.applicableProducts.map(p => String(p)).includes(String(li.product_id))) : lineItems;
      const totalApplicable = applicableLines.reduce((s, x) => s + x.itemSubtotal, 0) || 1;
      let running = 0;
      appliedItems = applicableLines.map((li, idx) => {
        const share = Math.round((li.itemSubtotal / totalApplicable) * discountAmount);
        running += share;
        if (idx === applicableLines.length - 1 && running !== discountAmount) {
          const correction = discountAmount - running;
          return { product_id: li.product_id, itemSubtotal: li.itemSubtotal, discountAmount: share + correction };
        }
        return { product_id: li.product_id, itemSubtotal: li.itemSubtotal, discountAmount: share };
      });
    }

    discountAmount = Math.max(0, Math.min(discountAmount, subtotal));
    appliedDiscount = discount;
  }

  return { subtotal, discountAmount, appliedDiscount, appliedItems, lineItems };
}
