import nodemailer from "nodemailer";
import dns from "dns";

// Force IPv4 DNS resolution for cloud hosts like Render that lack IPv6 outbound routing
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

export const sendOtpEmail = async (email, otp, fullName) => {
  try {
    console.log(`\n========================================`);
    console.log(`[EMAIL OTP SYSTEM]`);
    console.log(`Recipient: ${email} (${fullName})`);
    console.log(`OTP Code: ${otp}`);
    console.log(`Sending verification code...`);
    console.log(`========================================\n`);

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background-color: #f4f7f6;">
        <div style="max-width: 500px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #6366f1; margin-top: 0;">Prodesk IT Real-Time Portal</h2>
          <p>Hello <strong>${fullName}</strong>,</p>
          <p>Thank you for registering. Please use the verification code below to complete your registration:</p>
          <div style="background-color: #e0e7ff; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4338ca;">${otp}</span>
          </div>
          <p style="font-size: 13px; color: #6b7280;">This code is valid for 10 minutes. If you did not request this code, please ignore this email.</p>
        </div>
      </div>
    `;

    // Priority 1: Vercel Serverless Gmail Relay (HTTPS Port 443 - Bypasses Render Cloud Port 587/465 blocks completely)
    try {
      console.log(`[EMAIL OTP SYSTEM] Attempting to send via Vercel Serverless Gmail Relay...`);
      const vercelEndpoint = process.env.VERCEL_EMAIL_ENDPOINT || "https://real-chat-communication.vercel.app/api/send-otp-email";
      const vResponse = await fetch(vercelEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, fullName }),
      });

      if (vResponse.ok) {
        const vData = await vResponse.json();
        if (vData.success) {
          console.log(`[EMAIL OTP SYSTEM] Successfully sent real Gmail email via Vercel Serverless Relay to ${email}`);
          return { success: true, method: "vercel_gmail_relay" };
        }
      }
      console.warn(`[EMAIL OTP SYSTEM] Vercel relay response not ok (status ${vResponse.status}), falling back...`);
    } catch (vErr) {
      console.warn("[EMAIL OTP VERCEL RELAY WARN]", vErr.message || vErr);
    }

    // Priority 2: Nodemailer Direct Gmail / SMTP Transport (Port 587 STARTTLS)
    if (
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_USER !== "your_email@gmail.com"
    ) {
      const isGmail = process.env.SMTP_HOST.includes("gmail") || process.env.SMTP_USER.includes("@gmail.com");
      const userEmail = process.env.SMTP_USER.trim();
      const passClean = process.env.SMTP_PASS.replace(/\s+/g, "");

      // Attempt 1: Port 587 STARTTLS
      try {
        console.log(`[EMAIL OTP SYSTEM] Attempting SMTP send to ${email} via port 587...`);
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: { user: userEmail, pass: passClean },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 15000,
        });

        const mailOptions = {
          from: `"${process.env.SMTP_FROM_NAME || "Prodesk IT Chat"}" <${userEmail}>`,
          to: email,
          subject: `${otp} is your Registration Verification Code`,
          html: emailHtml,
        };

        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL OTP SYSTEM] Successfully sent email via SMTP Port 587 to ${email}`);
        return { success: true, method: "smtp_587" };
      } catch (smtpError1) {
        console.error("[EMAIL OTP SMTP PORT 587 ERROR]", smtpError1.message || smtpError1);

        // Attempt 2: Service "gmail" transport fallback
        if (isGmail) {
          try {
            console.log(`[EMAIL OTP SYSTEM] Trying Gmail service fallback transport...`);
            const fallbackTransporter = nodemailer.createTransport({
              service: "gmail",
              auth: { user: userEmail, pass: passClean },
            });

            await fallbackTransporter.sendMail({
              from: `"${process.env.SMTP_FROM_NAME || "Prodesk IT Chat"}" <${userEmail}>`,
              to: email,
              subject: `${otp} is your Registration Verification Code`,
              html: emailHtml,
            });

            console.log(`[EMAIL OTP SYSTEM] Successfully sent email via Gmail service transport to ${email}`);
            return { success: true, method: "gmail_service" };
          } catch (smtpError2) {
            console.error("[EMAIL OTP GMAIL FALLBACK ERROR]", smtpError2.message || smtpError2);
            return { success: false, method: "smtp_error", error: smtpError2.message || String(smtpError2) };
          }
        }

        return { success: false, method: "smtp_error", error: smtpError1.message || String(smtpError1) };
      }
    }

    console.log(`[EMAIL OTP DEV FALLBACK] No active email transport succeeded for ${email}`);
    return { success: false, method: "no_transport", error: "No active email transport configured (Check SMTP_USER / SMTP_PASS on Render)" };
  } catch (error) {
    console.error("[EMAIL OTP SYSTEM CRITICAL ERROR]", error.message || error);
    return { success: false, method: "error", otp };
  }
};


