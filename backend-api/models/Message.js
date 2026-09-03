import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      required: true,
    },
    receiver: {
      type: String,
      default: "All",
    },
    text: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    fileUrl: {
      type: String,
      default: null,
    },
    fileType: {
      type: String,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileSize: {
      type: String,
      default: null,
    },
    reactions: [
      {
        emoji: String,
        user: String,
      },
    ],
    replyTo: {
      id: String,
      text: String,
      sender: String,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Message", messageSchema);

