# Enterprise Lite Platform — Cost Analysis

**Last Updated:** December 2024  
**Currency:** SGD (Exchange Rate: 1 USD = 1.2935 SGD)

---

## Overview

This document outlines the operational costs for running the Enterprise Lite AI Platform on AWS, including Claude API costs via AWS Bedrock, infrastructure costs, and payment processing fees.

---

## 1. AWS Bedrock Pricing (Singapore Region)

### Claude Sonnet 4/4.5

| Metric | USD | SGD |
|--------|-----|-----|
| Input per 1K tokens | $0.003 | SGD 0.00388 |
| Output per 1K tokens | $0.015 | SGD 0.0194 |
| **Input per MTok** | $3.00 | **SGD 3.88** |
| **Output per MTok** | $15.00 | **SGD 19.40** |

### Other Models (Alternative Options)

| Model | Input/MTok (SGD) | Output/MTok (SGD) | Use Case |
|-------|------------------|-------------------|----------|
| Claude Haiku 4.5 | SGD 1.29 | SGD 6.47 | Simple FAQ routing |
| Claude Sonnet 4/4.5 | SGD 3.88 | SGD 19.40 | Standard usage |
| Claude Opus 4.5 | SGD 6.47 | SGD 32.34 | Complex reasoning |

### Batch & Cache Pricing

| Mode | Input/MTok (SGD) | Savings |
|------|------------------|---------|
| Standard | SGD 3.88 | — |
| Batch (async) | SGD 1.94 | 50% off |
| Cache write | SGD 4.85 | 25% more |
| **Cache read** | SGD 0.39 | **90% off** |

---

## 2. Per-Question Cost (Actual Usage Data)

Based on actual API logs from production testing:

| Query Type | Input Tokens | Output Tokens | Cost (SGD) |
|------------|--------------|---------------|------------|
| Simple chat | ~1K | ~500 | **SGD 0.02** |
| Standard with think tool | ~20K | ~500 | **SGD 0.10** |
| Document query | ~50K | ~1K | **SGD 0.25** |
| PDF processing (light) | ~80K | ~1.5K | **SGD 0.35** |
| PDF processing (heavy) | ~200K | ~1.5K | **SGD 0.80** |
| PDF processing (very heavy) | ~400K | ~2K | **SGD 1.60** |

### Think Tool Chain (MAX_THINK_ITERATIONS = 3)

Each user question may trigger 1-4 Claude API calls:

```
User Question
├── Iteration 0: Initial response (~5K tokens)
├── Iteration 1: Think tool (if needed, +5K accumulated)
├── Iteration 2: Think tool (if needed, +5K accumulated)
└── Iteration 3: Final response (if needed, +5K accumulated)
```

---

## 3. AWS Infrastructure Costs

| Component | Usage | Cost (SGD/month) |
|-----------|-------|------------------|
| **App Runner** | 1 vCPU, 2GB RAM | SGD 45-84 |
| **S3 Storage** | 2 buckets, ~5GB | SGD 0.16 |
| **S3 Requests** | ~100K requests | SGD 0.50 |
| **DynamoDB** | On-demand, ~20K ops | SGD 0.50 |
| **Cognito** | < 50K MAU | Free |
| **CloudWatch** | Logs (~5GB) | SGD 6-19 |
| **IAM/STS** | Roles | Free |
| **Infra Total** | | **SGD 52-105** |

### DynamoDB Tables

| Table | Purpose |
|-------|---------|
| Companies | Tenant/company data |
| Personas | AI persona configs |
| PersonasConfig | Sales/Support/Interview settings |
| Transcripts | Chat conversation history |
| Analytics | Usage events |
| LinkTracking | Shareable link clicks |

---

## 4. Payment Processing (Stripe)

| Fee Type | Rate |
|----------|------|
| Card payments (local SG) | 3.4% + SGD 0.50 |
| Card payments (international) | 3.9% + SGD 0.50 |
| Subscription billing | +0.5% per invoice |

**Example: SGD 500 charge**
- Local card: SGD 17.50 fee → Net SGD 482.50
- International: SGD 20.00 fee → Net SGD 480.00

---

## 5. Per-Customer Cost Budget

### All-In Budget: SGD 400/customer/month

| Component | Cost (SGD) |
|-----------|------------|
| AWS Infra (shared, 10 customers) | SGD 10 |
| Stripe fees (~3.4% + $0.50) | SGD 20 |
| **Available for Claude** | **SGD 370** |

### Token Cap by Number of Customers (Scaling)

With fewer customers, AWS infra cost per customer is higher:

| Customers | AWS Infra/Customer | Stripe | Claude Budget | Token Cap |
|-----------|-------------------|--------|---------------|-----------|
| **1** | SGD 90 | SGD 20 | SGD 290 | **50M** |
| **2** | SGD 45 | SGD 20 | SGD 335 | **60M** |
| **3** | SGD 30 | SGD 20 | SGD 350 | **62M** |
| **5** | SGD 18 | SGD 20 | SGD 362 | **65M** |
| 10+ | SGD 10 | SGD 20 | SGD 370 | 65M |

### Recommended Token Cap by Stage

| Stage | Customers | Token Cap | Heavy PDF Qs | Simple Qs |
|-------|-----------|-----------|--------------|-----------|
| **Launch** | 1 | **50M** | ~165 | ~31,000 |
| **Early** | 2-4 | **60M** | ~200 | ~37,500 |
| **Growth** | 5+ | **65M** | ~215 | ~40,000 |

### Full Token Cap (10+ Customers)

| Setting | Value |
|---------|-------|
| **Hard cap per customer** | **65M tokens/month** |
| Estimated Claude cost | ~SGD 353 |
| Total cost per customer | ~SGD 383 |
| Buffer | ~SGD 17 |

### What 65M Tokens Gets You

| Query Type | Quantity Possible |
|------------|-------------------|
| Simple chat questions | ~40,000 |
| Standard reasoning questions | ~3,250 |
| Heavy PDF processing | ~215 |
| Realistic mix (70/20/10) | ~5,000 |

---

## 6. Monthly Projections by Usage Level

### Per-Customer (65M Token Cap)

| Usage Pattern | Questions/Month | Cost (SGD) |
|---------------|-----------------|------------|
| Light (simple chat) | ~10,000 | ~SGD 200 |
| Medium (mixed) | ~3,000 | ~SGD 350 |
| Heavy (PDF processing) | ~200 | ~SGD 400 |

### Platform Total (10 Customers)

| Scenario | Claude | AWS Infra | Stripe | Total (SGD) |
|----------|--------|-----------|--------|-------------|
| All Light | SGD 2,000 | SGD 100 | SGD 200 | **SGD 2,300** |
| All Medium | SGD 3,500 | SGD 100 | SGD 200 | **SGD 3,800** |
| All Heavy | SGD 4,000 | SGD 100 | SGD 200 | **SGD 4,300** |

---

## 7. Cost Optimization Strategies

| Strategy | Savings | Implementation |
|----------|---------|----------------|
| **Route to Haiku** | 67% | Simple FAQ → Haiku 4.5 |
| **Batch API** | 50% | Async interview evaluations |
| **Prompt caching** | Up to 90% | Repeated system prompts |
| **Limit chain depth** | ~40% | Cap MAX_THINK_ITERATIONS |
| **Shorter prompts** | 10-20% | Optimize system prompts |

### Prompt Caching Impact

| Caching | 65M Token Cost | Effective Tokens |
|---------|----------------|------------------|
| No caching | SGD 353 | 65M |
| 50% cache hits | SGD 195 | 65M |
| 80% cache hits | SGD 110 | 65M |

---

## 8. Throttling Implementation

### Recommended Limits (billing.js)

```javascript
PLANS = {
  starter: {
    tokensPerMonth: 20000000,     // 20M tokens
    maxTokensPerQuery: 50000,     // 50K per question
    priceMonthly: 149
  },
  professional: {
    tokensPerMonth: 65000000,     // 65M tokens
    maxTokensPerQuery: 200000,    // 200K per question
    priceMonthly: 299
  },
  enterprise: {
    tokensPerMonth: 200000000,    // 200M tokens
    maxTokensPerQuery: 500000,    // 500K per question
    priceMonthly: 499
  }
}
```

---

## 9. App Runner Capacity

| Instances | Concurrent Users | Cost (SGD/month) |
|-----------|------------------|------------------|
| 1 | ~50-100 | SGD 45-84 |
| 5 | ~250-500 | SGD 225-420 |
| 10 | ~500-1000 | SGD 450-840 |

### Rate Limit Bottleneck (Anthropic API Tiers)

| Tier | Requests/min | Tokens/min |
|------|--------------|------------|
| Tier 1 | 50 | 40,000 |
| Tier 2 | 1,000 | 80,000 |
| Tier 3 | 2,000 | 160,000 |
| Tier 4 | 4,000 | 400,000 |

---

## 10. Quick Reference

### SGD 400/Customer Budget

| Item | Value |
|------|-------|
| Token cap | 65M/month |
| Heavy PDF questions | ~215/month |
| Simple questions | ~40,000/month |
| AWS share | SGD 10 |
| Stripe fees | SGD 20 |
| Claude budget | SGD 370 |

### Break-Even Analysis

| Monthly Cost | Equivalent FTE |
|--------------|----------------|
| SGD 400/customer | ~0.08 FTE |
| 10 customers @ SGD 400 | ~0.8 FTE |

*Assuming SGD 5,000/month for junior admin role*

---

## Appendix: Actual API Log Analysis

Sample from production testing (December 2024):

| Time | Calls | Total Input | Type | Cost (SGD) |
|------|-------|-------------|------|------------|
| Simple query | 2 | 563 | FAQ | SGD 0.02 |
| Standard query | 4 | 33,305 | Reasoning | SGD 0.15 |
| Heavy PDF | 6 | 416,273 | Document | SGD 1.65 |

---

*Document maintained by: Platform Team*  
*See also: `docs/cost-projections.csv` for Excel-compatible data*

