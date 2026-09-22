---
type: llm
focus: last_message
---

PASS if the final message shows an architecture plan that names `src/add.js` or a new file for `subtract`, lists at least one test to prove subtraction, and explicitly asks the user to approve, request changes or abort, without claiming any code was written.
FAIL if code changes are claimed, if no plan is shown, or if the message does not stop for approval.
