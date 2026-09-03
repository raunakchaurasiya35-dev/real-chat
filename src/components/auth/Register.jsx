import { useState } from "react";
import { API_BASE_URL as BASE_URL } from "../../config";

const API_BASE_URL = `${BASE_URL}/auth`;

const Register = ({ switchToLogin }) => {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    username: "",
    password: "",
  });

  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("FORM"); // "FORM" | "OTP"
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" }); // type: "error" | "success" | "info"

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Step 1: Submit Form to Send OTP to Email
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setMessage({ text: "", type: "" });

    if (!formData.fullName.trim() || !formData.email.trim() || !formData.username.trim() || !formData.password) {
      setMessage({ text: "Please fill in all fields.", type: "error" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send OTP.");
      }

      setMessage({ text: data.message, type: "success" });
      setStep("OTP");
    } catch (err) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setMessage({ text: "", type: "" });

    if (!otp.trim()) {
      setMessage({ text: "Please enter the 6-digit verification code.", type: "error" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          otp: otp.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "OTP verification failed.");
      }

      setMessage({ text: data.message, type: "success" });
      
      // Auto transition to Login after 1.5 seconds
      setTimeout(() => {
        switchToLogin(formData.email);
      }, 1500);
    } catch (err) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setMessage({ text: "", type: "" });
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to resend OTP.");
      }

      setMessage({ text: data.message, type: "success" });
    } catch (err) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h2>Create Account</h2>
        <p>Register with your details to access Prodesk IT Portal</p>
      </div>

      {message.text && (
        <div className={`auth-alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      {step === "FORM" ? (
        <form onSubmit={handleSendOtp} className="auth-form">
          <div className="input-group">
            <label htmlFor="reg-fullname">Full Name</label>
            <input
              id="reg-fullname"
              type="text"
              name="fullName"
              placeholder="e.g. Rahul Sharma"
              value={formData.fullName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="reg-email">Email Address</label>
            <input
              id="reg-email"
              type="email"
              name="email"
              placeholder="e.g. rahul@example.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="reg-username">Username</label>
            <input
              id="reg-username"
              type="text"
              name="username"
              placeholder="e.g. rahul54"
              value={formData.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-auth-primary"
            disabled={loading}
          >
            {loading ? "Sending OTP..." : "Get Email OTP & Register"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="auth-form">
          <div className="otp-info">
            <p>Verification code sent to <strong>{formData.email}</strong></p>
          </div>

          <div className="input-group">
            <label htmlFor="reg-otp">Enter 6-Digit OTP</label>
            <input
              id="reg-otp"
              type="text"
              name="otp"
              placeholder="123456"
              maxLength="6"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="otp-input"
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            className="btn-auth-primary"
            disabled={loading}
          >
            {loading ? "Verifying..." : "Verify OTP & Complete Registration"}
          </button>

          <div className="otp-actions">
            <button
              type="button"
              className="btn-link"
              onClick={handleResendOtp}
              disabled={loading}
            >
              Resend OTP Code
            </button>
            
            <button
              type="button"
              className="btn-link"
              onClick={() => setStep("FORM")}
              disabled={loading}
            >
              ← Edit Registration Info
            </button>
          </div>
        </form>
      )}

      <div className="auth-footer">
        <span>Already have an account?</span>
        <button
          type="button"
          className="btn-toggle-auth"
          onClick={() => switchToLogin(formData.email)}
        >
          Sign In
        </button>
      </div>
    </div>
  );
};

export default Register;
