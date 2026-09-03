import express from "express";
import { sendOtp, verifyOtp, login, resendOtp } from "../controllers/authController.js";

const router = express.Router();

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/login", login);
router.post("/resend-otp", resendOtp);

export default router;
