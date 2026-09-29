# Jagernator

## What is it?

Jagernator is an engineering harness for AI coding agents like Claude Code and Codex. You install it into a repository. It gives the agent a clear engineering policy, on-demand skills and, on Claude Code, hooks that check every tool call.

It does not replace your agent. It works around it.

## Purpose

Make an AI coding agent behave like a disciplined senior engineer:

- **Think before coding**: state assumptions, prefer the simplest solution.
- **Surgical changes**: touch only what the task needs.
- **Verify**: no "done" or "tests pass" without evidence.
- **Save context**: search before reading, read line ranges, never reread unchanged files.
- **Protect secrets**: block `.env`, keys and credential files; deny the network by default; stop secrets from leaving the machine.

On Claude Code, the hooks enforce the security and context rules. On other agents, the rules are guidance only. Jagernator is not a sandbox. See [docs/guide.md](docs/guide.md) for exactly what is enforced.

## Install

Requires Node.js 20 or newer.

```sh
git clone https://github.com/kaanklcrsln/jagernator.git
cd jagernator
npm link                  # puts the `jagernator` command on your PATH
```

Then, in any project:

```sh
cd /path/to/your/project
jagernator init           # creates .jagernator/ and the agent files
jagernator doctor         # checks the installation
```

Settings live in `.jagernator/config.yaml`. After you change them, run `jagernator update`.

More: [docs/guide.md](docs/guide.md) · [docs/architecture.md](docs/architecture.md) · [evals/README.md](evals/README.md)

## License

MIT
