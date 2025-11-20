# Local Webhook Setup Guide

## Problem
Your domain `arvsouq.com` is not live yet, so Stripe cannot reach your webhook endpoint at `https://arvsouq.com/api/checkout/webhook`. This means webhooks are not being delivered, and therefore confirmation emails are not being sent.

## Solution: Use Stripe CLI for Local Testing

Stripe CLI allows you to forward webhooks from Stripe to your local development server.

### Step 1: Install Stripe CLI

**Windows (using Scoop):**
```powershell
scoop install stripe
```

**Windows (using Chocolatey):**
```powershell
choco install stripe
```

**Windows (Manual):**
1. Download from: https://github.com/stripe/stripe-cli/releases/latest
2. Extract and add to PATH

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux:**
```bash
# Download and install
wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_X.X.X_linux_x86_64.tar.gz
tar -xvf stripe_X.X.X_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/
```

### Step 2: Login to Stripe CLI

```bash
stripe login
```

This will open your browser to authenticate with your Stripe account.

### Step 3: Forward Webhooks to Local Server

In a **separate terminal window** (keep your backend server running), run:

```bash
stripe listen --forward-to http://localhost:3001/api/checkout/webhook
```

You should see output like:
```
> Ready! Your webhook signing secret is whsec_xxxxx (^C to quit)
```

**Important:** Keep this terminal window open while testing!

### Step 4: Test the Webhook

1. Make a test purchase on your site (http://localhost:8080)
2. Watch BOTH terminal windows:
   - **Backend server** should show: `Webhook endpoint called`
   - **Stripe CLI** should show webhook events being forwarded
3. Check your server logs for email sending confirmation

### Step 5: Verify Webhook Delivery

In Stripe Dashboard → Webhooks → Your endpoint → Events tab, you'll see webhook events being delivered through the CLI.

## Alternative: Use ngrok (If Stripe CLI doesn't work)

### Step 1: Install ngrok
Download from: https://ngrok.com/download

### Step 2: Start ngrok tunnel
```bash
ngrok http 3001
```

### Step 3: Update Stripe Webhook URL
1. Copy the HTTPS URL from ngrok (e.g., `https://abc123.ngrok.io`)
2. Go to Stripe Dashboard → Webhooks
3. Update your webhook endpoint URL to: `https://abc123.ngrok.io/api/checkout/webhook`
4. Save

### Step 4: Test
Make a purchase and webhooks will be forwarded through ngrok to your local server.

## Current Status

- ✅ Backend server running on `http://localhost:3001`
- ✅ Frontend running on `http://localhost:8080`
- ✅ SMTP configured correctly
- ❌ Webhook endpoint not reachable (domain not live)
- ✅ Solution: Use Stripe CLI or ngrok for local testing

## Quick Test Command

Once Stripe CLI is running, you can manually trigger a test webhook:

```bash
stripe trigger checkout.session.completed
```

This will send a test `checkout.session.completed` event to your local server.

## Production Setup (When Domain is Live)

Once your domain `arvsouq.com` is live and pointing to your server:

1. Update Stripe webhook URL to: `https://arvsouq.com/api/checkout/webhook`
2. Remove Stripe CLI forwarding (no longer needed)
3. Webhooks will be delivered automatically

