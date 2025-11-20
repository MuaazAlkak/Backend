# Stripe Webhook Setup for Live Mode

## Issue: Orders Not Created After Payment

If orders are not being created after successful payment in Stripe live mode, the webhook is likely not configured correctly.

## Steps to Fix

### 1. Check Your Backend URL

Your backend must be:
- ✅ **Publicly accessible** (not localhost)
- ✅ **Using HTTPS** (Stripe requires HTTPS for live webhooks)
- ✅ **Running and accessible**

**Test your webhook endpoint:**
```bash
curl https://your-backend-url.com/api/checkout/test-webhook
# Should return: {"status":"ok","message":"Webhook endpoint is accessible"}
```

### 2. Configure Webhook in Stripe Dashboard

#### For Live Mode:

1. **Go to Stripe Dashboard (Live Mode)**
   - Switch to "Live" mode (toggle in top right)
   - Go to: https://dashboard.stripe.com/webhooks

2. **Add Endpoint**
   - Click "Add endpoint"
   - Enter your webhook URL: `https://your-backend-url.com/api/checkout/webhook`
   - **Important:** Use your actual production URL, NOT localhost!

3. **Select Events**
   Select these events:
   - ✅ `checkout.session.completed`
   - ✅ `checkout.session.async_payment_succeeded`
   - ✅ `checkout.session.async_payment_failed`

4. **Get Signing Secret**
   - After creating the endpoint, click on it
   - Copy the "Signing secret" (starts with `whsec_`)
   - Add it to your `.env` file: `STRIPE_WEBHOOK_SECRET=whsec_...`
   
   **Note:** Currently webhook signature verification is disabled. For production, you should enable it.

### 3. Test the Webhook

#### Option A: Use Stripe CLI (Recommended for Testing)
```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to your local backend
stripe listen --forward-to http://localhost:3001/api/checkout/webhook

# Make a test payment
# The CLI will show webhook events in real-time
```

#### Option B: Make a Real Test Payment
1. Make a small test purchase (in live mode)
2. Check your backend logs for:
   ```
   === WEBHOOK ENDPOINT CALLED ===
   ✅ Webhook received: checkout.session.completed
   ✅ Order created...
   ```

### 4. Common Issues

#### Issue: "Webhook endpoint called" but no order created

**Possible causes:**
- Metadata missing from Stripe session
- Database connection issues
- Environment variables not set correctly

**Check logs for:**
```
❌ Failed to create order:
```

#### Issue: No webhook logs at all

**Possible causes:**
- Backend URL is wrong in Stripe dashboard
- Backend is not publicly accessible
- Firewall blocking Stripe IPs
- Backend is down

**Solutions:**
1. Verify webhook URL in Stripe dashboard
2. Test webhook endpoint: `curl https://your-backend-url.com/api/checkout/test-webhook`
3. Check backend is running and accessible
4. Check firewall/security group settings

#### Issue: "Invalid webhook event"

**Possible causes:**
- Wrong event format
- Webhook signature verification failing (if enabled)

**Solutions:**
1. Check Stripe dashboard webhook logs
2. Verify webhook signing secret is correct

### 5. Environment Variables Checklist

Make sure these are set in your production `.env`:

```bash
# Stripe (LIVE MODE)
STRIPE_SECRET_KEY=sk_live_...          # NOT sk_test_!
STRIPE_WEBHOOK_SECRET=whsec_...        # Get from webhook endpoint in dashboard

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# URLs
FRONTEND_URL=https://your-frontend-url.com
SUCCESS_URL=https://your-frontend-url.com/order-confirmation
CANCEL_URL=https://your-frontend-url.com/checkout?canceled=true

# Email (if using)
EMAIL_FROM=noreply@yourdomain.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### 6. Debugging Steps

1. **Check Stripe Dashboard → Webhooks → [Your Endpoint]**
   - Look at "Recent deliveries"
   - Click on failed deliveries to see error messages

2. **Check Your Backend Logs**
   - Look for: `=== WEBHOOK ENDPOINT CALLED ===`
   - Look for: `✅ Order created` or `❌ Failed to create order`

3. **Test with Stripe CLI**
   ```bash
   stripe listen --forward-to http://localhost:3001/api/checkout/webhook
   # Then make a test payment
   ```

4. **Verify Metadata is Being Sent**
   - In checkout code, verify metadata includes all required fields
   - Check: shipping info, items, totals, etc.

### 7. Production Deployment Checklist

- [ ] Backend is deployed and publicly accessible via HTTPS
- [ ] Environment variables are set in production
- [ ] Webhook is configured in Stripe **LIVE** mode dashboard
- [ ] Webhook URL uses production backend URL (not localhost)
- [ ] Backend logs are accessible for debugging
- [ ] Test payment made and order created successfully
- [ ] Confirmation email sent successfully

### 8. Quick Test

After setup, make a test payment and verify:

1. ✅ Stripe webhook shows "Succeeded" in dashboard
2. ✅ Backend logs show "Webhook endpoint called"
3. ✅ Backend logs show "Order created"
4. ✅ Order appears in database
5. ✅ Customer receives confirmation email

---

## Still Having Issues?

Check your backend logs for detailed error messages. The webhook handler now logs:
- All incoming webhook requests
- Metadata contents
- Order creation attempts
- Any errors with full stack traces

Look for lines starting with `===`, `✅`, or `❌` for key events.
