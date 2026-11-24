# implementation-result

Produced by `backend`. Consumed by `tester` and `reviewer`.

```yaml
status: done | blocked   # blocked: the plan could not be implemented as written; see deviations_from_plan
files_changed:
  - path: ...
    action: create | modify | delete
commands_run:
  - ...
deviations_from_plan:  # every difference from architecture-plan.files, with the reason
  - what: ...
    why: ...
notes: >-
  ...
```

Rules: implement only what the plan lists. If the plan is wrong, stop at the smallest coherent
point, set `status: blocked`, record the deviation and explain; do not silently widen scope. The
orchestrator does not run the tester or the reviewer on a blocked result; it hands the plan and
the deviations back to the user.
