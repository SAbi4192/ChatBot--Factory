# ADR-003 — SQLite-backed retrieval instead of a vector database server

**Status:** Accepted · **Date:** Checkpoint 5

## Context
RAG needs chunk retrieval. ChromaDB / FAISS / pgvector add an external service or native
dependency — another thing that can fail on demo day.

## Decision
Store chunks in SQLite (`KnowledgeChunk`) and retrieve with **keyword scoring**:
tokenize the question, strip stopwords, score chunks by significant-term overlap, take top-5.
The scorer is a deterministic offline approximation of cosine similarity.

## Consequences
- Zero extra services; retrieval is instant and deterministic (great for a demo).
- Semantic recall is weaker than real embeddings. The schema keeps `embedding Json?` on
  `KnowledgeChunk` so real embeddings can be added later without a migration.
- Long-term memory uses the same term-recall approach across conversations.
