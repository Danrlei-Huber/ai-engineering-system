# implementation-result

Produced by `backend`. Consumed by `tester` and `reviewer`.

```yaml
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

Rules: implement only what the plan lists. If the plan is wrong, stop, record the deviation and
explain; do not silently widen scope.
