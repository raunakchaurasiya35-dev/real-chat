import { useState, useRef } from "react";
import { API_BASE_URL } from "../config";

// Compress and resize avatar image to max 300x300 canvas to prevent memory crash & localStorage quota errors
const compressAvatarImage = (file, maxWidth = 300, maxHeight = 300, quality = 0.85) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (err) => reject(err);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = (err) => reject(err);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

const EditProfileModal = ({ user, onClose, onUpdateSuccess }) => {
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || "");
  
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ text: "", type: "" });
  
  const fileInputRef = useRef(null);

  const handleAvatarSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const compressedDataUrl = await compressAvatarImage(file, 300, 300, 0.85);
      setAvatar(compressedDataUrl);
      setAvatarPreview(compressedDataUrl);
    } catch (err) {
      console.error("Error processing avatar image:", err);
      setStatusMessage({ text: "Failed to process image. Please try another photo.", type: "error" });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage({ text: "", type: "" });

    if (!fullName.trim() || !username.trim()) {
      setStatusMessage({ text: "Full Name and Username cannot be empty.", type: "error" });
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/users/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id || user?._id,
          currentUsername: user?.username,
          fullName: fullName.trim(),
          username: username.trim(),
          avatar: avatar,
        }),
      });

      const responseText = await res.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error("Server returned an invalid response. Profile image file size may be too large.");
      }

      setIsLoading(false);

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update profile.");
      }

      setStatusMessage({ text: "Profile updated successfully! 🎉", type: "success" });
      
      setTimeout(() => {
        if (onUpdateSuccess) {
          onUpdateSuccess(data.user);
        }
        onClose();
      }, 600);

    } catch (err) {
      setIsLoading(false);
      setStatusMessage({ text: err.message || "Failed to update profile.", type: "error" });
    }
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <h3>✏️ Edit Profile</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {statusMessage.text && (
          <div className={`modal-status-alert alert-${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="profile-modal-form">
          {/* Avatar Upload Circle */}
          <div className="avatar-uploader-container">
            <div
              className="avatar-preview-circle"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              title="Click to upload profile photo"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profile Avatar" className="avatar-img" />
              ) : (
                <span className="avatar-initials">
                  {fullName ? fullName.charAt(0).toUpperCase() : username ? username.charAt(0).toUpperCase() : "👤"}
                </span>
              )}
              <div className="avatar-upload-overlay">
                📷 <span>Upload</span>
              </div>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarSelect}
              accept="image/*"
              className="sr-only"
            />
            <span className="avatar-help-text">Click circle to choose photo (PNG/JPG)</span>
          </div>

          {/* Form Fields */}
          <div className="form-group">
            <label htmlFor="edit-fullname">Full Name</label>
            <input
              id="edit-fullname"
              type="text"
              className="modal-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name..."
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-username">Username (@username)</label>
            <input
              id="edit-username"
              type="text"
              className="modal-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username..."
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-email">Email Address</label>
            <input
              id="edit-email"
              type="email"
              className="modal-input input-disabled"
              value={user?.email || ""}
              disabled
            />
            <span className="input-hint">Email address cannot be changed</span>
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-save"
              disabled={isLoading}
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProfileModal;
