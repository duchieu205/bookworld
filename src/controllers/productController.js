import Product from "../models/Product.js";
import createError from "../utils/createError.js";
import mongoose from "mongoose";
import Variant from "../models/variant.js";
import Category from "../models/Category.js";
import Review from "../models/Review.js";

export const createProduct = async (req, res) => {
  const body = req.body;

  console.log("Create product body:", body);

  if (!body.slug && body.name) {
    let slug = body.name
      .toLowerCase()
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const existing = await Product.findOne({ slug });
    if (existing) {
      slug += '-' + Date.now();
    }
    body.slug = slug;
  }

  if (body.category && !mongoose.Types.ObjectId.isValid(body.category)) {
    return res.status(400).json({ success: false, message: "Invalid category ID" });
  }

  body.quantity = Number(body.quantity || 0);
  body.status = body.status ?? true;
  body.price = Number(body.price || 0);
  body.weight = Number(body.weight || 0);
  body.namxuatban = Number(body.namxuatban || 0);
  body.sotrang = Number(body.sotrang || 0);
  body.images = body.images || [];

  try {
    const product = await Product.create(body);
    return res.status(201).json({
      success: true,
      message: "Product created",
      data: product
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: "Duplicate product slug" });
    }
    console.error(err);
    if (err.name === "CastError" || err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get list of products with simple pagination and filtering
export const getProducts = async (req, res) => {
  const { page = 1, limit, search, category, status, sort, minPrice, maxPrice, minRating, author } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const lim = limit !== undefined ? Number(limit) : null;
  const usePagination = lim > 0;

  const match = {};
  const isAdmin = req.isAdminRequest === true;


  if (!isAdmin) {
    match.status = "active";
  }

  if (isAdmin && status) {
    match.status = status;
  }
  if (search) {
    match.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (category) match.category = new mongoose.Types.ObjectId(category);
  
  
  if (author) {
    match.author = { $regex: author, $options: "i" };
  }

  const pipeline = [
    { $match: match },
    
    // Lookup reviews
    {
      $lookup: {
        from: "reviews",
        let: { productId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$product", "$$productId"] },
                  { $eq: ["$status", "approved"] }
                ]
              }
            }
          }
        ],
        as: "reviews"
      }
    },

    // Add averageRating và reviewCount
    {
      $addFields: {
        averageRating: {
          $cond: [
            { $gt: [{ $size: "$reviews" }, 0] },
            { $avg: "$reviews.rating" },
            0
          ]
        },
        reviewCount: { $size: "$reviews" }
      }
    },

    // Lookup variants
    {
      $lookup: {
        from: "variants",
        let: { productId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$product_id", "$$productId"] },
                  { $eq: ["$status", "active"] },
                  { $gt: ["$quantity", 0] }
                ]
              }
            }
          }
        ],
        as: "variants",
      },
    },

    // Tính giá hiển thị
    {
      $addFields: {
        softCover: {
          $first: {
            $filter: {
              input: "$variants",
              as: "v",
              cond: { $eq: ["$$v.type", "Bìa mềm"] }
            }
          }
        },
        minVariantPrice: {
          $cond: [
            { $gt: [{ $size: "$variants" }, 0] },
            { $min: "$variants.price" },
            null
          ]
        }
      }
    },

    {
      $addFields: {
        displayPrice: {
          $cond: [
            { $gt: ["$softCover.price", 0] },
            "$softCover.price",
            "$minVariantPrice"
          ]
        }
      }
    },

    // FILTER THEO GIÁ
    {
      $match: {
        $or: [
          { minVariantPrice: null },
          {
            $and: [
              { minVariantPrice: { $ne: null } },
              { minVariantPrice: { $gte: minPrice ? Number(minPrice) : 0 } },
              { minVariantPrice: { $lte: maxPrice ? Number(maxPrice) : 999999999 } }
            ]
          }
        ]
      }
    },

    // FILTER THEO RATING
    ...(minRating ? [{
      $match: {
        averageRating: { $gte: Number(minRating) }
      }
    }] : []),

    // Remove temporary fields
    {
      $project: {
        reviews: 0,
        variants: 0,
        softCover: 0,
        minVariantPrice: 0
      }
    },
  ];

  // XÁC ĐỊNH SORT
  let sortOption = { createdAt: -1, _id: 1 };
  
  if (sort === "price-asc") sortOption = { displayPrice: 1, _id: 1 };
  else if (sort === "price-desc") sortOption = { displayPrice: -1, _id: 1 };
  else if (sort === "rating") sortOption = { averageRating: -1, reviewCount: -1, _id: 1 };
  else if (sort === "name-asc") sortOption = { name: 1, _id: 1 };
  else if (sort === "newest") sortOption = { createdAt: -1, _id: 1 };

  // Add sort + pagination
  pipeline.push(
    { $sort: sortOption },
    ...(usePagination ? [
      { $skip: (pageNum - 1) * lim },
      { $limit: lim },
    ] : [])
  );

  // Execute
  const [items, totalArr] = await Promise.all([
    Product.aggregate(pipeline),
    Product.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "variants",
          let: { productId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$product_id", "$$productId"] },
                    { $eq: ["$status", "active"] },
                    { $gt: ["$quantity", 0] }
                  ]
                }
              }
            }
          ],
          as: "variants",
        },
      },
      {
        $addFields: {
          minVariantPrice: {
            $cond: [
              { $gt: [{ $size: "$variants" }, 0] },
              { $min: "$variants.price" },
              null
            ]
          }
        }
      },
      // FILTER THEO GIÁ
      {
        $match: {
          $or: [
            { displayPrice: null },
            {
              $and: [
                { displayPrice: { $ne: null } },
                { displayPrice: { $gte: minPrice ? Number(minPrice) : 0 } },
                { displayPrice: { $lte: maxPrice ? Number(maxPrice) : 999999999 } }
              ]
            }
          ]
        }
      },
      { $count: "total" },
    ]),
  ]);

  const total = totalArr[0]?.total || 0;

  await Product.populate(items, { path: "category" });

  return res.success(
    { items, total, page: pageNum, limit: lim },
    "Products retrieved",
    200
  );
};

export const getAuthors = async (req, res) => {
  try {
    const authors = await Product.distinct("author");
    const sortedAuthors = authors.filter(a => a && a.trim()).sort();
    
    return res.success(
      sortedAuthors,
      "Authors retrieved",
      200
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get product detail by id
export const getProductById = async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  try {
    // Lấy product và populate category
    const product = await Product.findOne({_id: id,status: "active"}).populate("category");

    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    // Lấy variants của sản phẩm
    const variant = await Variant.find({ product_id: id, status: "active" });
    // if (variant.length === 0) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "Product is currently unavailable"
    //   });
    // }
    // Lấy review đã được admin duyệt
    const reviews = await Review.find({ product: id, status: "approved" })
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Product with variants, category and reviews retrieved",
      data: {
        product,
        variant,
        category: product.category,
        reviews
      }
    });
  } catch (err) {
    next(err);
  }
};

// Update product status
export const updateProductStatus = async (req, res) => {
  console.log("PARAM ID:", req.params.id);
  console.log("REQ BODY:", req.body);
  const { id } = req.params;
  const {status} = req.body;

  if (!["active", "inactive"].includes(status)) {
    throw createError(400, "Trạng thái không hợp lệ");
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  const product = await Product.findByIdAndUpdate(id, {status}, {new: true});
  if (!product) throw createError(404, "Product not found");
  return res.success(product, "Product updated", 200);
};

export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  

  const product = await Product.findByIdAndUpdate(id, updates, {new: true});
  if (!product) throw createError(404, "Product not found");
  return res.success(product, "Product updated", 200);
};

// Delete product
export const deleteProduct = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid product ID" });
  }

  const product = await Product.findByIdAndDelete(id);
  if (!product) throw createError(404, "Product not found");
  return res.success(product, "Product deleted", 200);
};

export const searchProducts = async (req, res) => {
  try {
    const { q } = req.query; // query string: ?q=keyword

    if (!q) return res.status(400).json({ message: "Vui lòng nhập từ khóa" });

    // tìm sản phẩm tên chứa từ khóa, không phân biệt hoa thường
    const products = await Product.find({
      name: { $regex: q, $options: "i" } // "i" = ignore case
    });

    res.json({ results: products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

export const getRelatedProducts = async (req, res) => {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
        return res.status(404).json({ message: "Product not found" });
    }

    const related = await Product.find({
        category: product.category,
        _id: { $ne: id }
    })
    .populate("category")  
    .limit(6);

    return res.json({ data: related });
};
export default {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  searchProducts,
  getRelatedProducts,
  getAuthors,
  updateProductStatus
};
