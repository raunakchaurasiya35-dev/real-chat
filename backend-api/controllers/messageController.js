import mongoose from "mongoose";
import Message from "../models/Message.js";
import { encryptText, decryptText } from "../utils/encryption.js";


export const saveMessage = async (data) => {
  const encryptedText = encryptText(data.text || "");
  let encryptedReply = data.replyTo;
  if (encryptedReply && encryptedReply.text) {
    encryptedReply = { ...encryptedReply, text: encryptText(encryptedReply.text) };
  }

  const newMessage = new Message({
    sender: data.sender,
    receiver: data.receiver || "All",
    text: encryptedText,
    status: data.status || "sent",
    fileUrl: data.fileUrl || null,
    fileType: data.fileType || null,
    fileName: data.fileName || null,
    fileSize: data.fileSize || null,
    replyTo: encryptedReply || null,
  });
  const saved = await newMessage.save();
  return saved;
};

export const markMessageRead = async (messageId) => {
  try {
    const updated = await Message.findByIdAndUpdate(
      messageId,
      { status: "read" },
      { returnDocument: "after" }
    );
    return updated;
  } catch (err) {
    console.error("Failed to mark message read:", err);
    return null;
  }
};

export const addReaction = async (messageId, emoji, user) => {
  try {
    let msg = null;
    if (mongoose.Types.ObjectId.isValid(messageId)) {
      msg = await Message.findById(messageId);
    }

    if (msg) {
      msg.reactions = (msg.reactions || []).filter((r) => r.user !== user);
      msg.reactions.push({ emoji, user });
      await msg.save();
      return msg;
    }
    return { reactions: [{ emoji, user }] };
  } catch (err) {
    console.error("Failed to add reaction:", err);
    return { reactions: [{ emoji, user }] };
  }
};

export const getMessages = async (req, res) => {
  try {
    const { user1, user2 } = req.params;

    let filter = {};
    if (user2 === "All") {
      filter = { receiver: "All" };
    } else {
      filter = {
        $or: [
          { sender: user1, receiver: user2 },
          { sender: user2, receiver: user1 },
        ],
      };
    }

    const messages = await Message.find(filter).sort({ createdAt: 1 }).lean();

    // Decrypt messages before returning to client
    const decryptedMessages = messages.map((msg) => {
      let replyTo = msg.replyTo;
      if (replyTo && replyTo.text) {
        replyTo = { ...replyTo, text: decryptText(replyTo.text) };
      }
      return {
        ...msg,
        text: decryptText(msg.text),
        replyTo,
      };
    });

    res.status(200).json(decryptedMessages);
  } catch (err) {
    console.error("Failed to fetch messages:", err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

export const deleteMessages = async (req, res) => {
  try {
    const { user1, user2 } = req.params;

    let filter = {};
    if (user2 === "All") {
      filter = { receiver: "All" };
    } else {
      filter = {
        $or: [
          { sender: user1, receiver: user2 },
          { sender: user2, receiver: user1 },
        ],
      };
    }

    await Message.deleteMany(filter);

    res.status(200).json({
      success: true,
      message: "Chat history deleted successfully.",
    });
  } catch (err) {
    console.error("Failed to delete messages:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete chat history.",
    });
  }
};


