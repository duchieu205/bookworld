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


//Hủy đơn
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
    const shortOrderId = order._id.toString().slice(-8);

    const subject = `Thông báo hủy đơn hàng #${shortOrderId}`;
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
          <strong>#${shortOrderId}</strong> của bạn đã bị <strong>Admin hủy</strong>.
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


//Trả hàng/hoàn tiền
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
    const orderCode = order._id.toString().slice(-8);
    const subject = `Kết quả yêu cầu Trả hàng / Hoàn tiền đơn hàng #${orderCode}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #e53e3e;">Yêu cầu Trả hàng / Hoàn tiền không được chấp nhận</h2>

        <p>Xin chào <strong>${order.shipping_address?.name || "Quý khách"}</strong>,</p>

        <p>
          Chúng tôi đã xem xét yêu cầu <strong>Trả hàng / Hoàn tiền</strong> của bạn
          đối với đơn hàng <strong>#${orderCode}</strong>.
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

//Hủy lệnh rút

export const sendRejectWithDrawalEmail = async ({ to, subject, html }) => {
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
      from: `"Admin" <${process.env.EMAIL_USER}>`,
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


// Khóa ví
export const sendWalletEmail = async ({ to, subject, html }) => {
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
      from: `"Admin" <${process.env.EMAIL_USER}>`,
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

//Giao hàng không thành công 2 lần

export const buildDeliveryFailedMail = async ({ to, order_id, userName }) => {
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
    const shortOrderId = order_id.toString().slice(-8);
    const subject = `Thông báo về tình trạng đơn hàng #${shortOrderId}`;

    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6">
      <h2 style="color:#e74c3c">🚫 Giao hàng không thành công</h2>

      <p>Xin chào <strong>${userName || "Quý khách"}</strong>,</p>

      <p>
        Đơn hàng <strong>#${shortOrderId}</strong> của bạn đã giao <strong>không thành công 2 lần</strong>.
      </p>
      
      <p>
        Đơn hàng <strong>#${shortOrderId}</strong> của bạn sẽ tự động chuyển sang trạng thái <strong>Đã hủy</strong>.
      </p>

      <p>
        Theo chính sách của chúng tôi, đơn hàng sẽ được <strong>tự động huỷ</strong> và
        <strong>hoàn tiền về ví</strong> (nếu đã thanh toán).
      </p>

    

      <hr />


      <p style="margin-top: 30px;">
          Trân trọng,<br/>
          <strong>Đội ngũ quản trị</strong>
        </p>

      <p style="color:#888;font-size:12px">
        Email này được gửi tự động, vui lòng không trả lời.
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

export const buildOrderCreatedEmail = ({
  userName,
  orderId,
  totalAmount,
  paymentMethod,
}) => {
  const shortOrderId = orderId.toString().slice(-8).toUpperCase();

  let paymentMessage = "";
  let paymentBadgeColor = "#6b7280";

  switch (paymentMethod) {
    case "cod":
      paymentMessage = `
        <p>
          Bạn đã chọn <strong>Thanh toán khi nhận hàng (COD)</strong>.
          Vui lòng chuẩn bị số tiền <strong>${totalAmount}</strong> khi nhận đơn.
        </p>
      `;
      paymentBadgeColor = "#f59e0b";
      break;

    case "wallet":
      paymentMessage = `
        <p>
          Đơn hàng đã được <strong>thanh toán thành công bằng ví</strong>.
          Chúng tôi sẽ tiến hành xử lý đơn hàng ngay.
        </p>
      `;
      paymentBadgeColor = "#10b981";
      break;

    case "vnpay":
      paymentMessage = `
        <p>
          Đơn hàng đã được <strong>thanh toán thành công qua VNPay</strong>.
          Cảm ơn bạn đã tin tưởng BookWorld.
        </p>
      `;
      paymentBadgeColor = "#2563eb";
      break;

    default:
      paymentMessage = `<p>Phương thức thanh toán: ${paymentMethod}</p>`;
  }

  return `
    <div style="font-family: Arial, sans-serif; background:#f9fafb; padding:20px">
      <div style="max-width:600px; margin:auto; background:white; border-radius:10px; overflow:hidden">
        
        <!-- Header -->
        <div style="background:#7c3aed; padding:20px; color:white; text-align:center">
          <h1 style="margin:0">📚 BookWorld</h1>
          <p style="margin:4px 0 0">Xác nhận tạo đơn hàng</p>
        </div>

        <!-- Body -->
        <div style="padding:24px">
          <p>Xin chào <strong>${userName}</strong>,</p>

          <p>
            Cảm ơn bạn đã đặt hàng tại <strong>BookWorld</strong>.
            Đơn hàng của bạn đã được tạo thành công.
          </p>

          <div style="background:#f3f4f6; padding:16px; border-radius:8px; margin:16px 0">
            <p style="margin:0"><strong>Mã đơn hàng:</strong> #${shortOrderId}</p>
            <p style="margin:8px 0 0"><strong>Tổng thanh toán:</strong> ${totalAmount}</p>
            <p style="margin:8px 0 0">
              <strong>Thanh toán:</strong>
              <span style="
                background:${paymentBadgeColor};
                color:white;
                padding:4px 10px;
                border-radius:999px;
                font-size:12px;
              ">
                ${paymentMethod.toUpperCase()}
              </span>
            </p>
          </div>

          ${paymentMessage}

          <p>
            Bạn có thể theo dõi trạng thái đơn hàng trong mục
            <strong>Đơn hàng của tôi</strong>.
          </p>

          <p style="margin-top:24px">
            Trân trọng,<br/>
            <strong>Đội ngũ quản trị</strong>
          </p>
        </div>
      </div>
    </div>
  `;
};

export const buildOrderDeliveredEmail = ({
  userName,
  orderId,
  deliveredAt,
  totalAmount,
}) => {
  const formatVND = (n) =>
    Number(n).toLocaleString("vi-VN") + "₫";

  const dateStr = deliveredAt
    ? new Date(deliveredAt).toLocaleString("vi-VN")
    : new Date().toLocaleString("vi-VN");
  const shortOrderId = orderId.toString().slice(-8).toUpperCase();

  return `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Giao hàng thành công</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f6f8; font-family: Arial, Helvetica, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding: 30px 10px;">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
            
            <!-- HEADER -->
            <tr>
              <td style="background:#22c55e; padding:20px; text-align:center;">
                <h1 style="margin:0; color:#ffffff;">📦 Giao hàng thành công</h1>
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:30px; color:#333;">
                <p style="font-size:16px;">Xin chào <strong>${userName}</strong>,</p>

                <p style="font-size:15px; line-height:1.6;">
                  Đơn hàng <strong>#${shortOrderId}</strong> của bạn đã được
                  <strong style="color:#22c55e;">giao thành công</strong>.
                </p>

                <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
                  <tr>
                    <td style="padding:10px 0; border-bottom:1px solid #eee;">
                      <strong>Mã đơn hàng:</strong>
                    </td>
                    <td style="padding:10px 0; border-bottom:1px solid #eee;" align="right">
                      #${shortOrderId}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0; border-bottom:1px solid #eee;">
                      <strong>Thời gian giao:</strong>
                    </td>
                    <td style="padding:10px 0; border-bottom:1px solid #eee;" align="right">
                      ${dateStr}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;">
                      <strong>Tổng thanh toán:</strong>
                    </td>
                    <td style="padding:10px 0;" align="right">
                      <strong style="color:#16a34a;">
                        ${formatVND(totalAmount)}
                      </strong>
                    </td>
                  </tr>
                </table>
                
                <p style="font-size:15px; line-height:1.6;">
                  Cảm ơn bạn đã mua sắm tại <strong>BookWorld</strong>.
                  Nếu bạn yêu thích sản phẩm. Hãy đánh giá chúng nhé
                  Chúng tôi hy vọng bạn sẽ hài lòng với sản phẩm đã nhận.
                </p>
                <p style="margin-top: 12px; padding: 10px; background-color: #fff7ed; color: #9a3412; border-left: 4px solid #fb923c; font-size: 14px;">
                  ⏰ <strong>Lưu ý:</strong> 
                </p>

                 <p>
                  Quý khách chỉ có thể gửi <strong>yêu cầu Trả hàng / Hoàn tiền</strong> trong vòng
                  <strong>03 ngày</strong> kể từ thời điểm đơn hàng được xác nhận
                  <strong>Giao hàng thành công</strong>.
                </p>

                <p>
                  Sau thời gian này, hệ thống sẽ tự động chuyển đơn hàng sang trạng thái
                  <strong>Hoàn tất</strong> và không hỗ trợ xử lý yêu cầu trả hàng.
                </p>


                <p style="font-size:14px; color:#555;">
                  Nếu có bất kỳ vấn đề nào, vui lòng liên hệ bộ phận hỗ trợ của chúng tôi.
                </p>

                <p style="margin-top:30px;">
                  Trân trọng,<br/>
                  <strong>BookWorld Team</strong>
                </p>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="background:#f9fafb; padding:15px; text-align:center; font-size:12px; color:#888;">
                © ${new Date().getFullYear()} BookWorld. Mọi quyền được bảo lưu.
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
};