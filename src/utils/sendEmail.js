import nodemailer from "nodemailer";

export const sendEmail = async ({ to, subject, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      // config này để fix lỗi SSL
      tls: {
        rejectUnauthorized: false, // Bỏ qua lỗi certificate
      },
    });

    await transporter.sendMail({
      from: `"BookWorld Support" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    
    console.log('✅ Email sent successfully to:', to);
  } catch (error) {
    console.error("❌ Lỗi gửi email:", error);
    throw new Error("Error sending email: " + error.message);
  }
};