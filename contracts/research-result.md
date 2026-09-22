# research-result

Produced by `research`. Consumed by `architect` and the user.

```yaml
answer: >-            # 2-10 sentences answering the question. Say what is unknown.
  ...
rag_available: true   # false when search_knowledge/rag_status failed or the tools were absent
evidence:             # each claim you rely on, tied to where it came from
  - claim: ...
    source_id: ...    # RAG source id, or the repo path when the evidence is code
    quote: ...        # verbatim excerpt, <= 3 lines
sources:
  - source_id: ...
    location: ...     # path or url
    relevance: high | medium | low
confidence: high | medium | low
open_questions: []    # things the architect or user must decide
```

Rules: never invent a source. If the RAG is unavailable, set `rag_available: false`, use only the
codebase and the web tools you have, and lower `confidence` accordingly.
