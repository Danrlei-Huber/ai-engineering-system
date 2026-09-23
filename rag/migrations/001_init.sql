-- Embedding contract (ADR-006): bge-m3, 1024 dimensions, cosine distance.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project     text NOT NULL,                       -- scope; '_global' for plugin content
  collection  text NOT NULL CHECK (collection IN ('docs', 'decisions', 'standards', 'external')),
  path        text,                                -- repo-relative path for local sources
  url         text,                                -- origin for external sources
  title       text,
  sha256      text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  CHECK (path IS NOT NULL OR url IS NOT NULL)
);

CREATE UNIQUE INDEX sources_origin_key ON sources (project, collection, (COALESCE(path, url)));
CREATE INDEX sources_scope_idx ON sources (project, collection);

CREATE TABLE chunks (
  id           bigserial PRIMARY KEY,
  source_id    uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  position     integer NOT NULL,
  heading_path text NOT NULL DEFAULT '',
  content      text NOT NULL,
  content_hash text NOT NULL,                      -- sha256(heading_path + "\n" + content)
  embedding    vector(1024) NOT NULL,
  UNIQUE (source_id, position)
);

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_source_idx ON chunks (source_id);
