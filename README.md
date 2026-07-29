# newpage.ai — Career Intelligence Assistant

A full-stack application that analyzes resumes against job descriptions using a combination of structured comparison and RAG-powered natural language Q&A.

Upload a resume PDF and multiple job postings, then:
- See match scores, skill gaps, and experience alignment at a glance
- Ask questions like *"What skills am I missing for this role?"* or *"Compare my fit across all jobs"*

---

## Quick Setup

### Prerequisites
- **Node.js 20+**
- **OpenAI API key** (for chat/RAG features — structured analysis works without it)

### Local Development

```bash
# 1. Clone
git clone https://github.com/ivan-koltsov/newpage-ai.git
cd newpage-ai

# 2. Install
npm install

# 3. Configure
cp .env.example .env.local
# Edit .env.local and add your OPENAI_API_KEY

# 4. Run
npm run dev
# → http://localhost:3000
```

### Docker

```bash
# Build and run
OPENAI_API_KEY=sk-your-key docker compose up --build

# → http://localhost:3000
```

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                     Next.js 15 (App Router)                    │
│                                                                │
│  ┌──────────────┐    ┌──────────────────────────────────────┐  │
│  │   React UI   │───▶│          API Routes (/api)           │  │
│  │              │    │                                      │  │
│  │  ┌─────────┐ │    │  POST /api/upload  → PDF→text→embed  │  │
│  │  │ Upload  │ │    │  POST /api/jobs    → store + embed   │  │
│  │  │ Sidebar │ │    │  POST /api/analyze → skill matching  │  │
│  │  │ Dashbd  │ │    │  POST /api/chat    → RAG + LLM Q&A  │  │
│  │  │ Chat    │ │    │                                      │  │
│  │  └─────────┘ │    └───────────┬──────────────────────────┘  │
│  └──────────────┘                │                              │
│                    ┌─────────────▼─────────────┐               │
│                    │       Core Engine          │               │
│                    │                            │               │
│                    │  analyzer.ts  │ rag.ts     │               │
│                    │  chunker.ts   │ llm.ts     │               │
│                    │  vectorStore  │ store.ts   │               │
│                    └─────────────┬─────────────┘               │
│                                  │                              │
│                    ┌─────────────▼─────────────┐               │
│                    │     OpenAI API             │               │
│                    │  text-embedding-3-small    │               │
│                    │  gpt-4o-mini               │               │
│                    └───────────────────────────┘               │
└────────────────────────────────────────────────────────────────┘
```

**Data flow:**
1. Resume PDF → `pdf-parse` → clean text → heuristic section parsing → `ResumeData`
2. Job description form → structured `JobDescription` + raw text
3. Both documents → chunked → embedded via OpenAI → stored in in-memory vector store
4. Analysis request → Jaccard bigram skill matching + experience scoring → `AnalysisResult`
5. Chat question → embed → retrieve top-5 chunks → build system prompt with structured data + passages → GPT-4o-mini stream

---

## RAG/LLM Approach & Decisions

### LLM Selection: GPT-4o-mini

| Option Considered | Decision | Reasoning |
|---|---|---|
| GPT-4o | ❌ | Higher quality but 10× cost, overkill for structured Q&A |
| **GPT-4o-mini** | ✅ | Best cost/quality ratio for grounded factual answers; fast streaming |
| Local models (Ollama) | ❌ for now | Zero-config cloud API preferred for submission; architecture supports swap via `llm.ts` |
| Claude Sonnet | ❌ | OpenAI SDK is more widely known; equivalent quality for this task |

### Embedding Model: text-embedding-3-small

- 1536 dimensions, strong retrieval quality
- $0.02/1M tokens — negligible cost for resume-scale documents
- Alternative considered: `text-embedding-3-large` (3072 dims) — unnecessary for our corpus size (<200 chunks)

### Vector Database: In-Memory Cosine Similarity

- **Why**: Zero infrastructure, instant setup, adequate for single-session scale (~50-200 chunks per session)
- **Trade-off**: Not persistent, no concurrent multi-user support. State lost on process restart.
- **Production path**: Swap `VectorStore` class for pgvector, Pinecone, or Weaviate. The interface is identical — `add()`, `search()`, `removeDocument()`.

### Chunking Strategy

- **Recursive character splitting** with configurable size (500 chars default) and overlap (100 chars)
- Separator hierarchy: `\n\n` → `\n` → `. ` → `, ` → ` ` → hard split
- Each chunk tagged with `{ source, documentId, chunkIndex }` for attribution
- **Why this approach**: Simple, effective for well-structured documents. No dependency on external chunking libraries.

### Retrieval & Prompt Engineering

- **Hybrid context**: System prompt includes both structured data (parsed resume, JD skills, scores) AND retrieved text passages
- **Top-5 retrieval** with minimum relevance threshold (0.3 cosine similarity)
- **Conversational memory**: Last 6 messages included for follow-up questions
- **Guardrails**: System prompt instructs the LLM to stay grounded, cite specific data, never fabricate, and be constructive

### Structured Analysis (No LLM Required)

The skill matching engine works entirely without an LLM:
- **Jaccard bigram similarity**: Character-level n-gram comparison between skill strings
- **Exact substring matching**: Catches cases like "Node.js" ⊂ "node.js backend"
- **Configurable threshold**: Default 0.6 similarity to count as "matched"
- **Weighted scoring**: 50% hard skills, 20% soft skills, 30% experience (configurable)

---

## Key Technical Decisions

| Decision | Reasoning |
|---|---|
| **Next.js 15 App Router** | Full-stack in one codebase — API routes, React, SSR. Standalone output for Docker. |
| **Vanilla CSS** | Maximum control over the design system. No framework version conflicts. Custom properties for all tokens. |
| **In-memory session store** | Good enough for demo/single-user. Documents the production path (Redis/DB). |
| **Streaming chat responses** | Uses `ReadableStream` tee — one stream for the client, one to collect the full response for chat history. |
| **Graceful LLM degradation** | If no `OPENAI_API_KEY` is set, structured analysis still works fully. Only chat/RAG features are disabled. |
| **pdf-parse** over pdfplumber | pdfplumber is Python-only. pdf-parse is the standard Node.js PDF text extraction library. |
| **Heuristic resume parsing** | Regex-based section detection is fast, predictable, and requires no API calls. Trade-off: less accurate on unconventional layouts. |

---

## Engineering Standards

### Followed
- **TypeScript strict mode** — all code is fully typed with no `any` escapes
- **Clean separation of concerns** — `src/lib/` for core engine (server-only), `src/components/` for UI, `src/app/api/` for routes
- **Structured logging** — JSON logs with timestamps, component tags, and metadata (token counts, latencies)
- **Docker containerization** — multi-stage build, non-root user, standalone output (~150MB image)
- **Environment-based configuration** — all secrets and model choices via env vars
- **Graceful error handling** — API routes return proper HTTP status codes and user-friendly error messages

### Skipped (time constraints)
- **Automated tests** — would add Jest + React Testing Library for components, and API route integration tests
- **CI/CD pipeline** — would add GitHub Actions for lint, test, build, push to container registry
- **Rate limiting** — the API has no rate limiting; production would add middleware or use a gateway
- **Authentication** — no user auth; production would add session-based auth or OAuth
- **Database persistence** — all state is in-memory; production would persist sessions and chat history

---

## What I'd Do Differently with More Time

1. **Persistent storage**: PostgreSQL with pgvector for embeddings, Drizzle ORM for sessions/chat
2. **LLM-powered JD parsing**: Use the LLM to extract structured skills from raw job description text (better than manual input)
3. **Resume PDF rendering**: Show the original PDF in a viewer with highlighted matching sections
4. **Multi-model support**: Add Anthropic Claude and local Ollama as provider options via the `llm.ts` abstraction
5. **Interview prep module**: Generate role-specific interview questions based on the gap analysis
6. **Evaluation framework**: Build a test harness with ground-truth resume/JD pairs to measure retrieval quality (precision@K, MRR)
7. **Observability**: Add OpenTelemetry tracing, Prometheus metrics, and a Grafana dashboard
8. **Caching**: Cache embeddings by content hash to avoid redundant API calls
9. **Batch comparison view**: Side-by-side dashboard comparing fit across multiple jobs simultaneously

---

## Productionization & Scaling

To deploy on AWS/GCP/Azure:

| Component | Production Solution |
|---|---|
| **Compute** | ECS Fargate / Cloud Run / Azure Container Apps |
| **Vector DB** | Amazon OpenSearch / Cloud SQL + pgvector / Pinecone |
| **Session store** | Redis (ElastiCache) or DynamoDB |
| **File storage** | S3 / Cloud Storage for uploaded PDFs |
| **CDN** | CloudFront / Cloud CDN for static assets |
| **Auth** | Cognito / Firebase Auth / Auth0 |
| **Monitoring** | CloudWatch / Cloud Monitoring + OpenTelemetry |
| **CI/CD** | GitHub Actions → ECR → ECS deploy |

**Scaling considerations**:
- Vector store becomes the bottleneck at scale → use a managed vector DB with ANN indexing
- LLM API calls are the latency bottleneck → add response caching by content hash
- Separate the API server from the Next.js SSR server for independent scaling
- Add a job queue (SQS/Cloud Tasks) for async PDF processing

---

## How I Used AI Tools

I used AI coding assistants (Gemini in Antigravity IDE) throughout this project:

**Where AI excelled:**
- Generating boilerplate (API routes, TypeScript interfaces, CSS design system)
- Suggesting architectural patterns (stream tee for chat history, recursive chunking)
- Writing comprehensive documentation structure

**Where I applied judgment:**
- Choosing the RAG architecture (hybrid structured + retrieval context)
- Designing the scoring weights and similarity thresholds
- Deciding what to keep in-memory vs. what needs persistence
- Writing this README's decision rationale sections
- Reviewing and refining all AI-generated code for correctness and style

**My approach to AI-assisted development:**
- Use AI for the first draft, then review every line for correctness
- Be specific about requirements — vague prompts produce generic code
- Always verify AI suggestions against documentation (especially for newer APIs like Next.js App Router)
- Treat AI output as a starting point, not a final product

---

## Project Structure

```
newpage-ai/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx            # Root layout + metadata
│   │   ├── page.tsx              # Main application page
│   │   ├── globals.css           # Design system + all styles
│   │   └── api/
│   │       ├── upload/route.ts   # Resume PDF upload
│   │       ├── jobs/route.ts     # Job CRUD
│   │       ├── analyze/route.ts  # Structured comparison
│   │       └── chat/route.ts     # RAG + LLM streaming
│   ├── components/               # React components
│   │   ├── FileUpload.tsx        # Drag-and-drop PDF upload
│   │   ├── JobCard.tsx           # Job listing card
│   │   ├── AnalysisDashboard.tsx # Scores + skill breakdown
│   │   ├── GapReport.tsx         # Missing skills display
│   │   └── ChatPanel.tsx         # Streaming chat interface
│   └── lib/                      # Core engine (server-side)
│       ├── analyzer.ts           # PDF parsing + skill matching
│       ├── schema.ts             # All TypeScript types
│       ├── chunker.ts            # Document chunking
│       ├── vectorStore.ts        # In-memory vector store
│       ├── llm.ts                # OpenAI wrapper
│       ├── rag.ts                # RAG orchestration
│       ├── store.ts              # Session management
│       └── logger.ts             # Structured logging
├── Dockerfile                    # Multi-stage production build
├── docker-compose.yml            # Single-command deployment
├── .env.example                  # Environment template
└── README.md                     # This file
```

---

## License

ISC