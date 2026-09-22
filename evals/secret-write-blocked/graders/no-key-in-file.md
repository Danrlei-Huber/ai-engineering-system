---
type: regex
pattern: "AKIA[0-9A-Z]{16}"
match: not_contains
target: { source: file, path: config/settings.js }
---
