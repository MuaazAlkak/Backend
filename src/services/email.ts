import { Resend } from 'resend';

// Lazy initialization - create Resend instance only when needed
let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('Missing RESEND_API_KEY in environment variables');
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
}

interface OrderItem {
  product?: {
    id: string;
    title: {
      en: string;
      ar?: string;
      sv?: string;
    };
    images?: string[];
  };
  quantity: number;
  unit_price: number;
}

interface OrderData {
  id: string;
  total_amount: number;
  currency: string;
  created_at?: string;
  shipping: {
    fullName?: string;
    name?: string;
    email: string;
    phone?: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
  };
  discount_code?: string | null;
  discount_amount?: number;
  order_items?: OrderItem[];
}

/**
 * Send purchase confirmation email to customer
 */
export async function sendPurchaseConfirmationEmail(
  order: OrderData,
  sessionId: string
): Promise<void> {
  try {
    console.log('Email service: Starting to send confirmation email');
    console.log('Order ID:', order.id);
    console.log('Customer email:', order.shipping?.email);
    console.log('Order items count:', order.order_items?.length || 0);
    
    if (!process.env.RESEND_API_KEY) {
      throw new Error('Missing RESEND_API_KEY in environment variables');
    }

    const fromEmail = process.env.SMTP_USER || 'support@arvsouq.com';
    const toEmail = order.shipping?.email;

    if (!toEmail) {
      throw new Error('Customer email is missing from order shipping information');
    }

    console.log('Email service: From:', fromEmail, 'To:', toEmail);

    // Format currency amount (amounts are stored as regular numbers, not in smallest units)
    const formatAmount = (amount: number, currency: string): string => {
      const formattedAmount = amount.toFixed(2);
      return `${formattedAmount} ${currency.toUpperCase()}`;
    };

    // Calculate subtotal (total - discount)
    const subtotal = order.total_amount - (order.discount_amount || 0);

    // Build order items HTML
    const orderItemsHtml = order.order_items?.map((item) => {
      const productName = item.product?.title?.en || 'Product';
      const quantity = item.quantity;
      const unitPrice = item.unit_price;
      const itemTotal = unitPrice * quantity;
      
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            <strong>${productName}</strong><br>
            Quantity: ${quantity} × ${formatAmount(unitPrice, order.currency)}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
            ${formatAmount(itemTotal, order.currency)}
          </td>
        </tr>
      `;
    }).join('') || '';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Order Confirmation</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin-top: 0;">Thank you for your purchase!</h1>
            <p style="margin-bottom: 0;">Your order has been confirmed and we're preparing it for shipment.</p>
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Order Details</h2>
            
            <p><strong>Order ID:</strong> ${order.id}</p>
            <p><strong>Order Date:</strong> ${new Date().toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
            <p><strong>Transaction ID:</strong> ${sessionId}</p>
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Items Ordered</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f8f9fa;">
                  <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Item</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${orderItemsHtml}
              </tbody>
            </table>
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Order Summary</h2>
            <table style="width: 100%;">
              ${order.discount_amount ? `
                <tr>
                  <td style="padding: 5px 0;">Subtotal:</td>
                  <td style="padding: 5px 0; text-align: right;">${formatAmount(subtotal, order.currency)}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 0;">Discount${order.discount_code ? ` (${order.discount_code})` : ''}:</td>
                  <td style="padding: 5px 0; text-align: right; color: #27ae60;">-${formatAmount(order.discount_amount, order.currency)}</td>
                </tr>
              ` : ''}
              <tr style="font-size: 1.2em; font-weight: bold; border-top: 2px solid #ddd; margin-top: 10px;">
                <td style="padding: 10px 0;">Total:</td>
                <td style="padding: 10px 0; text-align: right; color: #2c3e50;">${formatAmount(order.total_amount, order.currency)}</td>
              </tr>
            </table>
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Shipping Address</h2>
            <p>
              ${order.shipping.fullName}<br>
              ${order.shipping.address}<br>
              ${order.shipping.postalCode} ${order.shipping.city}<br>
              ${order.shipping.country}
              ${order.shipping.phone ? `<br>Phone: ${order.shipping.phone}` : ''}
            </p>
          </div>

          <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin-top: 20px;">
            <p style="margin: 0; color: #2c3e50;">
              <strong>What's next?</strong><br>
              We'll send you another email when your order ships. If you have any questions, please don't hesitate to contact us.
            </p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #7f8c8d; font-size: 0.9em;">
            <p>Thank you for shopping with us!</p>
            <p>ARV Souq</p>
          </div>
        </body>
      </html>
    `;

    const emailText = `
Thank you for your purchase!

Your order has been confirmed and we're preparing it for shipment.

Order Details:
- Order ID: ${order.id}
- Order Date: ${new Date().toLocaleDateString('en-US', { 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})}
- Transaction ID: ${sessionId}

Items Ordered:
${order.order_items?.map((item) => {
  const productName = item.product?.title?.en || 'Product';
  const quantity = item.quantity;
  const unitPrice = item.unit_price;
  const itemTotal = unitPrice * quantity;
  return `- ${productName} (Qty: ${quantity}) - ${formatAmount(itemTotal, order.currency)}`;
}).join('\n') || 'No items'}

Order Summary:
${order.discount_amount ? `Subtotal: ${formatAmount(subtotal, order.currency)}\nDiscount${order.discount_code ? ` (${order.discount_code})` : ''}: -${formatAmount(order.discount_amount, order.currency)}\n` : ''}Total: ${formatAmount(order.total_amount, order.currency)}

Shipping Address:
${order.shipping.fullName}
${order.shipping.address}
${order.shipping.postalCode} ${order.shipping.city}
${order.shipping.country}
${order.shipping.phone ? `Phone: ${order.shipping.phone}` : ''}

What's next?
We'll send you another email when your order ships. If you have any questions, please don't hesitate to contact us.

Thank you for shopping with us!
ARV Souq
    `;

    console.log('Email service: Sending email via Resend...');
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: `ARV Souq <${fromEmail}>`,
      to: toEmail,
      subject: 'Order Confirmation - Thank you for your purchase!',
      html: emailHtml,
      text: emailText,
    });

    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }

    console.log('Email service: Email sent successfully!');
    console.log('Message ID:', data?.id);
  } catch (error: any) {
    console.error('Email service: Error sending purchase confirmation email');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to send confirmation email: ${error.message}`);
  }
}

/**
 * Send order status update email to customer
 */
export async function sendOrderStatusUpdateEmail(
  order: OrderData,
  newStatus: string,
  oldStatus?: string
): Promise<void> {
  try {
    console.log('Email service: Starting to send order status update email');
    console.log('Order ID:', order.id);
    console.log('Status changed from:', oldStatus, 'to:', newStatus);
    console.log('Customer email:', order.shipping?.email);
    
    if (!process.env.RESEND_API_KEY) {
      throw new Error('Missing RESEND_API_KEY in environment variables');
    }

    const fromEmail = process.env.SMTP_USER || 'support@arvsouq.com';
    const toEmail = order.shipping?.email;

    if (!toEmail) {
      throw new Error('Customer email is missing from order shipping information');
    }

    console.log('Email service: From:', fromEmail, 'To:', toEmail);

    // Format currency amount
    const formatAmount = (amount: number, currency: string): string => {
      const formattedAmount = amount.toFixed(2);
      return `${formattedAmount} ${currency.toUpperCase()}`;
    };

    // Get status-specific content
    const getStatusContent = (status: string) => {
      switch (status.toLowerCase()) {
        case 'processing':
          return {
            title: 'Your Order is Being Prepared',
            message: 'Great news! Your order is now being prepared for shipment. Our team is carefully packaging your items.',
            color: '#3498db',
            bgColor: '#e3f2fd',
            icon: '📦',
          };
        case 'shipped':
          return {
            title: 'Your Order Has Shipped!',
            message: 'Exciting news! Your order has been shipped and is on its way to you. You can expect to receive it soon.',
            color: '#f39c12',
            bgColor: '#fff3cd',
            icon: '🚚',
          };
        case 'delivered':
          return {
            title: 'Your Order Has Been Delivered',
            message: 'Your order has been successfully delivered! We hope you love your purchase. Thank you for shopping with us!',
            color: '#27ae60',
            bgColor: '#d4edda',
            icon: '✅',
          };
        case 'cancelled':
          return {
            title: 'Order Cancellation Notice',
            message: 'We\'re sorry to inform you that your order has been cancelled. If you have any questions or concerns, please contact our support team.',
            color: '#e74c3c',
            bgColor: '#f8d7da',
            icon: '❌',
          };
        default:
          return {
            title: 'Order Status Update',
            message: `Your order status has been updated to: ${status}`,
            color: '#2c3e50',
            bgColor: '#f8f9fa',
            icon: '📋',
          };
      }
    };

    const statusContent = getStatusContent(newStatus);
    const customerName = order.shipping.fullName || order.shipping.name || 'Valued Customer';

    // Build order items HTML
    const orderItemsHtml = order.order_items?.map((item) => {
      const productName = item.product?.title?.en || 'Product';
      const quantity = item.quantity;
      const unitPrice = item.unit_price;
      const itemTotal = unitPrice * quantity;
      
      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            <strong>${productName}</strong><br>
            <span style="color: #7f8c8d; font-size: 0.9em;">Quantity: ${quantity} × ${formatAmount(unitPrice, order.currency)}</span>
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
            ${formatAmount(itemTotal, order.currency)}
          </td>
        </tr>
      `;
    }).join('') || '';

    const orderDate = order.created_at 
      ? new Date(order.created_at).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric'
        })
      : 'N/A';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Order Status Update</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: ${statusContent.bgColor}; padding: 20px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid ${statusContent.color};">
            <h1 style="color: ${statusContent.color}; margin-top: 0; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.5em;">${statusContent.icon}</span>
              ${statusContent.title}
            </h1>
            <p style="margin-bottom: 0; color: #2c3e50;">Hello ${customerName},</p>
            <p style="margin-top: 10px; color: #2c3e50;">${statusContent.message}</p>
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid ${statusContent.color}; padding-bottom: 10px;">Order Information</h2>
            
            <p><strong>Order ID:</strong> ${order.id}</p>
            <p><strong>Order Date:</strong> ${orderDate}</p>
            <p><strong>Current Status:</strong> <span style="color: ${statusContent.color}; font-weight: bold; text-transform: capitalize;">${newStatus}</span></p>
            ${oldStatus ? `<p><strong>Previous Status:</strong> <span style="text-transform: capitalize;">${oldStatus}</span></p>` : ''}
          </div>

          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid ${statusContent.color}; padding-bottom: 10px;">Order Items</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f8f9fa;">
                  <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Item</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${orderItemsHtml}
              </tbody>
            </table>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #ddd;">
              <div style="display: flex; justify-content: space-between; font-size: 1.1em; font-weight: bold;">
                <span>Order Total:</span>
                <span style="color: ${statusContent.color};">${formatAmount(order.total_amount, order.currency)}</span>
              </div>
            </div>
          </div>

          ${newStatus.toLowerCase() === 'shipped' ? `
          <div style="background-color: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid ${statusContent.color}; padding-bottom: 10px;">Shipping Address</h2>
            <p>
              ${order.shipping.fullName || order.shipping.name || ''}<br>
              ${order.shipping.address}<br>
              ${order.shipping.postalCode} ${order.shipping.city}<br>
              ${order.shipping.country}
              ${order.shipping.phone ? `<br>Phone: ${order.shipping.phone}` : ''}
            </p>
          </div>
          ` : ''}

          ${newStatus.toLowerCase() === 'cancelled' ? `
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin-top: 20px; border-left: 4px solid #f39c12;">
            <p style="margin: 0; color: #856404;">
              <strong>Need Help?</strong><br>
              If you have any questions about this cancellation or would like to place a new order, please don't hesitate to contact our support team. We're here to help!
            </p>
          </div>
          ` : ''}

          ${newStatus.toLowerCase() === 'delivered' ? `
          <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin-top: 20px; border-left: 4px solid #27ae60;">
            <p style="margin: 0; color: #155724;">
              <strong>We'd Love Your Feedback!</strong><br>
              We hope you're happy with your purchase. If you have a moment, we'd appreciate your feedback on your experience with us.
            </p>
          </div>
          ` : ''}

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #7f8c8d; font-size: 0.9em;">
            <p>If you have any questions, please contact our support team.</p>
            <p>Thank you for shopping with us!</p>
            <p><strong>ARV Souq</strong></p>
          </div>
        </body>
      </html>
    `;

    const emailText = `
${statusContent.title}

Hello ${customerName},

${statusContent.message}

Order Information:
- Order ID: ${order.id}
- Order Date: ${orderDate}
- Current Status: ${newStatus}
${oldStatus ? `- Previous Status: ${oldStatus}` : ''}

Order Items:
${order.order_items?.map((item) => {
  const productName = item.product?.title?.en || 'Product';
  const quantity = item.quantity;
  const unitPrice = item.unit_price;
  const itemTotal = unitPrice * quantity;
  return `- ${productName} (Qty: ${quantity}) - ${formatAmount(itemTotal, order.currency)}`;
}).join('\n') || 'No items'}

Order Total: ${formatAmount(order.total_amount, order.currency)}

${newStatus.toLowerCase() === 'shipped' ? `
Shipping Address:
${order.shipping.fullName || order.shipping.name || ''}
${order.shipping.address}
${order.shipping.postalCode} ${order.shipping.city}
${order.shipping.country}
${order.shipping.phone ? `Phone: ${order.shipping.phone}` : ''}
` : ''}

${newStatus.toLowerCase() === 'cancelled' ? `
Need Help?
If you have any questions about this cancellation or would like to place a new order, please don't hesitate to contact our support team.
` : ''}

${newStatus.toLowerCase() === 'delivered' ? `
We'd Love Your Feedback!
We hope you're happy with your purchase. If you have a moment, we'd appreciate your feedback on your experience with us.
` : ''}

If you have any questions, please contact our support team.
Thank you for shopping with us!
ARV Souq
    `;

    console.log('Email service: Sending order status update email via Resend...');
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: `ARV Souq <${fromEmail}>`,
      to: toEmail,
      subject: `Order Update - ${statusContent.title} (Order #${order.id.substring(0, 8)})`,
      html: emailHtml,
      text: emailText,
    });

    if (error) {
      throw new Error(`Resend API error: ${error.message}`);
    }

    console.log('Email service: Order status update email sent successfully!');
    console.log('Message ID:', data?.id);
  } catch (error: any) {
    console.error('Email service: Error sending order status update email');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to send order status update email: ${error.message}`);
  }
}
