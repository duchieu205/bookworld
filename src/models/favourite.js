import mongoose from "mongoose";

const productFavoriteSchema = new mongoose.Schema({
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
},
    {timestamp: true}

    
);
const favouriteSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    items: [productFavoriteSchema],
},
    {timestamp: true}
);

export default mongoose.model("Favourite", favouriteSchema);
