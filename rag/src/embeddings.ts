import { EMBED_DIMENSIONS } from './contract.js';

export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

export class DimensionMismatchError extends Error {
  constructor(provider: string, got: number, expected: number) {
    super(`Embedding contract violated: ${provider} returned ${got} dimensions, expected ${expected}. See docs/decisions/ADR-006.`);
    this.name = 'DimensionMismatchError';
  }
}

/** Ollama POST /api/embed (batch endpoint; /api/embeddings is superseded). */
export class OllamaEmbeddings implements EmbeddingProvider {
  readonly name: string;
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly batchSize = 16,
  ) {
    this.name = `ollama:${model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const input = texts.slice(i, i + this.batchSize);
      const res = await this.fetchImpl(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, input }),
      });
      if (!res.ok) throw new Error(`Ollama /api/embed failed: ${res.status} ${await res.text()}`);
      let data: { embeddings?: unknown };
      try {
        data = (await res.json()) as { embeddings?: unknown };
      } catch {
        throw new Error('Ollama /api/embed returned a non-JSON body');
      }
      if (!Array.isArray(data.embeddings) || data.embeddings.length !== input.length) {
        throw new Error('Ollama /api/embed returned an unexpected shape (expected embeddings[][] matching input length)');
      }
      out.push(...(data.embeddings as number[][]));
    }
    return out;
  }
}

/** Deterministic bag-of-words hashing, unit-normalised. For tests and CI only. */
export class FakeEmbeddings implements EmbeddingProvider {
  readonly name = 'fake';
  constructor(private readonly dims = EMBED_DIMENSIONS) {}
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => fakeVector(t, this.dims));
  }
}

export function fakeVector(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0);
  for (const token of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    let h = 2166136261;
    for (const ch of token) {
      h ^= ch.codePointAt(0)!;
      h = Math.imul(h, 16777619) >>> 0;
    }
    v[h % dims] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function createEmbeddingProvider(
  cfg: { embedProvider: 'ollama' | 'fake'; ollamaUrl: string; embedModel: string },
  fetchImpl?: typeof fetch,
): EmbeddingProvider {
  return cfg.embedProvider === 'fake' ? new FakeEmbeddings() : new OllamaEmbeddings(cfg.ollamaUrl, cfg.embedModel, fetchImpl);
}

/** Embeds a probe string and throws DimensionMismatchError if the provider breaks the contract. */
export async function assertDimension(provider: EmbeddingProvider, expected = EMBED_DIMENSIONS): Promise<void> {
  const [vector] = await provider.embed(['embedding dimension probe']);
  const got = vector?.length ?? 0;
  if (got !== expected) throw new DimensionMismatchError(provider.name, got, expected);
}
