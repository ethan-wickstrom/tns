# Compilation

When the code type-checks and the tests pass, compile the executable.

Default build for the machine you are on:

```bash
bun build --compile --minify --sourcemap ./src/cli.ts --outfile mycli
```

For Bun flags and compile behavior, the authoritative sources are
`bun build --help` and the official docs at bun.com/docs. Whether a
compiled binary works is proven only by running it, never by assumption.
After every build, run `./mycli --help` and one real command before
declaring the work done.

## The `--bytecode` flag

Do not add `--bytecode`. Bytecode generation fails for Effect v4 bundles on
current Bun (verified on Bun 1.3.14: the build prints "Failed to generate
bytecode", still exits 0, and the produced binary crashes at startup with a
CommonJS wrapper TypeError). `COMPILE_FLAGS` in
`packages/tns/src/blueprint.ts` is the single representation of these
flags, and the scaffolder writes them into every new package. Re-add
`--bytecode` only after a verified successful build plus a smoke test of
the binary.

If `--bytecode` ever becomes viable again, three safety rules govern it.
Each comes from a confirmed Bun bug, so verify rather than trust.

1. Do not combine `--bytecode` with `--format esm`. This pairing has
   produced binaries that fail at startup with missing module errors
   (oven-sh/bun issue 27454, closed in March 2026, but verify on your Bun
   version). Use bytecode with the default CommonJS output.
2. Do not combine `--bytecode` with a cross-compile `--target`. Bytecode
   built on one platform can crash a binary made for another, and the
   version check does not catch it (oven-sh/bun issue 18416). When
   cross-compiling, drop `--bytecode`.
3. Bytecode generation can fail without failing the build (oven-sh/bun
   issue 15528, still open). A zero exit code from `bun build` proves
   nothing. After every build, check stderr for a bytecode failure
   message and run the binary. If in doubt, run with
   `BUN_JSC_verboseDiskCache=1` and look for a cache hit line.

## Other compile facts

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
