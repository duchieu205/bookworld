import mongoose from "mongoose";

const productFavoriteSchema = new mongoose.Schema({
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
},
    {_id: false}
)
const favouriteSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [productFavoriteSchema],
});

export default mongoose.model("Favourite", favouriteSchema);
