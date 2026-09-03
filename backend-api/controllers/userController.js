import User from "../models/User.js";

// Add a user to contacts list by Email or Username
export const addContact = async (req, res) => {
  try {
    const { currentUser, contactQuery } = req.body;

    if (!currentUser || !contactQuery) {
      return res.status(400).json({
        success: false,
        message: "Current user and contact email or username are required.",
      });
    }

    const query = contactQuery.trim();

    // Find the target user by Email or Username
    const targetUser = await User.findOne({
      $or: [
        { email: query.toLowerCase() },
        { username: query },
      ],
    }).select("fullName email username");

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not available",
      });
    }

    if (targetUser.username.toLowerCase() === currentUser.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "You cannot add yourself as a contact.",
      });
    }

    // Find current user
    const user = await User.findOne({ username: currentUser });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Current user not found.",
      });
    }

    // Add contact to current user if not already present
    if (!user.contacts) user.contacts = [];
    if (!user.contacts.includes(targetUser.username)) {
      user.contacts.push(targetUser.username);
      await user.save();
    }

    // MUTUAL CONTACT SAVING: Add current user to target user's contacts list as well
    const targetUserDoc = await User.findById(targetUser._id);
    if (targetUserDoc) {
      if (!targetUserDoc.contacts) targetUserDoc.contacts = [];
      if (!targetUserDoc.contacts.includes(user.username)) {
        targetUserDoc.contacts.push(user.username);
        await targetUserDoc.save();
      }
    }

    // Fetch full profiles for all saved contacts
    const savedContacts = await User.find({
      username: { $in: user.contacts },
    }).select("fullName email username avatar");

    return res.status(200).json({
      success: true,
      message: `Added ${targetUser.fullName} (@${targetUser.username}) to your contacts!`,
      contacts: savedContacts,
      targetUsername: targetUser.username,
    });

  } catch (error) {
    console.error("Error adding contact:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add contact. Please try again.",
    });
  }
};

// Get saved contacts for a user
export const getContacts = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const contactUsernames = user.contacts || [];

    const savedContacts = await User.find({
      username: { $in: contactUsernames },
    }).select("fullName email username avatar");

    return res.status(200).json({
      success: true,
      contacts: savedContacts,
    });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch saved contacts.",
    });
  }
};

// Remove a contact from contacts list
export const removeContact = async (req, res) => {
  try {
    const { currentUser, contactUsername } = req.body;

    const user = await User.findOne({ username: currentUser });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    user.contacts = (user.contacts || []).filter(
      (username) => username !== contactUsername
    );
    await user.save();

    const savedContacts = await User.find({
      username: { $in: user.contacts },
    }).select("fullName email username avatar");

    return res.status(200).json({
      success: true,
      message: "Contact removed.",
      contacts: savedContacts,
    });
  } catch (error) {
    console.error("Error removing contact:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove contact.",
    });
  }
};

// Update user profile (Full Name, Username, Avatar)
export const updateProfile = async (req, res) => {
  try {
    const { userId, currentUsername, fullName, username, avatar } = req.body;

    if (!userId && !currentUsername) {
      return res.status(400).json({
        success: false,
        message: "User identifier is required.",
      });
    }

    let user = null;
    if (userId) {
      user = await User.findById(userId);
    } else if (currentUsername) {
      user = await User.findOne({ username: currentUsername });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check if new username is already taken by another user
    if (username && username.trim().toLowerCase() !== user.username.toLowerCase()) {
      const existingUser = await User.findOne({
        username: username.trim(),
        _id: { $ne: user._id },
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: `Username @${username.trim()} is already taken. Please choose another one.`,
        });
      }
      user.username = username.trim();
    }

    if (fullName) user.fullName = fullName.trim();
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully!",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile. Please try again.",
    });
  }
};

