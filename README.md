# Enterprise Lite Platform

A multi-tenant AI-powered business platform featuring Sales AI, Support AI, and Interview AI agents. Built with Node.js, Claude AI (Anthropic), and AWS services.

**Live Demo:** [https://p2mqs5thpe.ap-southeast-1.awsapprunner.com](https://p2mqs5thpe.ap-southeast-1.awsapprunner.com)

---

## Features

### 🤖 Sales AI
- Product FAQ chatbot powered by Claude AI
- Upload product catalogs (Excel, CSV, PDF) as knowledge base
- Generate shareable chat links for customers
- Real-time conversation with context-aware responses
- Lead tracking and conversation analytics

### 🛠️ Support AI
- Customer support chatbot with FAQ handling
- Multi-file knowledge base (Excel with VLOOKUP support, CSV, PDF)
- Automatic ticket classification and routing
- Conversation history and transcript downloads
- Singapore timezone support for transcripts

### 🎤 Interview AI
- AI-powered candidate screening interviews
- Customizable job roles and interview questions
- Claude AI evaluates responses in real-time
- Candidate-facing experience (no AI feedback shown to candidates)
- Downloadable interview results with scoring

### 📊 Analytics Dashboard
- Per-tenant usage tracking
- Interaction counts, resolved tickets, interview completions
- Chat and interview transcript management
- Downloadable transcripts in HTML format

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (HTML/JS)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Sales AI │  │Support AI│  │Interview │  │  Admin Dashboard │ │
│  │   Chat   │  │   Chat   │  │    AI    │  │   (Analytics)    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
└───────┼─────────────┼─────────────┼──────────────────┼──────────┘
        │             │             │                  │
        ▼             ▼             ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express.js Server (Node.js)                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     API Routes                              ││
│  │  /api/chat  /api/support  /api/interview-ai  /api/analytics ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     Services                                ││
│  │  claude-service │ ai-config-service │ transcript-service    ││
│  │  analytics-service │ storage-service │ usage-events         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
        │                                            │
        ▼                                            ▼
┌───────────────────┐                    ┌───────────────────────┐
│   Claude AI API   │                    │      AWS S3           │
│   (Anthropic)     │                    │  - Processed files    │
│                   │                    │  - Transcripts        │
└───────────────────┘                    │  - Analytics events   │
                                         │  - AI configurations  │
                                         └───────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, Tailwind CSS, Vanilla JavaScript |
| Backend | Node.js 18+, Express.js |
| AI | Claude Sonnet 4/4.5 (Anthropic via AWS Bedrock) |
| Storage | AWS S3 (multi-tenant buckets) |
| Database | AWS DynamoDB (on-demand) |
| File Processing | xlsx, pdf-parse, mammoth |
| Deployment | AWS App Runner, Docker |
| Authentication | AWS Cognito (production), Preview mode (demo) |
| Payments | Stripe (subscriptions & billing) |

---

## Cost Analysis

See **[docs/COST-ANALYSIS.md](docs/COST-ANALYSIS.md)** for detailed pricing breakdown.

### Quick Reference (SGD, Dec 2024)

| Metric | Value |
|--------|-------|
| **Token cap per customer** | 50-65M/month |
| **Cost per customer** | ~SGD 400/month |
| **Simple questions** | ~40,000/month |
| **Heavy PDF processing** | ~215/month |

### Per-Question Cost

| Query Type | Cost (SGD) |
|------------|------------|
| Simple chat | SGD 0.02 |
| Standard reasoning | SGD 0.10 |
| PDF processing | SGD 0.35-1.60 |

### AWS Services Used

| Service | Purpose |
|---------|---------|
| App Runner | Compute/hosting |
| S3 | File storage (2 buckets) |
| DynamoDB | Database (6 tables) |
| Cognito | User authentication |
| CloudWatch | Logs & monitoring |
| Bedrock | Claude AI API |

---

## AI Engine — Intelligent Inference

The platform uses a **reasoning-augmented approach** that goes beyond simple RAG (Retrieval Augmented Generation):

### Think Tool (Chain-of-Thought Reasoning)

```
User Question
├── Iteration 0: Initial analysis
├── Iteration 1: Think tool - policy check, cross-reference
├── Iteration 2: Think tool - compliance verification
└── Iteration 3: Final synthesized response
```

**MAX_THINK_ITERATIONS = 3** (configurable in `claude-client.js`)

### Key Differentiators

| Traditional RAG | Enterprise Lite IIE |
|-----------------|---------------------|
| Keyword/semantic search | Intent understanding |
| Single document lookup | Multi-document reasoning |
| Returns matching text | Synthesizes actionable answers |
| No compliance awareness | Policy & compliance checking |

### Example Use Case

**Employee asks:** "Can I sign up as a Grab driver?"

**Traditional RAG:** Searches for "Grab driver" in policy docs → No exact match → Vague answer

**Enterprise Lite IIE:**
1. Understands intent: "Can I do part-time work?"
2. Cross-references: Employment contract, Conflict of Interest Policy, Code of Conduct
3. Checks: Disclosure requirements, approval process
4. Returns: Clear, compliant answer with required actions

---

## Getting Started

### Prerequisites
- Node.js 18+
- Anthropic API Key
- AWS Account with S3 bucket

### Local Development

```bash
# Clone repository
git clone <repo-url>
cd enterprise-lite-platform

# Install dependencies
npm install

# Configure environment
cp env.example.txt .env
# Edit .env with your API keys

# Start development server
npm run dev
```

### Environment Variables

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=your-bucket-name

# AWS Credentials (for local dev)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Optional
PORT=3000
NODE_ENV=development
VISION_PDF_ENABLED=true
```

---

## Deployment (AWS App Runner)

```bash
# Build and push Docker image
docker buildx build --platform linux/amd64 \
  -t <ECR_REPO>:latest --push .

# App Runner auto-deploys on image push
```

See `apprunner.yaml` for service configuration.

---

## Project Structure

```
├── server.js               # Main Express server
├── public/                 # Frontend files
│   ├── index.html          # Landing page
│   ├── admin.html          # Admin dashboard
│   ├── sales-ai.html       # Sales AI setup
│   ├── support-ai.html     # Support AI setup
│   ├── interview-ai.html   # Interview AI setup
│   ├── chat.html           # Customer chat interface
│   └── js/                 # Frontend JavaScript
├── src/
│   ├── services/           # Business logic
│   │   ├── claude-service.js
│   │   ├── ai-config-service.js
│   │   ├── transcript-service.js
│   │   ├── analytics-service.js
│   │   └── storage-service.js
│   └── storage/            # S3 storage utilities
├── Dockerfile              # Docker build config
├── apprunner.yaml          # AWS App Runner config
└── env.example.txt         # Environment template
```

---

## API Endpoints

### Chat
- `POST /api/chat` - Send message to Sales/Support AI
- `GET /api/chat/:sessionId` - Get chat history

### Interview AI
- `POST /api/interview-ai/start-session` - Start interview
- `POST /api/interview-ai/evaluate` - Evaluate answer
- `GET /api/interview-ai/results/:sessionId` - Get results

### Analytics
- `GET /api/analytics` - Get analytics events
- `GET /api/analytics/summary` - Get aggregated metrics

### Transcripts
- `GET /api/transcripts` - List transcripts
- `GET /api/transcripts/:id/download` - Download transcript

---

## Multi-Tenancy

Data is isolated per tenant using S3 path prefixes:

```
s3://bucket/
├── tenants/
│   └── {tenant-id}/
│       ├── processed/          # Uploaded knowledge base
│       ├── transcripts/        # Chat logs
│       │   ├── sales/
│       │   └── support/
│       ├── analytics/          # Usage events
│       │   ├── sales/
│       │   ├── support/
│       │   └── interview/
│       └── ai-configs/         # AI agent settings
│           ├── sales/
│           ├── support/
│           └── interview/
```

---

## Preview Mode

For demos, use preview mode (no AWS Cognito required):
- Tenant ID defaults to `default`
- All features functional
- Data persists in S3 under `tenants/default/`

---

## Usage Throttling & Plans

Token limits are enforced per tenant (see `billing.js`):

| Plan | Tokens/Month | Max/Query | Price |
|------|--------------|-----------|-------|
| Starter | 20M | 50K | SGD 149 |
| Professional | 65M | 200K | SGD 299 |
| Enterprise | 200M | 500K | SGD 499 |

### Scaling Token Caps

| Customers | Recommended Cap |
|-----------|-----------------|
| 1 (launch) | 50M tokens |
| 2-4 (early) | 60M tokens |
| 5+ (growth) | 65M tokens |

---

## Documentation

| Document | Description |
|----------|-------------|
| [README.md](README.md) | This file - project overview |
| [docs/COST-ANALYSIS.md](docs/COST-ANALYSIS.md) | Detailed cost breakdown (SGD) |
| [docs/cost-projections.csv](docs/cost-projections.csv) | Excel-compatible cost data |
| [infrastructure/README.md](infrastructure/README.md) | AWS infrastructure setup |
| [env.example.txt](env.example.txt) | Environment variables template |

---

## License

Private - All rights reserved.
