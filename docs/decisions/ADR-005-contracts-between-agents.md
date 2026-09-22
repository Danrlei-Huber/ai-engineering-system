# ADR-005: Contracts define the hand-offs between agents

Status: Accepted (2026-09-22)

## Context
Passing free text between agents lets the reviewer inherit the implementer's framing and makes outputs impossible to grade mechanically.

## Decision
`contracts/` defines five YAML shapes: research-result, architecture-plan, implementation-result, test-result, review-result. Every agent ends with exactly one such block. Orchestrators pass only contract blocks between agents, and the reviewer receives diff + plan + test-result, never the implementer's narrative.

## Consequences
Evals can grep for `status:`, `confidence:`, `rag_available:`. Run records can be aggregated later. Adding a field is a contract change and must be reflected in the producing agent and every consumer.
