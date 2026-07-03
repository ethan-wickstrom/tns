# Creating a new tool

## Repository layout

This is a Bun workspaces monorepo. One tool lives in one workspace package.

```
tools.json          # the tool index: the single authoritative list of tools
tsconfig.base.json  # the single representation of the strict compiler options
packages/*          # active tools (one Bun workspace package each)
deprecated/*        # deprecated tools, moved here by `tns deprecate`
```

`tools.json`, not the directory layout, defines which tools exist. Never
edit `tools.json` by hand. The `tns` CLI (in `packages/tns`) is its only
sanctioned writer, through the Registry module. `tns new <name>` scaffolds
a conforming package and registers it in one atomic step. `tns deprecate
<name>` moves a tool to `deprecated/` while the index keeps resolving its
name. `tns list` and `tns which <name>` read the index.

Shared dev dependencies (`typescript`, `vitest`, `@effect/vitest`,
`@effect/language-service`, `@types/bun`) live in the root `package.json`.
Each package declares only its runtime dependencies and extends
`../../tsconfig.base.json`.

## Scaffolding in this monorepo

Run `tns new <name>` (build the CLI first with
`cd packages/tns && bun run build` if needed). The scaffolder writes the
package, installs dependencies, and registers the tool in `tools.json`. Do
not create packages by hand.

## Standalone project outside this monorepo

```bash
bun add effect@beta @effect/platform-bun@beta
bun add -d @effect/language-service typescript @types/bun vitest @effect/vitest@beta
```

Install the Effect Language Service. Add
`{ "name": "@effect/language-service" }` to the tsconfig plugins array and
add the schema URL at the top level of tsconfig for editor validation. Run
`bunx effect-language-service patch` and persist it with a `prepare` script
so type checking reports Effect diagnostics. In this monorepo, the root
`package.json` already has that `prepare` script.

Copy `tsconfig.base.json` from this repo as the baseline compiler options.
Package tsconfigs extend it and add only `include`.

TypeScript 6 and 7 no longer discover `@types` packages on their own, so
`"types": ["bun"]` is required.

## Workflow

1. Verify any uncertain API against the sources of truth
   (see [effect.md](effect.md)).
2. Scaffold the tool with `tns new <name>`. It creates `src/` for schemas,
   services, commands, and the entry file, plus `tests/` and a tsconfig
   that extends `tsconfig.base.json`, and registers the tool in
   `tools.json`.
3. Model the domain with branded types, schema classes, and tagged errors.
4. Define service contracts, then production and test layers.
5. Write thin command handlers over the services.
6. Run the tests until green (`bun run test`).
7. Run `bun run check` until it reports zero errors.
8. Compile and smoke-test the binary per [compilation.md](compilation.md).
