import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "prodesk_chat_secret_key_32_bytes!!";
const IV_LENGTH = 16;

/**
 * Encrypts plain text message for secure MongoDB storage using AES-256-CBC
 */
export const encryptText = (text) => {
  if (!text || typeof text !== "string" || text.trim() === "") return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const keyBuffer = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32), "utf8");
    const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return `enc:${iv.toString("hex")}:${encrypted}`;
  } catch (err) {
    console.error("Encryption error:", err);
    return text;
  }
};

/**
 * Decrypts encrypted message from MongoDB back to plain text
 */
export const decryptText = (text) => {
  if (!text || typeof text !== "string" || !text.startsWith("enc:")) return text;
  try {
    const parts = text.split(":");
    if (parts.length !== 3) return text;
    const iv = Buffer.from(parts[1], "hex");
    const encryptedText = parts[2];
    const keyBuffer = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32), "utf8");
    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption error:", err);
    return text;
  }
};
