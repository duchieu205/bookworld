import mongoose from 'mongoose'

const cartItemSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variant_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant' },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false })

const cartSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [cartItemSchema],
}, { timestamps: true })

export default mongoose.model('Cart', cartSchema)
