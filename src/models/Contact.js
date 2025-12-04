import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
	{
		fullname: {
			type: String,
			required: true,
		},
	},
	// Bổ sung thêm sdt, mã số thuế, địa chỉ các cơ sở, email, website, người diện, logo
	{ timestamps: true, versionKey: false }
);

const Contact = mongoose.model("Contact", contactSchema);

export default Contact;
