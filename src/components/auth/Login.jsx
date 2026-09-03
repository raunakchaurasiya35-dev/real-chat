import { useState } from "react";
import { API_BASE_URL as BASE_URL } from "../../config";

const API_BASE_URL = `${BASE_URL}/auth`;

const Login = ({ onLogin, switchToRegister, initialEmail = "" }) => {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setMessage({ text: "", type: "" });

    if (!email.trim() || !password) {
      setMessage({ text: "Please enter both email and password.", type: "error" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Invalid credentials.");
      }

      setMessage({ text: "Login successful!", type: "success" });
      
      if (onLogin && data.user) {
        onLogin(data.user);
      }
    } catch (err) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h2>Sign In</h2>
        <p>Enter your Email and Password to access your portal</p>
      </div>

      {message.text && (
        <div className={`auth-alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="input-group">
          <label htmlFor="login-email">Email Address</label>
          <input
            id="login-email"
            type="email"
            placeholder="e.g. rahul@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={!initialEmail}
            required
          />
        </div>

        <div className="input-group">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus={!!initialEmail}
            required
          />
        </div>

        <button
          type="submit"
          className="btn-auth-primary"
          disabled={loading}
        >
          {loading ? "Signing In..." : "Sign In"}
        </button>
      </form>

      <div className="auth-footer">
        <span>Don't have an account?</span>
        <button
          type="button"
          className="btn-toggle-auth"
          onClick={() => switchToRegister(email)}
        >
          Create Account
        </button>
      </div>
    </div>
  );
};

export default Login;
