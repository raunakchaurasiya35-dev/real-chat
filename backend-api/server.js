import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";

import connectDB from "./config/db.js";
import { getMessages, deleteMessages } from "./controllers/messageController.js";
import { handleConnection } from "./controllers/socketController.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.get("/api/messages/:user1/:user2", getMessages);
app.delete("/api/messages/clear/:user1/:user2", deleteMessages);



const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on("connection", handleConnection);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
