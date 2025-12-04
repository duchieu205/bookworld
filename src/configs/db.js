import mongoose from "mongoose";
import { DB_URI } from "./enviroments.js";

const connectDB = async () => {
	try {
		const connected = await mongoose.connect(DB_URI);
		console.log(
			`Connected MongoDB: mongodb://${connected.connection.host}:${connected.connection.port}/${connected.connection.name}`
		);
	} catch (error) {
		console.error(`Error: ${error.message}`);
		process.exit(1);
	}
};

export default connectDB;
