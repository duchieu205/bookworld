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

export const sendCancelOrderMail = async ({to,order,note,prevPaymentStatus,}) => {
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

    const subject = `Thông báo hủy đơn hàng #${order._id}`;
    const refundNote =
      prevPaymentStatus === "Đã thanh toán"
        ? `<p style="color: green;"><strong>✔ Đơn hàng đã được hoàn tiền.</strong></p>`
        : "";

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #e53e3e;">Đơn hàng của bạn đã bị hủy</h2>

        <p>Xin chào <strong>${order.shipping_address?.name || "Quý khách"}</strong>,</p>

        <p>
          Chúng tôi rất tiếc phải thông báo rằng đơn hàng
          <strong>#${order._id}</strong> của bạn đã bị <strong>Admin hủy</strong>.
        </p>

        <p>
          <strong>Lý do hủy đơn:</strong><br/>
          ${note || "Không có lý do cụ thể"}
        </p>

        <hr style="margin: 20px 0;" />

        <h4>Thông tin thanh toán</h4>
        <p>
          Phương thức thanh toán: <strong>${order.payment.method}</strong><br/>
          Trạng thái: <strong>${order.payment.status}</strong>
        </p>

        ${refundNote}

        <p style="margin-top: 20px;">
          Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ bộ phận hỗ trợ.
        </p>

        <p style="margin-top: 30px;">
          Trân trọng,<br/>
          <strong>Đội ngũ quản trị</strong>
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Admin" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log('✅ Email sent successfully to:', to);

  }
  catch (error) {
    console.error("❌ Lỗi gửi email:", error);
    throw new Error("Error sending email: " + error.message);
  }
  
};

export const sendRejectReturnMail = async ({to,order,reason,}) => {
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
     if (!to) {
      console.warn("⚠️ Không có email người nhận, bỏ qua gửi mail");
      return;
    }

    const subject = `Kết quả yêu cầu Trả hàng / Hoàn tiền đơn hàng #${order._id}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #e53e3e;">Yêu cầu Trả hàng / Hoàn tiền không được chấp nhận</h2>

        <p>Xin chào <strong>${order.shipping_address?.name || "Quý khách"}</strong>,</p>

        <p>
          Chúng tôi đã xem xét yêu cầu <strong>Trả hàng / Hoàn tiền</strong> của bạn
          đối với đơn hàng <strong>#${order._id}</strong>.
        </p>

        <p>
          Rất tiếc, yêu cầu của bạn <strong>không được chấp nhận</strong> vì lý do sau:
        </p>

        <div style="
          background-color: #fff5f5;
          border-left: 4px solid #e53e3e;
          padding: 12px;
          margin: 16px 0;
        ">
          <strong>Lý do từ chối:</strong><br/>
          ${reason || "Không có lý do cụ thể"}
        </div>

        <p>
          Đơn hàng của bạn sẽ được <strong>khôi phục về trạng thái trước đó</strong>
          và tiếp tục xử lý theo quy trình bình thường.
        </p>

        <p>
          Nếu bạn có thêm thắc mắc hoặc cần hỗ trợ, vui lòng liên hệ bộ phận chăm sóc khách hàng.
        </p>

        <p style="margin-top: 30px;">
          Trân trọng,<br/>
          <strong>Đội ngũ quản trị</strong>
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Admin" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log('✅ Email sent successfully to:', to);

  }

  catch (error) {
    console.error("❌ Lỗi gửi email:", error);
    throw new Error("Error sending email: " + error.message);
  }
 
};