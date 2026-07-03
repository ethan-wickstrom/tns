Build command-line tools in TypeScript. `tns` stands for "Tools 'n Stuff".

- Bun is the runtime, package manager, bundler, and compiler.
- Effect v4 (`effect@beta`, developed in the Effect-TS/effect-smol repo) with
  `@effect/platform-bun@beta`.
- TypeScript 6 or 7 with strict settings.
- Every finished CLI is compiled to a single-file executable with
  `bun build --compile`.

# Sources of truth

Effect v4 is a beta and its API changes between releases. Do not trust
memorized API names. Each kind of knowledge has exactly one authoritative
source. Consult it before writing code that depends on it.

| Knowledge | Authoritative source |
|---|---|
| Exact Effect API names and signatures | The installed package at `node_modules/effect`, cross-checked against the local clone at `~/.local/share/effect-solutions/effect` |
| Effect patterns and conventions | `effect-solutions show <topic>` (CLI installed globally) |
| Bun flags and compile behavior | `bun build --help` and the official docs at bun.com/docs |
| Whether a compiled binary works | Running the binary, never assumption |

Set these sources up once per machine:

```bash
bun add -g effect-solutions@latest
git clone --depth 1 https://github.com/Effect-TS/effect-smol.git \
  ~/.local/share/effect-solutions/effect
```

Never rewrite v4 imports into v3 forms. The CLI module is
`effect/unstable/cli`, not `@effect/cli`. Services use `Context.Service`,
not `Effect.Service` with a `dependencies` field. Tagged errors use
`Schema.TaggedErrorClass`, not `Schema.TaggedError`.

# Project setup

```bash
bun add effect@beta @effect/platform-bun@beta
bun add -d @effect/language-service typescript @types/bun
bun add -D vitest @effect/vitest@beta
```

Install the Effect Language Service. Add
`{ "name": "@effect/language-service" }` to the tsconfig plugins array and
add the schema URL at the top level of tsconfig for editor validation. Run
`bunx effect-language-service patch` and persist it with a `prepare` script
so type checking reports Effect diagnostics.

Baseline tsconfig.json:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/Effect-TS/language-service/refs/heads/main/schema.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleDetection": "force",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "types": ["bun"],
    "plugins": [{ "name": "@effect/language-service" }]
  }
}
```

TypeScript 6 and 7 no longer discover `@types` packages on their own, so
`"types": ["bun"]` is required.

# Coding conventions

These conventions are stable across beta releases. Exact signatures are not,
so check the sources of truth for those.

Sequencing and tracing:
- Use `Effect.gen(function* () { ... })` and `yield*` for all sequencing.
  Never use `async`/`await` in application logic. Promises appear only at
  boundaries through `Effect.tryPromise` or `Effect.promise`.
- Wrap every effectful function, including nullary ones, in
  `Effect.fn("Service.method")` so traces show the call site.
- Add timeouts, retries, and spans with `.pipe()`. For external calls,
  apply a per-attempt timeout, then a retry schedule, then an overall
  timeout.

Services and layers:
- Define services as `Context.Service` classes with unique tag strings in
  the form `@app/Name`, readonly methods, and no requirements in method
  signatures.
- Implement services as static layer properties (`layer`, `testLayer`,
  named variants) built with `Layer.effect`, `Layer.sync`, or
  `Layer.succeed`. Inside a layer, first `yield*` the dependencies, then
  define methods, then return the service object.
- Call `Effect.provide` exactly once, at the entry point. Layers are
  memoized by reference, so store the result of a parameterized layer
  constructor in one module-level constant and reuse it.
- Sketch service contracts before implementations, and write orchestration
  against the contracts.
- Wrap Promise-based libraries in a service with a `use` method that
  receives the client and an `AbortSignal`, so interruption and error
  wrapping are handled in one place.

Data and errors:
- Model records with `Schema.Class` and variants with `Schema.TaggedClass`
  plus `Schema.Union`, matched exhaustively with the `Match` module.
- Brand nearly all domain primitives with `Schema.brand`.
- Persist JSON through `Schema.fromJsonString` so parsing and validation
  happen in one step.
- Define domain errors with `Schema.TaggedErrorClass`. These are yieldable,
  so `yield*` them directly. Recover with `Effect.catch`,
  `Effect.catchTag`, or `Effect.catchTags`. Wrap unknown external errors in
  a `Schema.Defect` field. Use `Effect.orDie` for unrecoverable startup
  failures, and almost never catch defects.

Config:
- Read configuration with the `Config` module, validate with
  `Config.schema`, and always use `Config.redacted` for secrets. Wrap the
  result in a service with a production layer and a test layer.

# CLI structure

Import `Argument`, `Command`, and `Flag` from `effect/unstable/cli`. Build
commands with `Command.make(name, config, handler)`, describe them with
`Command.withDescription`, and compose them with `Command.withSubcommands`.
Keep handlers thin. They read services and call them, and business logic
lives in the services. Help, version, and completions are generated
automatically.

Entry point shape:

```typescript
import { BunServices, BunRuntime } from "@effect/platform-bun"
import { Command } from "effect/unstable/cli"
import { Effect, Layer } from "effect"
import pkg from "./package.json" with { type: "json" }

app.pipe(
  Command.run({ version: pkg.version }),
  Effect.provide(Layer.mergeAll(AppLayer, BunServices.layer)),
  BunRuntime.runMain
)
```

Only the entry file imports platform-specific modules. All other code
imports abstractions such as `FileSystem` and `Terminal` from `effect`.
Because the CLI parser evolves during the beta, confirm the current
`Command.run` shape and the available `Argument` and `Flag` constructors in
the installed package before use, and test flag ordering rather than
assuming it.

# Testing

Use `vitest` with `@effect/vitest@beta`. The test script is `vitest run`,
never `bun test`. Write Effect tests with `it.effect`, which provides a
test clock that starts at zero. Use `it.live` when a test needs real time
or visible logs. Provide a fresh layer inside each test with
`Effect.provide`, and reserve `it.layer` for expensive shared resources.
Compose test layers with `Layer.provideMerge` so leaf services stay
reachable for setup and assertions. Never import platform modules in tests.
Mock services with `Layer.succeed`.

# Compilation

When the code type-checks and the tests pass, compile the executable.

Default build for the machine you are on:

```bash
bun build --compile --minify --sourcemap --bytecode ./src/cli.ts --outfile mycli
```

Three safety rules govern the `--bytecode` flag. Each comes from a
confirmed Bun bug, so verify rather than trust.

1. Do not combine `--bytecode` with `--format esm`. This pairing has
   produced binaries that fail at startup with missing module errors
   (oven-sh/bun issue 27454). Use bytecode with the default CommonJS
   output.
2. Do not combine `--bytecode` with a cross-compile `--target`. Bytecode
   built on one platform can crash a binary made for another, and the
   version check does not catch it (oven-sh/bun issue 18416). When
   cross-compiling, drop `--bytecode`.
3. Bytecode generation can fail without failing the build (oven-sh/bun
   issue 15528). After every build, check stderr for a bytecode failure
   message and run the binary. `./mycli --help` and one real command must
   succeed before you declare the work done. If in doubt, run with
   `BUN_JSC_verboseDiskCache=1` and look for a cache hit line.

Other compile facts:
- Cross-compile targets take the form `bun-{linux,darwin,windows}-{x64,arm64}`
  with `-baseline`, `-modern`, and `-musl` variants. Use the baseline
  variant for x64 CPUs older than 2013.
- Embed a file with `import p from "./f" with { type: "file" }` and read it
  with `Bun.file(p)`. Embed SQLite with `{ type: "sqlite", embed: "true" }`,
  noting that writes are in memory and lost on exit.
- Inject build-time constants with `--define`. Embed runtime arguments with
  `--compile-exec-argv`, or pass them at run time through the `BUN_OPTIONS`
  environment variable.
- For a deterministic binary, add `--no-compile-autoload-dotenv` and
  `--no-compile-autoload-bunfig`.
- For macOS distribution, sign with `codesign` and an entitlements file
  that allows JIT.

# Workflow

1. Verify any uncertain API against the sources of truth.
2. Scaffold the project: `src/` for schemas, services, commands, and the
   entry file, plus `tests/` and the tsconfig above.
3. Model the domain with branded types, schema classes, and tagged errors.
4. Define service contracts, then production and test layers.
5. Write thin command handlers over the services.
6. Run the tests until green.
7. Run `bunx tsc --noEmit` until it reports zero errors.
8. Compile per the rules above and smoke-test the binary.
