import mongoose from "mongoose";
import dotenv from "dotenv";
import EnvironmentVariable from "../modules/admin/models/EnvironmentVariable.js";

dotenv.config();

const updateCredentials = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const envVars = await EnvironmentVariable.getOrCreate();
    // Values provided by user
    envVars.CLOUDINARY_CLOUD_NAME = "dciu4uawr";
    envVars.CLOUDINARY_API_KEY = "321367185532319";
    envVars.CLOUDINARY_API_SECRET = "YGxziMfOehQo2MCBfZsm2CPI5Uo";

    await envVars.save();
  } catch (error) {
    console.error("❌ Error updating credentials:", error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

updateCredentials();
