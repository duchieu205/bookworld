import mongoose from "mongoose";
import slugify from "slugify";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    author: {
      type: String,
      required: true
    },
    namxuatban: {
      type: Number,
      required: true
    },
    nhaxuatban: {
      type: String,
      required: true
    },
    sotrang: {
      type: Number,
      required: true
    },
    slug: {
      type: String,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    images: {
      type: [String],
      default: [],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    weight: {
      type: Number, // gram
      default: 0
    },
    size: {
      type: String, // ví dụ: "20 x 13 x 2 cm"
      default: ""
    },

    sku: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ⭐ Tự động tạo slug từ name (trước khi lưu)
productSchema.pre("save", function (next) {
  if (!this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

const Product = mongoose.model("Product", productSchema);

export default Product;
