import express from 'express';
import { sendOrderStatusUpdateEmail } from '../services/email.js';
import { supabaseService } from '../services/supabase.js';

const router = express.Router();

/**
 * POST /api/orders/:orderId/status-update-email
 * Send email notification when order status is updated
 */
router.post('/:orderId/status-update-email', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { newStatus, oldStatus } = req.body;

    if (!newStatus) {
      return res.status(400).json({ 
        error: 'Missing required field: newStatus' 
      });
    }

    // Fetch the order with all details
    const order = await supabaseService.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found' 
      });
    }

    // Check if order has shipping email
    if (!order.shipping?.email) {
      return res.status(400).json({ 
        error: 'Order does not have a shipping email address' 
      });
    }

    // Transform order data to match email service interface
    const orderData = {
      id: order.id,
      total_amount: order.total_amount,
      currency: order.currency,
      created_at: order.created_at,
      shipping: {
        fullName: order.shipping.fullName || order.shipping.name || 'Customer',
        name: order.shipping.name,
        email: order.shipping.email,
        phone: order.shipping.phone,
        address: order.shipping.address,
        city: order.shipping.city,
        postalCode: order.shipping.postalCode,
        country: order.shipping.country,
      },
      discount_code: order.discount_code,
      discount_amount: order.discount_amount,
      order_items: order.order_items?.map((item: { products?: { id: string; title: unknown; images?: string[] }; quantity: number; unit_price: number }) => ({
        product: item.products ? {
          id: item.products.id,
          title: item.products.title,
          images: item.products.images,
        } : undefined,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
    };

    // Send the email
    await sendOrderStatusUpdateEmail(orderData, newStatus, oldStatus);

    res.json({ 
      success: true, 
      message: 'Order status update email sent successfully' 
    });
  } catch (error: any) {
    console.error('Error sending order status update email:', error);
    res.status(500).json({ 
      error: 'Failed to send order status update email',
      message: error.message 
    });
  }
});

export default router;

