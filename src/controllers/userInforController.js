import User from "../models/User.js";
import createError from "../utils/createError.js";
import Favourite from "../models/favourite.js";
import Info from "../models/info.js";
import Wallet from "../models/wallet.js"
export const getInfo = async (req, res) => {
    try {
        const userId = req.user && (req.user._id || req.user.userId);
        if (!userId) throw createError(401, "Chưa đăng nhập");

        // Lấy info cá nhân
        const info = await Info.findOne({ user_id: userId });

        // Lấy tên từ bảng User
        const user = await User.findById(userId).select("name email createdAt");
        const wallet = await Wallet.findOne({ user: userId }).select("status");
        return res.status(200).json({
            success: true,
            message: "Lấy thông tin cá nhân thành công",
            data: {
                name: user.name,
                email: user.email,
                createAt: user.createdAt,
                status: wallet.status,
                ...info?._doc      
            }
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
};

export const updateInfo = async (req, res) => {
    try {
        const userId = req.user && (req.user._id || req.user.userId);
        if (!userId) throw createError(401, "Chưa đăng nhập");

        const { email, avatar, address, phone, name } = req.body;

        const personalUpdate = {};
        if (avatar !== undefined) personalUpdate.avatar = avatar;
        if (address !== undefined) personalUpdate.address = address;
        if (phone !== undefined) personalUpdate.phone = phone;

        let personalInfo = await Info.findOneAndUpdate(
            { user_id: userId },
            { $set: personalUpdate },
            { new: true, upsert: true }
        );
        const userUpdate = {};
        if (name !== undefined) userUpdate.name = name;
        if (email !== undefined) userUpdate.email = email;

        let updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: userUpdate },
            { new: true }
        ).select("name email");

        return res.status(200).json({
            success: true,
            message: "Cập nhật thông tin thành công",
            data: {
                ...updatedUser._doc,
                ...personalInfo._doc
            }
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
};




export const getFavorites = async (req, res) => {
  try {
    const userId = req.user._id;

    const favourite = await Favourite.findOne({ user_id: userId })
      .populate("items.product_id"); 

    if (!favourite) return res.json([]);

    const result = favourite.items
      .filter(item => item.product_id)
      .map(item => ({
        _id: item.product_id._id,
        product: item.product_id
      }));

    return res.status(200).json(result);

  } catch (err) {
    console.error("getFavorites error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};



// =========================
// POST - Thêm sản phẩm yêu thích
// =========================
export const addFavorite = async (req, res) => {
  try {
    const userId = req.user._id;
    const { product_id } = req.body;

    let favourite = await Favourite.findOne({ user_id: userId });

    if (!favourite) {
      favourite = new Favourite({
        user_id: userId,
        items: [{ product_id }]
      });
      await favourite.save();

      return res.json({ isFavorite: true });
    }

    const index = favourite.items.findIndex(
      item => item.product_id.toString() === product_id
    );

   
    if (index === -1) {
      favourite.items.push({ product_id });
      await favourite.save();
      return res.json({ isFavorite: true });
    }


    favourite.items.splice(index, 1);
    await favourite.save();
    return res.json({ isFavorite: false });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};



export const removeFavorite = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const favourite = await Favourite.findOneAndUpdate(
      { user_id: userId },
      { $pull: { items: { product_id: productId } } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Đã xóa khỏi yêu thích",
      data: favourite
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};


export const checkFavorite = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId } = req.params;

        const favourite = await Favourite.findOne({ user_id: userId });

        const exists = favourite?.items.some(
            (item) => item.product_id.toString() === productId
        );

        return res.json({
            success: true,
            favorited: !!exists
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error" });
    }
};