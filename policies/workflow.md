# Workflow Policy

Every non-trivial task follows the harness lifecycle. Trivial tasks (a typo, a rename, a one-line answer) may collapse phases, but never skip verification where it applies.

```
TASK → UNDERSTAND → EXPLORE → PLAN → IMPLEMENT → VERIFY → REVIEW → COMPLETE
                                         ↑          │
                                         │        FAIL
                                      REPLAN ← DIAGNOSE
```

## Phases

1. **Understand.** Restate the goal as verifiable success criteria. Note assumptions that change the implementation.
2. **Explore.** Gather only the context the next decision needs (see `context.md`).
3. **Plan.** For multi-step work, a short plan:
   ```
   1. [step] → verify: [check]
   2. [step] → verify: [check]
   ```
4. **Implement.** Smallest change that meets the criteria (see `engineering.md`).
5. **Verify.** Run the checks that prove the criteria: tests, lint, typecheck, build, or a runtime check. Inspect project tooling first; run only relevant checks.
6. **Review.** Read the final diff. Every line must trace to the request, a necessary consequence, or a verification/safety need. Remove debug output and orphans you created.
7. **Complete.** Report what changed and the evidence. State plainly what was not verified.

## Failure loop

A failed check is evidence, not an obstacle.

- **Diagnose** before changing code again: what does the failure say, and which hypothesis does it refute?
- **Replan** from the new hypothesis.
- **No blind retries.** Re-running the same command on the same code produces the same result. If the same check fails twice with the same workspace, the hypothesis is wrong; stop and reconsider rather than repeating the action.

## Verification rules

Never claim "fixed", "working", "done" or "tests pass" without evidence from this session. If a check could not be run, say so and say why.

Optimize exploration, not proof. Some behavior can only be verified at the level where it happens:

- **CSS.** Inspect the relevant source and the computed cascade where possible. Specificity, not source order alone, decides which rule wins.
- **Database permissions.** Inspect actual grants/privileges. Type checking is not permission validation.
- **Deployment.** Where bundle integrity matters, compare the served artifact's identity/hash with the expected local output.

## Recording (optional)

`jagernator task` records the lifecycle in `.jagernator/state/task.json` (metadata only):

```
jagernator task start "<goal>"
jagernator task note plan|assumption|decision|failure "<text>"
jagernator task phase <phase>
jagernator verify -- <command>        # runs the check, records pass/fail and a workspace fingerprint
jagernator task complete              # refuses while required plan/verification/review are missing
```

`jagernator verify` warns when the same check fails again on an unchanged workspace.
