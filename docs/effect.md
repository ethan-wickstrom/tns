# Effect v4 conventions

## Sources of truth

Effect v4 is a beta and its API changes between releases. Do not trust
memorized API names. Each kind of knowledge has exactly one authoritative
source. Consult it before writing code that depends on it.

| Knowledge | Authoritative source |
|---|---|
| Exact Effect API names and signatures | The installed package at `node_modules/effect`, cross-checked against the local clone at `~/.local/share/effect-solutions/effect` |
| Effect patterns and conventions | `effect-solutions show <topic>` (CLI installed globally) |

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

## Imports

Import local modules with an explicit `.ts` extension (the base tsconfig
sets `allowImportingTsExtensions`). Bun resolves these directly.

## Sequencing and tracing

- Use `Effect.gen(function* () { ... })` and `yield*` for all sequencing.
  Never use `async`/`await` in application logic. Promises appear only at
  boundaries through `Effect.tryPromise` or `Effect.promise`.
- Wrap every effectful function, including nullary ones, in
  `Effect.fn("Service.method")` so traces show the call site.
- Add timeouts, retries, and spans with `.pipe()`. For external calls,
  apply a per-attempt timeout, then a retry schedule, then an overall
  timeout.

## Services and layers

- Define services as `Context.Service` classes with unique tag strings in
  the form `@<tool-name>/Name` (e.g. `@tns/Registry`), readonly methods,
  and no requirements in method signatures.
- Implement services as static layer properties (`layer`, `testLayer`,
  named variants) built with `Layer.effect`, `Layer.sync`, or
  `Layer.succeed`. Inside a layer, first `yield*` the dependencies, then
  define methods, then return the service object.
- In application code, call `Effect.provide` exactly once, at the entry
  point. Tests are the exception: each test provides its own layer (see
  [testing.md](testing.md)). Layers are memoized by reference, so store
  the result of a parameterized layer constructor in one module-level
  constant and reuse it.
- Sketch service contracts before implementations, and write orchestration
  against the contracts.
- Wrap Promise-based libraries in a service with a `use` method that
  receives the client and an `AbortSignal`, so interruption and error
  wrapping are handled in one place.

## Data and errors

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

## Config

Read configuration with the `Config` module, validate with
`Config.schema`, and always use `Config.redacted` for secrets. Wrap the
result in a service with a production layer and a test layer.
