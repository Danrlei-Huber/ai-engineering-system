---
name: research
description: Answer an engineering question with evidence from the knowledge base, the codebase and the web, returned as a research-result contract with cited sources.
disable-model-invocation: true
argument-hint: [question]
---

# /research

Question: $ARGUMENTS

1. Dispatch the `ai-engineering-system:research` subagent with the Agent tool. Prompt it with the question verbatim, the current working directory, and this instruction: "Follow your procedure and end with the research-result contract."
2. Take the ```yaml block from its reply. If the block is missing or malformed, dispatch once more asking only for the contract.
3. Present to the user: the `answer`, then a "Sources" list built from `sources` (location and relevance), then `confidence`, then `open_questions` if any. If `rag_available` is false, say so in one line first.
4. Print the raw contract block at the end so it can be pasted into other workflows.
