import mongoose from "mongoose";



const userSchema = new mongoose.Schema({
name: { type: String, required: true },
email: { type: String, required: true, unique: true, lowercase: true },
password: { type: String, required: true },

role: {
    type: String,
    enum: ["user", "admin"],
    default: "user"
},

resetPasswordOTP: String,
resetPasswordExpires: Date,
otpRequestCount: { type: Number, default: 0 },
otpVerifyAttempts: { type: Number, default: 0 },
otpLastRequestAt: { type: Date },

createdAt: { type: Date, default: Date.now }
});


export default mongoose.model('User', userSchema);