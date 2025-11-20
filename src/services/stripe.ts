import Stripe from 'stripe';
import type { CreateCheckoutSessionRequest, CartItem } from '../types/checkout.js';

// Lazy initialization of Stripe client
let stripeInstance: Stripe | null = null;
let stripeTestInstance: Stripe | null = null;

function getStripe(): Stripe {
  // Check if test mode is explicitly enabled via environment variable
  const useTestMode = process.env.USE_STRIPE_TEST_MODE === 'true';
  
  if (useTestMode) {
    // Use test mode Stripe instance (for testing purposes)
    if (!stripeTestInstance) {
      const stripeTestKey = process.env.STRIPE_SECRET_KEY_test;
      
      if (!stripeTestKey) {
        throw new Error('Test mode enabled but STRIPE_SECRET_KEY_test is not set in .env file');
      }
      
      stripeTestInstance = new Stripe(stripeTestKey, {
        apiVersion: '2025-02-24.acacia',
      });
      console.log('Using Stripe TEST mode (USE_STRIPE_TEST_MODE=true)');
    }
    
    return stripeTestInstance;
  } else {
    // Use live/production Stripe instance (default)
    if (!stripeInstance) {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      
      if (!stripeSecretKey) {
        throw new Error('Missing Stripe LIVE configuration. Please set STRIPE_SECRET_KEY in your .env file');
      }
      
      // Verify it's a live key (starts with sk_live_)
      if (!stripeSecretKey.startsWith('sk_live_')) {
        console.warn('Warning: STRIPE_SECRET_KEY does not start with sk_live_. Make sure you are using the correct LIVE key.');
      }
      
      stripeInstance = new Stripe(stripeSecretKey, {
        apiVersion: '2025-02-24.acacia',
      });
      console.log('Using Stripe LIVE mode (Production)');
    }
    
    return stripeInstance;
  }
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripe()[prop as keyof Stripe];
  }
});

function getUrls() {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
  const successUrl = process.env.SUCCESS_URL || `${frontendUrl}/order-confirmation`;
  const cancelUrl = process.env.CANCEL_URL || `${frontendUrl}/checkout?canceled=true`;
  return { frontendUrl, successUrl, cancelUrl };
}

/**
 * Calculate the unit price for an item considering discounts
 */
function calculateUnitPrice(item: CartItem): number {
  const basePrice = item.product.price;
  
  // Check for product discount
  const productDiscount = item.product.discount_percentage && item.product.discount_percentage > 0;
  
  // Check for event discount
  const eventDiscount = item.activeEvent?.discount_percentage && item.activeEvent.discount_percentage > 0;
  
  // Product discount takes precedence over event discount
  const discountPercentage = productDiscount 
    ? item.product.discount_percentage 
    : (eventDiscount ? item.activeEvent?.discount_percentage : 0);
  
  if (discountPercentage && discountPercentage > 0) {
    return Math.round(basePrice * (1 - discountPercentage / 100));
  }
  
  return basePrice;
}

/**
 * Create a Stripe checkout session
 */
export async function createCheckoutSession(data: CreateCheckoutSessionRequest) {
  try {
    // Helper function to convert currency to smallest unit
    // Stripe requires amounts in smallest currency unit (öre for SEK, cents for USD/EUR)
    const toSmallestUnit = (amount: number, currency: string): number => {
      // SEK (Swedish Krona): 1 SEK = 100 öre
      // USD, EUR, GBP, etc.: 1 unit = 100 cents
      // For zero-decimal currencies (like JPY), return as-is
      const zeroDecimalCurrencies = ['jpy', 'krw', 'clp', 'vnd', 'xaf', 'xof'];
      if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
        return Math.round(amount);
      }
      // For other currencies, multiply by 100
      return Math.round(amount * 100);
    };

    // Convert items to Stripe line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = data.items.map((item) => {
      const unitPrice = calculateUnitPrice(item);
      
      return {
        price_data: {
          currency: data.currency.toLowerCase(),
          product_data: {
            name: item.product.title.en,
            images: item.product.images.slice(0, 1), // Stripe allows max 1 image per line item
          },
          unit_amount: toSmallestUnit(unitPrice, data.currency), // Convert to smallest currency unit
        },
        quantity: item.quantity,
      };
    });

    // Add shipping as a line item if applicable
    if (data.shipping > 0) {
      lineItems.push({
        price_data: {
          currency: data.currency.toLowerCase(),
          product_data: {
            name: 'Shipping',
          },
          unit_amount: toSmallestUnit(data.shipping, data.currency), // Convert to smallest currency unit
        },
        quantity: 1,
      });
    }

    // Get URLs (lazy-loaded to ensure env vars are available)
    const { successUrl, cancelUrl } = getUrls();

    // Create the checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      customer_email: data.shippingInfo.email,
      shipping_address_collection: {
        allowed_countries: ['SE', 'US', 'GB', 'CA', 'AU'], // Add more countries as needed
      },
      metadata: {
        shipping_name: data.shippingInfo.fullName,
        shipping_email: data.shippingInfo.email,
        shipping_phone: data.shippingInfo.phone || '',
        shipping_address: data.shippingInfo.address,
        shipping_city: data.shippingInfo.city,
        shipping_postal_code: data.shippingInfo.postalCode,
        shipping_country: data.shippingInfo.country,
        discount_code: data.discountCode || '',
        discount_amount: data.discountAmount?.toString() || '0',
        subtotal: data.subtotal.toString(),
        shipping_cost: data.shipping.toString(),
        total: data.total.toString(),
        currency: data.currency,
        // Store items as JSON string for order creation in webhook
        items: JSON.stringify(data.items.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: calculateUnitPrice(item),
          product_discount_percentage: item.product.discount_percentage || 0,
          event_discount_percentage: item.activeEvent?.discount_percentage || 0,
        }))),
      },
    });

    return session;
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    throw error;
  }
}

/**
 * Retrieve a Stripe checkout session
 */
export async function retrieveCheckoutSession(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'customer', 'payment_intent'],
    });

    return session;
  } catch (error) {
    console.error('Error retrieving Stripe checkout session:', error);
    throw error;
  }
}


