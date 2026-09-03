import { useEffect, useRef, useState } from "react";

const useWebSocket = (username) => {
  const [messages, setMessages] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!username) return;

    const socket = new WebSocket("ws://localhost:5000");
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "addUser", username }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "receiveMessage" || data.type === "messageSent") {
        setMessages((prev) => [...prev, data.payload]);
      }
    };

    socket.onclose = () => {
      console.log("disconnected from server");
    };

    return () => {
      socket.close();
    };
  }, [username]);

  const sendMessage = (sender, receiver, text) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({ type: "sendMessage", sender, receiver, text })
      );
    }
  };

  return { messages, sendMessage, setMessages };
};

export default useWebSocket;