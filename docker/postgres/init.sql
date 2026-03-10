-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable pg_trgm for fuzzy text search (useful for concept search later)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
