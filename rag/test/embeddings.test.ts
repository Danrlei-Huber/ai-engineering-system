import { describe, expect, it, vi } from 'vitest';
import { EMBED_DIMENSIONS } from '../src/contract.js';
import { DimensionMismatchError, FakeEmbeddings, OllamaEmbeddings, assertDimension, createEmbeddingProvider, fakeVector } from '../src/embeddings.js';

describe('FakeEmbeddings', () => {
  it('is deterministic, 1024-dimensional and unit-normalised', async () => {
    const p = new FakeEmbeddings();
    const [a, b, c] = await p.embed(['alpha beta', 'alpha beta', 'gamma']);
    expect(a).toHaveLength(EMBED_DIMENSIONS);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    const norm = Math.hypot(...a);
    expect(norm).toBeCloseTo(1, 6);
  });
  it('gives similar texts a higher cosine than unrelated texts', () => {
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    const q = fakeVector('postgres migration reversible', 1024);
    const near = fakeVector('every postgres migration must be reversible', 1024);
    const far = fakeVector('react component styling', 1024);
    expect(dot(q, near)).toBeGreaterThan(dot(q, far));
  });
});

describe('OllamaEmbeddings', () => {
  function mockFetch(dims: number) {
    return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string; input: string[] };
      return new Response(JSON.stringify({ model: body.model, embeddings: body.input.map(() => new Array(dims).fill(0.1)) }), { status: 200 });
    }) as unknown as typeof fetch;
  }

  it('posts to /api/embed in batches of 16 with the model name', async () => {
    const fetchImpl = mockFetch(1024);
    const p = new OllamaEmbeddings('http://ollama:11434', 'bge-m3', fetchImpl);
    const vectors = await p.embed(Array.from({ length: 20 }, (_, i) => `t${i}`));
    expect(vectors).toHaveLength(20);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('http://ollama:11434/api/embed');
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'bge-m3' });
    expect(JSON.parse(String(init.body)).input).toHaveLength(16);
  });

  it('throws a readable error on non-2xx', async () => {
    const fetchImpl = (async () => new Response('model not found', { status: 404 })) as unknown as typeof fetch;
    const p = new OllamaEmbeddings('http://ollama:11434', 'bge-m3', fetchImpl);
    await expect(p.embed(['x'])).rejects.toThrow(/Ollama \/api\/embed failed: 404/);
  });

  it('throws when the response shape is wrong', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ nope: true }), { status: 200 })) as unknown as typeof fetch;
    await expect(new OllamaEmbeddings('http://o', 'm', fetchImpl).embed(['x'])).rejects.toThrow(/unexpected shape/);
  });
});

describe('assertDimension', () => {
  it('passes for 1024 and fails for anything else', async () => {
    await expect(assertDimension(new FakeEmbeddings())).resolves.toBeUndefined();
    await expect(assertDimension(new FakeEmbeddings(768))).rejects.toBeInstanceOf(DimensionMismatchError);
    await expect(assertDimension(new FakeEmbeddings(768))).rejects.toThrow(/returned 768 dimensions, expected 1024/);
  });
});

describe('createEmbeddingProvider', () => {
  it('selects the provider from config', () => {
    expect(createEmbeddingProvider({ embedProvider: 'fake', ollamaUrl: 'http://x', embedModel: 'm' }).name).toBe('fake');
    expect(createEmbeddingProvider({ embedProvider: 'ollama', ollamaUrl: 'http://x', embedModel: 'bge-m3' }).name).toBe('ollama:bge-m3');
  });
});
