# Agent guide

## Required checks

After code changes, run these tasks in this package directory, in order:

```sh
mise run format
mise run lint
mise run typecheck
```

Apply every relevant check:

- Behavior changes: update the affected tests and run `mise run test`.
- Build or package changes: run `mise run build`.
- Documentation-only changes: check formatting, referenced paths, and command accuracy. Run code checks only if executable behavior is affected.
- Read-only review: run `mise run check` for lint, format, type, and test checks.

Completion requires all applicable checks to pass. Fix failures with checks enabled. Broaden or repeat validation only for new edits, failures, or unresolved concerns. If validation is blocked, report the blocker and the checks that remain unverified.

## Final response

Lead with the result. State changed paths, validation results, and any remaining blockers in plain, concise language. Use lists when they make the result easier to scan.
