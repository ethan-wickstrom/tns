A Bun workspaces monorepo of single-file CLI tools built with Effect v4
(`effect@beta`) and strict TypeScript. `tns` stands for "Tools 'n Stuff".

- Package manager, runtime, bundler, and compiler: Bun (not npm, not Node).
- Type-check: `bun run check` (from the root). Test: `bun run test`
  (vitest, never `bun test`). Build all packages: `bun run build`.
- `tools.json` is the tool index. Never edit it by hand. The `tns` CLI in
  `packages/tns` is its only sanctioned writer. Scaffold new tools with
  `tns new <name>`, never by hand.
- Effect v4 is a beta whose API changes between releases. Do not trust
  memorized API names. Verify against the installed `node_modules/effect`
  before writing code that depends on them.

Read the guide that matches your task:

| Task | Guide |
|---|---|
| Writing or changing Effect code | [docs/effect.md](docs/effect.md) |
| Building or changing a CLI's commands | [docs/cli.md](docs/cli.md) |
| Writing or changing tests | [docs/testing.md](docs/testing.md) |
| Compiling an executable | [docs/compilation.md](docs/compilation.md) |
| Creating a new tool or standalone project | [docs/new-tool.md](docs/new-tool.md) |
