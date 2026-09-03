import express from "express";
import { addContact, getContacts, removeContact, updateProfile } from "../controllers/userController.js";

const router = express.Router();

router.post("/contacts/add", addContact);
router.get("/contacts/:username", getContacts);
router.post("/contacts/remove", removeContact);
router.put("/profile", updateProfile);

export default router;
