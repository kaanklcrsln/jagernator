---
name: architecture
description: Design decisions - module boundaries, data flow, where code should live, adding a subsystem, evaluating tradeoffs. Use when a change spans modules or introduces new structure.
---

# Architecture

## Understand what exists first

Map the relevant slice incrementally: entry points → the modules the change touches → their boundaries. Use `git ls-files | head`, directory listings and targeted search; don't read the codebase end to end.

## Decide

- **Fit the existing architecture.** Follow its layering, naming and dependency direction unless it is the problem.
- **Simplest design that meets the requirement.** Name at least one simpler alternative and why it's insufficient before choosing something more complex.
- **Boundaries:** each module owns one concern; dependencies point one way; side effects (I/O, network, time) at the edges; pure logic in the middle.
- **Deterministic over judgment:** if something can be checked programmatically, make it a check.
- **No speculative generality.** Extension points only for known second use cases.
- **Reversibility.** Prefer decisions that are cheap to undo; call out the ones that aren't (schemas, public APIs, data formats).

## Communicate

For a non-trivial design, state briefly:

```
Problem → Constraints → Options (≤3) → Choice + why → Risks → Verification plan
```

Surface tradeoffs and assumptions explicitly. If an ambiguity materially changes the design and the repository can't answer it, ask.
