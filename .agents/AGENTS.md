# Application Features Summary

The newpage.ai application currently implements the following key features:

## Core Features
- **Resume Upload & Parsing**: Allows uploading a resume PDF, extracting text (using `pdf-parse`), and using heuristic section parsing to structure the resume data (skills, experience, etc.).
- **Job Description Import**: Supports adding multiple job descriptions (structured inputs + raw text).
- **Skill Matching & Gap Analysis**: 
  - Compares the parsed resume against job descriptions using structured analysis (no LLM required).
  - Uses Jaccard bigram similarity and exact substring matching.
  - Highlights match scores, skill gaps, and experience alignment.

## RAG & LLM Features
- **Semantic Search (RAG)**: Uses an in-memory vector store with cosine similarity to chunk and embed documents (Resume + Jobs).
- **Conversational Q&A**: Includes a chat interface for asking context-aware questions about the candidate's fit for the roles (e.g., "What skills am I missing?").
- **Multi-Provider Support**: Integrates with both OpenAI and Gemini AI for generating embeddings and chat completions, with automatic fallback handling if the primary provider fails.

## Architecture
- **Framework**: Built with Next.js 15 (App Router) integrating React UI with backend API routes.
- **Styling**: Uses Vanilla CSS with custom properties for a flexible design system.
- **State Management**: Utilizes an in-memory session store.
- **Deployment**: Provides a Docker setup for containerized local execution.
