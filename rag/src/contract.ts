// The v0.1 embedding contract. Changing any value here is an ADR-level change (see ADR-006).
export const EMBED_MODEL_DEFAULT = 'bge-m3';
export const EMBED_DIMENSIONS = 1024;
export const EMBED_DISTANCE = 'cosine' as const;

export const COLLECTIONS = ['docs', 'decisions', 'standards', 'external'] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** Scope used for the plugin's own knowledge (rules, ADRs). Always searched alongside a project. */
export const GLOBAL_PROJECT = '_global';

export function isCollection(value: string): value is Collection {
  return (COLLECTIONS as readonly string[]).includes(value);
}
