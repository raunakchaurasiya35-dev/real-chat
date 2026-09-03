const MessageList = ({ messages, currentUser }) => {
  return (
    <div className="message-list">
      {messages.map((msg, index) => (
        <div
          key={msg._id || msg.id || `msg-${index}`}
          className={msg.sender === currentUser ? "sent" : "received"}
        >
          <p>{msg.text}</p>
        </div>
      ))}
    </div>
  );
};

export default MessageList;