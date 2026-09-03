import { useState } from "react";
import UserLogin from "./components/UserLogin";
import LiveFeedEngine from "./components/LiveFeedEngine";
import EditProfileModal from "./components/EditProfileModal";

function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("chatUser");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  const handleLogin = (userData) => {
    setUser(userData);
    if (userData) {
      localStorage.setItem("chatUser", JSON.stringify(userData));
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("chatUser");
    setUser(null);
  };

  const handleProfileUpdate = (updatedUser) => {
    setUser((prev) => {
      const updated = { ...prev, ...updatedUser };
      try {
        localStorage.setItem("chatUser", JSON.stringify(updated));
      } catch (err) {
        console.warn("localStorage quota exceeded, skipping offline storage:", err);
      }
      return updated;
    });
  };

  if (!user) {
    return (
      <main className="login-container">
        <UserLogin onLogin={handleLogin} />
      </main>
    );
  }

  const avatarChar = user.fullName
    ? user.fullName.charAt(0).toUpperCase()
    : user.username.charAt(0).toUpperCase();

  return (
    <div className="app-layout">
      {/* Clean Corporate Top Navigation Bar */}
      <nav className="top-nav">
        <div className="nav-brand">
          <span className="brand-logo">⚡</span>
          <span className="brand-title">Prodesk IT Real-Time Portal</span>
        </div>

        <div className="nav-controls">
          <div className="user-profile">
            {user.avatar ? (
              <img src={user.avatar} alt="Avatar" className="nav-user-avatar-img" />
            ) : (
              <span className="user-avatar">{avatarChar}</span>
            )}
            <div className="user-info-text">
              <span className="user-name">{user.fullName || user.username}</span>
              <span className="user-handle">@{user.username}</span>
            </div>
          </div>

          <button
            type="button"
            className="btn-edit-profile"
            onClick={() => setIsEditProfileOpen(true)}
            title="Edit Profile Details"
          >
            ✏️ Edit Profile
          </button>

          <button
            type="button"
            className="btn-logout"
            onClick={handleSignOut}
            aria-label="Log out user session"
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Live Feed Engine Interface */}
      <div className="main-content">
        <LiveFeedEngine currentUser={user.username} />
      </div>

      {/* Edit Profile Modal */}
      {isEditProfileOpen && (
        <EditProfileModal
          user={user}
          onClose={() => setIsEditProfileOpen(false)}
          onUpdateSuccess={handleProfileUpdate}
        />
      )}
    </div>
  );
}

export default App;