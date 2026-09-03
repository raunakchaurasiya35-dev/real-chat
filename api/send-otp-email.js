import nodemailer from "nodemailer";

export default async function handler(req, res) {
  // Allow CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  try {
    const { email, otp, fullName } = req.body || {};

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required" });
    }

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background-color: #f4f7f6;">
        <div style="max-width: 500px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #6366f1; margin-top: 0;">Prodesk IT Real-Time Portal</h2>
          <p>Hello <strong>${fullName || "User"}</strong>,</p>
          <p>Thank you for registering. Please use the verification code below to complete your registration:</p>
          <div style="background-color: #e0e7ff; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4338ca;">${otp}</span>
          </div>
          <p style="font-size: 13px; color: #6b7280;">This code is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
        </div>
      </div>
    `;

    const smtpUser = process.env.SMTP_USER || "raunakchaurasiya35@gmail.com";
    const smtpPass = (process.env.SMTP_PASS || "svlpdcevobujzmf").replace(/\s+/g, "");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: smtpUser.trim(),
        pass: smtpPass,
      },
    });

    const mailOptions = {
      from: `"Prodesk IT Chat" <${smtpUser.trim()}>`,
      to: email,
      subject: `${otp} is your Registration Verification Code`,
      html: emailHtml,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[VERCEL EMAIL API] Successfully sent email to ${email}`);

    return res.status(200).json({
      success: true,
      message: `OTP email delivered successfully to ${email}`,
    });
  } catch (error) {
    console.error("[VERCEL EMAIL API ERROR]", error.message || error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send email via Vercel serverless relay",
    });
  }
}
