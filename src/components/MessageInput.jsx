import { useState } from "react";

const MessageInput = ({ onSend }) => {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (text.trim() === "") return;
    onSend(text);
    setText("");
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="message-input">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Type a message"
      />
      <button onClick={handleSend}>Send</button>
    </div>
  );
};

export default MessageInput;