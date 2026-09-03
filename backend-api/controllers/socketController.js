import { saveMessage, markMessageRead, addReaction } from "./messageController.js";
import User from "../models/User.js";

const onlineUsers = new Map();

const getSocketForUser = (username) => {
  if (!username) return null;
  const targetLower = username.trim().toLowerCase();
  for (const [user, socket] of onlineUsers.entries()) {
    if (user && user.trim().toLowerCase() === targetLower && socket.readyState === socket.OPEN) {
      return socket;
    }
  }
  return null;
};

const broadcastOnlineUsers = () => {
  const usersList = Array.from(onlineUsers.keys());
  const payload = JSON.stringify({ type: "onlineUsersList", payload: usersList });

  for (const [, socket] of onlineUsers.entries()) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
};

const handleConnection = (ws) => {
  let currentUser = null;

  ws.on("message", async (rawData) => {
    try {
      const data = JSON.parse(rawData);

      if (data.type === "ping") {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "pong" }));
        }
        return;
      }

      if (data.type === "addUser") {
        currentUser = data.username;
        onlineUsers.set(currentUser, ws);
        broadcastOnlineUsers();
        return;
      }

      if (data.type === "notifyContactAdd") {
        const contactPayload = JSON.stringify({
          type: "contactUpdated",
          sender: data.sender,
          receiver: data.receiver,
        });

        const targetSocket = getSocketForUser(data.receiver);
        if (targetSocket) {
          targetSocket.send(contactPayload);
        }
        return;
      }

      if (data.type === "typing") {
        if (data.receiver && data.receiver !== "All") {
          const receiverSocket = getSocketForUser(data.receiver);
          if (receiverSocket) {
            receiverSocket.send(
              JSON.stringify({ type: "typing", sender: data.sender, receiver: data.receiver })
            );
          }
        }
        return;
      }

      if (data.type === "stopTyping") {
        if (data.receiver && data.receiver !== "All") {
          const receiverSocket = getSocketForUser(data.receiver);
          if (receiverSocket) {
            receiverSocket.send(
              JSON.stringify({ type: "stopTyping", sender: data.sender, receiver: data.receiver })
            );
          }
        }
        return;
      }

      if (data.type === "markRead") {
        await markMessageRead(data.messageId);
        const payload = JSON.stringify({
          type: "messageRead",
          messageId: data.messageId,
          reader: currentUser,
        });

        for (const [, socket] of onlineUsers.entries()) {
          if (socket.readyState === socket.OPEN) {
            socket.send(payload);
          }
        }
        return;
      }

      if (data.type === "addReaction") {
        const updated = await addReaction(data.messageId, data.emoji, currentUser);
        const payload = JSON.stringify({
          type: "reactionUpdated",
          messageId: data.messageId,
          emoji: data.emoji,
          user: currentUser,
          reactions: updated && updated.reactions ? updated.reactions : [{ emoji: data.emoji, user: currentUser }],
        });

        for (const [, socket] of onlineUsers.entries()) {
          if (socket.readyState === socket.OPEN) {
            socket.send(payload);
          }
        }
        return;
      }

      if (data.type === "sendMessage") {
        const targetReceiver = data.receiver;
        if (!targetReceiver) return;

        // Auto mutual contact save in DB when sending a message
        try {
          const senderUser = await User.findOne({ username: data.sender });
          const receiverUser = await User.findOne({ username: targetReceiver });

          if (senderUser && receiverUser) {
            let updated = false;

            if (!senderUser.contacts) senderUser.contacts = [];
            if (!senderUser.contacts.includes(receiverUser.username)) {
              senderUser.contacts.push(receiverUser.username);
              await senderUser.save();
              updated = true;
            }

            if (!receiverUser.contacts) receiverUser.contacts = [];
            if (!receiverUser.contacts.includes(senderUser.username)) {
              receiverUser.contacts.push(senderUser.username);
              await receiverUser.save();
              updated = true;
            }

            if (updated) {
              const syncPayload = JSON.stringify({
                type: "contactUpdated",
                sender: data.sender,
                receiver: targetReceiver,
              });

              const rSocket = getSocketForUser(targetReceiver);
              if (rSocket) {
                rSocket.send(syncPayload);
              }
            }
          }
        } catch (dbErr) {
          console.error("Error auto-saving mutual contact:", dbErr);
        }

        const savedMessage = await saveMessage({
          sender: data.sender,
          receiver: targetReceiver,
          text: data.text || "",
          status: "delivered",
          fileUrl: data.fileUrl || null,
          fileType: data.fileType || null,
          fileName: data.fileName || null,
          fileSize: data.fileSize || null,
          replyTo: data.replyTo || null,
        });

        const outgoingPayload = JSON.stringify({
          type: "receiveMessage",
          payload: {
            id: data.id || savedMessage._id || `msg-${Date.now()}`,
            _id: savedMessage._id,
            sender: data.sender,
            receiver: targetReceiver,
            text: data.text || "",
            status: "delivered",
            fileUrl: data.fileUrl || null,
            fileType: data.fileType || null,
            fileName: data.fileName || null,
            fileSize: data.fileSize || null,
            replyTo: data.replyTo || null,
            reactions: [],
            timestamp: new Date().toLocaleTimeString(),
          },
        });

        // 1-on-1 Targeted Routing: Deliver strictly to sender and recipient
        const senderSocket = getSocketForUser(data.sender);
        if (senderSocket) {
          senderSocket.send(outgoingPayload);
        }

        if (data.sender !== targetReceiver) {
          const receiverSocket = getSocketForUser(targetReceiver);
          if (receiverSocket) {
            receiverSocket.send(outgoingPayload);
          }
        }
        return;
      }

      // Real-Time Audio & Video Call Signaling Handlers
      if (
        data.type === "callRequest" ||
        data.type === "callAccepted" ||
        data.type === "callDeclined" ||
        data.type === "webrtcOffer" ||
        data.type === "webrtcAnswer" ||
        data.type === "webrtcIceCandidate" ||
        data.type === "callEnded"
      ) {
        const targetUser = data.to || data.receiver;
        if (targetUser) {
          const targetSocket = getSocketForUser(targetUser);
          if (targetSocket) {
            targetSocket.send(JSON.stringify(data));
          } else if (data.type === "callRequest") {
            ws.send(
              JSON.stringify({
                type: "callDeclined",
                from: targetUser,
                reason: "User is currently offline",
              })
            );
          }
        }
        return;
      }

    } catch (err) {
      console.error("Socket message error:", err);
    }
  });

  ws.on("close", () => {
    if (currentUser) {
      onlineUsers.delete(currentUser);
      broadcastOnlineUsers();
    }
  });
};

export { handleConnection };
