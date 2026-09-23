import type { RagStatus } from './status.js';

export function formatStatus(status: RagStatus): string {
  const lines = ['AI Engineering RAG Doctor', ''];
  for (const c of status.checks) lines.push(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  lines.push('', status.ok ? 'RAG is ready.' : 'RAG is not ready.');
  return lines.join('\n') + '\n';
}
