import express, { type Request, type Response } from 'express';
import { createCheckoutSession, retrieveCheckoutSession } from '../services/stripe.js';
import { supabaseService } from '../services/supabase.js';
import { sendPurchaseConfirmationEmail } from '../services/email.js';
import type { CreateCheckoutSessionRequest, OrderData, OrderItemData } from '../types/checkout.js';
import Stripe from 'stripe';

const router = express.Router();

/**
 * POST /api/checkout/create-session
 * Create a Stripe checkout session
 */
router.post('/create-session', async (req: Request, res: Response) => {
  try {
    const data: CreateCheckoutSessionRequest = req.body;

    // Validate required fields
    if (!data.items || data.items.length === 0) {
      return res.status(400).json({ error: 'Cart items are required' });
    }

    if (!data.shippingInfo || !data.shippingInfo.email || !data.shippingInfo.fullName) {
      return res.status(400).json({ error: 'Shipping information is required' });
    }

    // Create Stripe checkout session
    // Order will be created after payment success (without webhook)
    const session = await createCheckoutSession(data);

    // Return checkout session URL (no order created yet)
    res.json({
      url: session.url,
      session_id: session.id,
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      error: error.message || 'Failed to create checkout session',
    });
  }
});

/**
 * GET /api/checkout/retrieve-session
 * Retrieve a Stripe checkout session
 */
router.get('/retrieve-session', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.session_id as string;

    if (!sessionId) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    const session = await retrieveCheckoutSession(sessionId);

    res.json({
      session_id: session.id,
      payment_status: session.payment_status,
      status: session.status,
      customer_email: session.customer_email,
      amount_total: session.amount_total,
      currency: session.currency,
      metadata: session.metadata,
    });
  } catch (error: any) {
    console.error('Error retrieving checkout session:', error);
    res.status(500).json({
      error: error.message || 'Failed to retrieve checkout session',
    });
  }
});

/**
 * POST /api/checkout/send-confirmation-email
 * Send order confirmation email (called from frontend after payment)
 */
router.post('/send-confirmation-email', async (req: Request, res: Response) => {
  try {
    const { sessionId, orderId } = req.body;

    console.log('Send confirmation email request:', { sessionId, orderId });

    if (!sessionId && !orderId) {
      return res.status(400).json({ error: 'Either sessionId or orderId is required' });
    }

    let order;
    
    if (sessionId) {
      // Verify payment status from Stripe
      const session = await retrieveCheckoutSession(sessionId);
      console.log('Stripe session payment status:', session.payment_status);
      
      if (session.payment_status !== 'paid') {
        return res.status(400).json({ error: 'Payment not completed yet' });
      }

      order = await supabaseService.getOrderBySessionId(sessionId);
    } else if (orderId) {
      order = await supabaseService.getOrderById(orderId);
    }

    if (!order) {
      console.error('Order not found for:', { sessionId, orderId });
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log('Order found:', { orderId: order.id, email: order.shipping?.email, orderItemsCount: order.order_items?.length });

    // Send confirmation email
    const customerEmail = order.shipping?.email;
    
    if (!customerEmail) {
      console.error('Customer email missing in order:', order.id);
      return res.status(400).json({ error: 'Customer email not found in order' });
    }

    console.log(`Attempting to send confirmation email to: ${customerEmail}`);
    await sendPurchaseConfirmationEmail(order, sessionId || order.stripe_session_id || '');
    console.log(`Confirmation email sent successfully to: ${customerEmail}`);
    
    res.json({ 
      success: true, 
      message: `Confirmation email sent to ${customerEmail}` 
    });
  } catch (error: any) {
    console.error('Error sending confirmation email:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Failed to send confirmation email',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/checkout/webhook
 * Handle Stripe webhook events
 */
router.post('/webhook', express.json(), async (req: Request, res: Response) => {
  try {
    // Log that webhook endpoint was hit
    console.log('=== WEBHOOK ENDPOINT CALLED ===');
    console.log('Webhook body:', JSON.stringify(req.body, null, 2));
    console.log('Webhook headers:', req.headers);
    
    // Parse webhook event
    const event = req.body as Stripe.Event;
    
    if (!event || !event.type) {
      console.error('Invalid webhook event received - missing event or type');
      return res.status(400).json({ error: 'Invalid webhook event' });
    }
    
    console.log(`✅ Webhook received: ${event.type} (ID: ${event.id})`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Only create order if payment is successful
        if (session.payment_status === 'paid') {
          // Check if order already exists (to prevent duplicates)
          let order = await supabaseService.getOrderBySessionId(session.id);
          
          if (!order) {
            // Create order from session metadata
            const metadata = session.metadata;
            
            if (!metadata) {
              console.error(`Missing metadata in session ${session.id}`);
              break;
            }

            // Parse shipping info from metadata
            const shippingInfo = {
              fullName: metadata.shipping_name || '',
              email: metadata.shipping_email || session.customer_email || '',
              phone: metadata.shipping_phone || '',
              address: metadata.shipping_address || '',
              city: metadata.shipping_city || '',
              postalCode: metadata.shipping_postal_code || '',
              country: metadata.shipping_country || '',
            };

            // Create order in database
            console.log('Creating order with data:', {
              total_amount: parseInt(metadata.total || '0'),
              currency: metadata.currency || 'SEK',
              email: shippingInfo.email,
              session_id: session.id,
            });

            const orderData: OrderData = {
              total_amount: parseInt(metadata.total || '0'),
              currency: metadata.currency || 'SEK',
              shipping: shippingInfo,
              status: 'processing', // Start as processing since payment is confirmed
              discount_code: metadata.discount_code || null,
              discount_amount: parseInt(metadata.discount_amount || '0'),
              stripe_session_id: session.id,
              payment_method: 'stripe',
            };

            try {
              order = await supabaseService.createOrder(orderData);
              console.log(`✅ Order ${order.id} created after successful payment for session ${session.id}`);
            } catch (orderError: any) {
              console.error('❌ Failed to create order:', orderError);
              console.error('Order data:', orderData);
              throw orderError;
            }

            // Parse and create order items from metadata
            try {
              const itemsData = JSON.parse(metadata.items || '[]');
              const orderItems: OrderItemData[] = itemsData.map((item: { product_id: string; quantity: number; unit_price: number }) => ({
                order_id: order.id,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
              }));

              await supabaseService.addOrderItems(orderItems);
              console.log(`Order items created for order ${order.id}`);
            } catch (itemsError: any) {
              console.error(`Failed to create order items for order ${order.id}:`, itemsError.message);
            }

            // Send purchase confirmation email to customer
            try {
              const customerEmail = order.shipping?.email;
              
              if (!customerEmail) {
                console.error(`Cannot send confirmation email: missing email in order shipping info for order ${order.id}`);
              } else {
                console.log(`Sending confirmation email to: ${customerEmail} for order ${order.id}`);
                await sendPurchaseConfirmationEmail(order, session.id);
                console.log(`Confirmation email sent successfully to ${customerEmail}`);
              }
            } catch (emailError: any) {
              // Log email error but don't fail the webhook
              console.error(`Failed to send confirmation email for order ${order.id}:`, emailError.message);
            }
          } else {
            // Order already exists, just update status if needed
            console.log(`Order ${order.id} already exists for session ${session.id}, skipping creation`);
            if (order.status !== 'processing') {
              await supabaseService.updateOrderStatus(order.id, 'processing', session.id);
            }
          }
        }

        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;

        const order = await supabaseService.getOrderBySessionId(session.id);
        
        if (order) {
          await supabaseService.updateOrderStatus(order.id, 'processing', session.id);
          console.log(`Order ${order.id} marked as processing after async payment succeeded`);
        }

        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;

        const order = await supabaseService.getOrderBySessionId(session.id);
        
        if (order) {
          await supabaseService.updateOrderStatus(order.id, 'pending', session.id);
          console.log(`Order ${order.id} payment failed`);
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('❌ WEBHOOK ERROR:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }
});

/**
 * POST /api/checkout/create-order-from-session
 * Create order after successful payment (without webhook)
 * Called from frontend after Stripe redirects back
 */
router.post('/create-order-from-session', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    console.log(`Creating order from session: ${sessionId}`);

    // Check if order already exists (prevent duplicates)
    const existingOrder = await supabaseService.getOrderBySessionId(sessionId);
    if (existingOrder) {
      console.log(`Order already exists for session ${sessionId}: ${existingOrder.id}`);
      return res.json({ 
        success: true, 
        order: existingOrder,
        message: 'Order already created' 
      });
    }

    // Retrieve and verify payment from Stripe
    const session = await retrieveCheckoutSession(sessionId);
    
    console.log(`Payment status for session ${sessionId}: ${session.payment_status}`);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ 
        error: 'Payment not completed',
        payment_status: session.payment_status 
      });
    }

    // Get metadata from Stripe session
    const metadata = session.metadata;
    if (!metadata) {
      return res.status(400).json({ error: 'Missing order data in session' });
    }

    // Parse shipping info from metadata
    const shippingInfo = {
      fullName: metadata.shipping_name || '',
      email: metadata.shipping_email || session.customer_email || '',
      phone: metadata.shipping_phone || '',
      address: metadata.shipping_address || '',
      city: metadata.shipping_city || '',
      postalCode: metadata.shipping_postal_code || '',
      country: metadata.shipping_country || '',
    };

    // Create order in database
    const orderData: OrderData = {
      total_amount: parseInt(metadata.total || '0'),
      currency: metadata.currency || 'SEK',
      shipping: shippingInfo,
      status: 'processing', // Mark as processing since payment is confirmed
      discount_code: metadata.discount_code || null,
      discount_amount: parseInt(metadata.discount_amount || '0'),
      stripe_session_id: sessionId,
      payment_method: 'stripe',
    };

    let order = await supabaseService.createOrder(orderData);
    console.log(`✅ Order ${order.id} created for session ${sessionId}`);

    // Create order items from metadata
    try {
      const itemsData = JSON.parse(metadata.items || '[]');
      const orderItems: OrderItemData[] = itemsData.map((item: { product_id: string; quantity: number; unit_price: number }) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }));

      await supabaseService.addOrderItems(orderItems);
      console.log(`✅ Order items created for order ${order.id}`);
      
      // Fetch the complete order with items for email
      const fullOrder = await supabaseService.getOrderById(order.id);
      if (fullOrder) {
        order = fullOrder;
        console.log(`✅ Order fetched with ${fullOrder.order_items?.length || 0} items for email`);
      }
    } catch (itemsError: any) {
      console.error(`Failed to create order items for order ${order.id}:`, itemsError.message);
    }

    // Send confirmation email
    try {
      const customerEmail = order.shipping?.email || session.customer_email;
      if (customerEmail) {
        console.log(`📧 Sending confirmation email to: ${customerEmail}`);
        await sendPurchaseConfirmationEmail(order, sessionId);
        console.log(`✅ Confirmation email sent successfully to ${customerEmail}`);
      } else {
        console.error('❌ Cannot send confirmation email: customer email is missing');
        console.error('Order shipping:', order.shipping);
        console.error('Stripe customer_email:', session.customer_email);
      }
    } catch (emailError: any) {
      console.error(`❌ Failed to send confirmation email:`, emailError.message);
      console.error('Email error details:', emailError);
      // Don't fail the request if email fails - order is already created
    }

    res.json({ 
      success: true, 
      order,
      message: 'Order created successfully' 
    });
  } catch (error: any) {
    console.error('Error creating order from session:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create order',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});


export default router;

