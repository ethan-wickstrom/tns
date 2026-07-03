# tns

Tools 'n Stuff — a Bun workspaces monorepo of single-file CLI tools built with
Effect v4, plus the `tns` CLI that scaffolds and indexes them.

## Layout

```
tools.json          # the tool index: the single authoritative list of tools
tsconfig.base.json  # the single representation of the strict compiler options
packages/*          # active tools (one Bun workspace package each)
deprecated/*        # deprecated tools, moved here by `tns deprecate`
```

`tools.json` — not the directory layout — is what defines which tools exist.
A deprecated tool moves to `deprecated/` but keeps its name; the index keeps
resolving it and points to its successor. Never edit `tools.json` by hand:
the `tns` CLI is the only sanctioned writer.

## The `tns` CLI

```bash
cd packages/tns && bun run build   # compile ./tns

tns new <name> [-d <description>] [--dry-run]   # scaffold a tool in packages/
tns list [--filter all|active|deprecated]        # list indexed tools
tns which <name>                                 # resolve a name to its location
tns deprecate <name> [--superseded-by <name>]    # move a tool to deprecated/
```

`tns new` writes a complete, conforming package (Effect v4, strict
TypeScript, vitest + @effect/vitest, single-file `bun build --compile`
output), runs `bun install`, and registers the tool in the index in one
step — a scaffolded-but-unindexed tool is unrepresentable.

## Develop

One-time machine setup (sources of truth for Effect v4 beta APIs):

```bash
bun add -g effect-solutions@latest
git clone --depth 1 https://github.com/Effect-TS/effect-smol.git \
  ~/.local/share/effect-solutions/effect
```

Then, from the workspace root:

```bash
bun install
```

Per package: `bun run check` (typecheck), `bun run test` (vitest),
`bun run build` (compile the executable).

See `AGENTS.md` for the full conventions.
