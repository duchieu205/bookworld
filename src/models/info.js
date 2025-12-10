import mongoose from "mongoose";

const innfoSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        unique: true,
        required: true
    },
    avatar: { type: String },
    address: { type: String },
    phone: { type: String }
});

export default mongoose.model("Infor", innfoSchema);
