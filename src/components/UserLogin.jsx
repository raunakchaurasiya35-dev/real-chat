import { useState } from "react";
import Login from "./auth/Login";
import Register from "./auth/Register";

const UserLogin = ({ onLogin }) => {
  const [activeTab, setActiveTab] = useState("login"); // "login" | "register"
  const [emailForLogin, setEmailForLogin] = useState("");

  const handleSwitchToLogin = (email = "") => {
    if (email) setEmailForLogin(email);
    setActiveTab("login");
  };

  const handleSwitchToRegister = (email = "") => {
    if (email) setEmailForLogin(email);
    setActiveTab("register");
  };

  return (
    <div className="login-box auth-container">
      <div className="login-header">
        <div className="login-logo">⚡</div>
        <h2>Prodesk IT Portal</h2>
        <p className="login-subtitle">Secure real-time communication portal</p>
      </div>

      <div className="auth-tab-bar">
        <button
          type="button"
          className={`auth-tab ${activeTab === "login" ? "active" : ""}`}
          onClick={() => setActiveTab("login")}
        >
          Sign In
        </button>
        <button
          type="button"
          className={`auth-tab ${activeTab === "register" ? "active" : ""}`}
          onClick={() => setActiveTab("register")}
        >
          Register
        </button>
      </div>

      {activeTab === "login" ? (
        <Login
          onLogin={onLogin}
          switchToRegister={handleSwitchToRegister}
          initialEmail={emailForLogin}
        />
      ) : (
        <Register
          switchToLogin={handleSwitchToLogin}
        />
      )}
    </div>
  );
};

export default UserLogin;