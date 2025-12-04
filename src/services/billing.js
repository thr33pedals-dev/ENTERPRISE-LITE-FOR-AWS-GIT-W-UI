/**
 * Stripe Billing Service for Enterprise Lite
 * Handles subscriptions, payments, and checkout sessions
 */

import Stripe from 'stripe';
import logger from '../utils/logger.js';

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Subscription plans configuration
export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 49,
    stripePriceId: process.env.STRIPE_PRICE_STARTER || 'price_starter',
    features: {
      salesAI: true,
      supportAI: false,
      interviewAI: false,
      documentsPerMonth: 50,
      interactionsPerMonth: 500,
      storage: '1GB'
    }
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    priceMonthly: 149,
    stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_professional',
    features: {
      salesAI: true,
      supportAI: true,
      interviewAI: true,
      documentsPerMonth: 200,
      interactionsPerMonth: 2000,
      storage: '5GB'
    }
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 499,
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise',
    features: {
      salesAI: true,
      supportAI: true,
      interviewAI: true,
      documentsPerMonth: 'unlimited',
      interactionsPerMonth: 'unlimited',
      storage: '50GB'
    }
  }
};

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured() {
  return !!stripe;
}

/**
 * Create a Stripe customer for a new company
 */
export async function createCustomer(companyData) {
  if (!stripe) {
    logger.warn('Stripe not configured, skipping customer creation');
    return { id: `mock_cus_${Date.now()}`, mock: true };
  }

  try {
    const customer = await stripe.customers.create({
      email: companyData.email,
      name: companyData.company_name || companyData.companyName,
      metadata: {
        tenantId: companyData.tenantId,
        companyId: companyData.id
      }
    });

    logger.info('Stripe customer created', { 
      customerId: customer.id, 
      email: companyData.email 
    });

    return customer;
  } catch (error) {
    logger.error('Failed to create Stripe customer', { error: error.message });
    throw error;
  }
}

/**
 * Create a checkout session for subscription signup
 */
export async function createCheckoutSession(options) {
  const { 
    email,
    companyName,
    plan = 'enterprise',
    successUrl, 
    cancelUrl
  } = options;

  if (!stripe) {
    logger.warn('Stripe not configured, returning mock session');
    return { 
      id: `mock_cs_${Date.now()}`, 
      url: successUrl + '?session_id=mock',
      mock: true 
    };
  }

  const planConfig = PLANS[plan];
  if (!planConfig) {
    throw new Error(`Invalid plan: ${plan}`);
  }

  try {
    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: planConfig.stripePriceId,
        quantity: 1
      }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      customer_email: email,
      metadata: {
        companyName,
        planId: plan
      },
      subscription_data: {
        metadata: {
          companyName,
          planId: plan
        }
      }
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    logger.info('Checkout session created', { 
      sessionId: session.id, 
      email,
      planId: plan 
    });

    return session;
  } catch (error) {
    logger.error('Failed to create checkout session', { error: error.message });
    throw error;
  }
}

/**
 * Create a billing portal session for managing subscription
 */
export async function createPortalSession(customerId, returnUrl) {
  if (!stripe) {
    return { url: returnUrl, mock: true };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });

    return session;
  } catch (error) {
    logger.error('Failed to create portal session', { error: error.message });
    throw error;
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhook(payload, signature) {
  if (!stripe) {
    logger.warn('Stripe not configured, skipping webhook');
    return { received: true, mock: true };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    logger.warn('Stripe webhook secret not configured');
    return { received: true, type: 'no_secret' };
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed', { error: err.message });
    throw new Error(`Webhook Error: ${err.message}`);
  }

  logger.info('Stripe webhook received', { type: event.type });

  // Return event data for processing in server.js
  return {
    received: true,
    type: event.type,
    data: event.data.object
  };
}

/**
 * Retrieve a checkout session
 */
export async function getCheckoutSession(sessionId) {
  if (!stripe) {
    return { id: sessionId, mock: true };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session;
  } catch (error) {
    logger.error('Failed to retrieve checkout session', { error: error.message });
    throw error;
  }
}

/**
 * Get subscription by ID
 */
export async function getSubscription(subscriptionId) {
  if (!stripe) {
    return { id: subscriptionId, status: 'active', mock: true };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    logger.error('Failed to retrieve subscription', { error: error.message });
    throw error;
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(subscriptionId, atPeriodEnd = true) {
  if (!stripe) {
    return { id: subscriptionId, canceled: true, mock: true };
  }

  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: atPeriodEnd
    });
    
    logger.info('Subscription canceled', { subscriptionId, atPeriodEnd });
    return subscription;
  } catch (error) {
    logger.error('Failed to cancel subscription', { error: error.message });
    throw error;
  }
}

export default {
  PLANS,
  isStripeConfigured,
  createCustomer,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  getCheckoutSession,
  getSubscription,
  cancelSubscription
};
