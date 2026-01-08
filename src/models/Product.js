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
      type: Number, 
      default: 0
    },
    status: {
    type: Boolean,
    default: true, 
  },
    size: {
      type: String, 
      default: ""
    },

    sku: {
      type: String,
      default: "",
    },
    defaultVariant: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Variant",
}
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Tự động tạo slug từ name (trước khi lưu)
productSchema.pre("save", function (next) {
  if (!this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

// virtual populate variants
productSchema.virtual("variants", {
  ref: "Variant",
  localField: "_id",
  foreignField: "product_id",
});

// để khi trả JSON có variants
productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

const Product = mongoose.model("Product", productSchema);

export default Product;
