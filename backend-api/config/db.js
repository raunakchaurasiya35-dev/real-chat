import mongoose from "mongoose";
import process from "process";
import dns from "node:dns";

// Force Node.js on Windows to use IPv4 DNS resolution for MongoDB Atlas SRV hostnames
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // ignore
}

const connectDB = async () => {
  const primaryUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/chatapp";
  const localFallbackUri = "mongodb://127.0.0.1:27017/chatapp";

  try {
    await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log("🟢 MongoDB Connected Successfully:", primaryUri.includes("mongodb+srv") ? "MongoDB Atlas Cloud" : "Local Database");
  } catch (error) {
    console.warn("⚠️ Primary MongoDB Connection Failed:", error.message);

    if (primaryUri !== localFallbackUri) {
      console.log("🔄 Connecting to Local MongoDB Fallback (127.0.0.1:27017)...");
      try {
        await mongoose.connect(localFallbackUri, {
          serverSelectionTimeoutMS: 5000,
        });
        console.log("🟢 Connected to Local Fallback MongoDB Database!");
        return;
      } catch (fallbackError) {
        console.error("❌ Local MongoDB Fallback also failed:", fallbackError.message);
      }
    }

    console.error("❌ Database connection error. Server process remains running on port 5000.");
  }
};

export default connectDB;
