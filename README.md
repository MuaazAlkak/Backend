# Syria Checkout Backend

Backend API for handling checkout payment processing for ArvSouq ecommerce and dashboard using Stripe and Supabase.

## Features

- ✅ Stripe Checkout Session creation
- ✅ Order management with Supabase
- ✅ Stripe webhook handling for payment events
- ✅ Support for discounts (product and event-based)
- ✅ Multi-currency support
- ✅ Shipping address collection

## Prerequisites

- Node.js 18+ 
- Stripe account with API keys
- Supabase project with configured database

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

3. **Required environment variables:**
   - `STRIPE_SECRET_KEY` - Your Stripe secret key (starts with `sk_`)
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (bypasses RLS)
   - `FRONTEND_URL` - Your frontend URL (for CORS)
   - `SUCCESS_URL` - URL to redirect after successful payment
   - `CANCEL_URL` - URL to redirect if payment is canceled

## Development

Run the development server with hot reload:
```bash
npm run dev
```

The server will start on `http://localhost:3001` by default.

## Building

Build for production:
```bash
npm run build
```

Run the production build:
```bash
npm start
```

## API Endpoints

### POST `/api/checkout/create-session`
Creates a Stripe checkout session and order in the database.

**Request Body:**
```json
{
  "items": [
    {
      "product": {
        "id": "uuid",
        "title": { "en": "Product Name" },
        "price": 1000,
        "currency": "SEK",
        "images": ["url"],
        "discount_percentage": 10
      },
      "quantity": 2,
      "activeEvent": { "discount_percentage": 15 }
    }
  ],
  "shippingInfo": {
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "+46 70 123 4567",
    "address": "123 Main St",
    "city": "Stockholm",
    "postalCode": "123 45",
    "country": "Sweden"
  },
  "currency": "SEK",
  "discountCode": "SAVE10",
  "discountAmount": 100,
  "subtotal": 2000,
  "shipping": 49,
  "total": 2049
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/...",
  "session_id": "cs_test_...",
  "order_id": "uuid"
}
```

### GET `/api/checkout/retrieve-session`
Retrieves a Stripe checkout session by session ID.

**Query Parameters:**
- `session_id` - Stripe checkout session ID

**Response:**
```json
{
  "session_id": "cs_test_...",
  "payment_status": "paid",
  "status": "complete",
  "customer_email": "john@example.com",
  "amount_total": 2049,
  "currency": "sek",
  "metadata": { ... }
}
```

### POST `/api/checkout/webhook`
Stripe webhook endpoint for handling payment events.

**Note:** This endpoint accepts JSON payloads from Stripe webhooks. Configure your Stripe webhook to point to this endpoint.

## Stripe Webhook Setup

1. Go to your Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/checkout/webhook`
3. Select events to listen to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`

## Database Schema

The backend expects the following Supabase tables:

### `orders` table
- `id` (UUID, primary key)
- `user_id` (UUID, nullable)
- `total_amount` (INTEGER)
- `currency` (TEXT)
- `shipping` (JSONB)
- `status` (TEXT) - 'pending', 'processing', 'shipped', 'delivered', 'cancelled'
- `discount_code` (TEXT, nullable)
- `discount_amount` (INTEGER)
- `stripe_session_id` (TEXT, nullable)
- `payment_method` (TEXT)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### `order_items` table
- `id` (UUID, primary key)
- `order_id` (UUID, foreign key to orders)
- `product_id` (UUID, foreign key to products)
- `quantity` (INTEGER)
- `unit_price` (INTEGER)
- `created_at` (TIMESTAMPTZ)

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200` - Success
- `400` - Bad Request (validation errors)
- `500` - Internal Server Error

Error responses follow this format:
```json
{
  "error": "Error message"
}
```

## Security Notes

- The backend uses Supabase service role key which bypasses RLS policies. Keep this key secure.
- CORS is configured to only allow requests from the specified frontend URL.
- **Note:** Webhook signature verification is disabled. For production, consider implementing additional security measures for webhook endpoints.

## License

ISC

