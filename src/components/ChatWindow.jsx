import { useEffect, useState } from "react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";

const ChatWindow = ({ currentUser, messages, sendMessage, setMessages }) => {
  const [receiver, setReceiver] = useState("");

  useEffect(() => {
    if (!receiver) return;

    const fetchHistory = async () => {
      const res = await fetch(
        `http://localhost:5000/api/messages/${currentUser}/${receiver}`
      );
      const data = await res.json();
      setMessages(data);
    };

    fetchHistory();
  }, [receiver, currentUser, setMessages]);

  const handleSend = (text) => {
    sendMessage(currentUser, receiver, text);
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <input
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
          placeholder="Chat with (username)"
        />
      </div>

      <MessageList messages={messages} currentUser={currentUser} />

      <MessageInput onSend={handleSend} />
    </div>
  );
};

export default ChatWindow;