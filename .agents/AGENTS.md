# Application Features Summary

The newpage.ai application currently implements the following key features:

## Core Features
- **Resume Upload & Parsing**: 
  - Extracts text from uploaded PDFs (using `pdf-parse`).
  - Employs strict heuristic parsing to divide the resume into sections (summary, skills, experience, education), guarding against accidental section splits.
  - Implements an overlap-aware (Set-based) experience calculator to accurately sum working years from scattered date ranges across the entire document.
- **Job Description Import**: Supports adding multiple job descriptions (structured inputs + raw text).
  - Includes an Auto-Import flow with quick-access to popular providers (DOU.EU, DOU.UA, LinkedIn) utilizing a streamlined manual-paste UI to bypass strict browser cross-origin constraints.
- **Skill Matching & Gap Analysis**: 
  - Compares the parsed resume against job descriptions using structured analysis (no LLM required).
  - Uses Jaccard bigram similarity and exact substring matching.
  - Highlights match scores, skill gaps, and experience alignment.

## RAG & LLM Features
- **Semantic Search (RAG)**: Uses an in-memory vector store with cosine similarity to chunk and embed documents (Resume + Jobs).
- **Conversational Q&A**: Includes a chat interface for asking context-aware questions about the candidate's fit for the roles (e.g., "What skills am I missing?").
- **Robust Multi-Provider Support**: 
  - Integrates with both OpenAI and Gemini AI for generating embeddings and chat completions.
  - Features an **Intelligent Model Cascade Engine**: If a model hits a `503 High Demand` or `429 Rate Limit` error, the system instantly cascades through stable alternative models within the same provider (e.g. `gemini-flash-latest` -> `gemini-3.1-pro-preview`) before executing a hard failover to the secondary provider.

## Architecture
- **Framework**: Built with Next.js 15 (App Router) integrating React UI with backend API routes.
- **Styling**: Uses Vanilla CSS with custom properties for a flexible design system.
- **State Management**: Utilizes an in-memory session store.
- **Deployment**: Provides a Docker setup for containerized local execution.
