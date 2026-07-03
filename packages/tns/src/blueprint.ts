import { Active, Tool, ToolName } from "./domain.ts"
import { File, RelativePath, file } from "./file.ts"

/**
 * The blueprint: the one place that knows what a conforming tns package
 * consists of. A pure function from config to files — an internal seam of the
 * Scaffolder, exercised directly only by its own tests.
 *
 * Everything here is a TypeScript value, so `bun build --compile` embeds the
 * templates in the single-file binary by construction.
 */

export interface ScaffoldConfig {
  readonly name: ToolName
  readonly description: string
}

/** Single representation of the dependency specs mandated by docs/new-tool.md. */
export const RUNTIME_DEPS = {
  "@effect/platform-bun": "beta",
  effect: "beta"
} as const

/**
 * Single representation of the compile flags.
 *
 * `--bytecode` is deliberately absent: bytecode generation fails for
 * Effect-based bundles on current Bun ("Failed to generate bytecode",
 * oven-sh/bun issue 15528 family) and per docs/compilation.md a build only counts
 * when the produced binary is verified to run. Re-add it only after a
 * verified successful build + smoke test. Cross-compiles must never use
 * bytecode (oven-sh/bun issues 27454, 18416).
 */
export const COMPILE_FLAGS = "--compile --minify --sourcemap"
export const CROSS_COMPILE_FLAGS = "--compile --minify --sourcemap"

export const packageDir = (name: ToolName): RelativePath =>
  RelativePath.make(`packages/${name}`)

export const toolFor = (config: ScaffoldConfig): Tool =>
  new Tool({
    name: config.name,
    path: packageDir(config.name),
    description: config.description,
    status: new Active({})
  })

const packageJson = (config: ScaffoldConfig): File =>
  file(
    `${packageDir(config.name)}/package.json`,
    `${JSON.stringify(
      {
        name: config.name,
        version: "0.1.0",
        description: config.description,
        type: "module",
        scripts: {
          check: "bunx tsc --noEmit",
          test: "vitest run",
          build: `bun build ${COMPILE_FLAGS} ./src/cli.ts --outfile ${config.name}`,
          "build:cross": `bun build ${CROSS_COMPILE_FLAGS} ./src/cli.ts --outfile ${config.name}`
        },
        dependencies: RUNTIME_DEPS
      },
      null,
      2
    )}\n`
  )

const tsconfig = (config: ScaffoldConfig): File =>
  file(
    `${packageDir(config.name)}/tsconfig.json`,
    `${JSON.stringify({ extends: "../../tsconfig.base.json", include: ["src", "tests"] }, null, 2)}\n`
  )

const vitestConfig = (config: ScaffoldConfig): File =>
  file(
    `${packageDir(config.name)}/vitest.config.ts`,
    `import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"]
  }
})
`
  )

const greeterService = (config: ScaffoldConfig): File =>
  file(
    `${packageDir(config.name)}/src/greeter.ts`,
    `import { Effect, Layer, Schema } from "effect"
import * as Context from "effect/Context"

export const Name = Schema.NonEmptyString.pipe(Schema.brand("Name"))
export type Name = typeof Name.Type

export class EmptyName extends Schema.TaggedErrorClass<EmptyName>()("EmptyName", {}) {}

export class Greeter extends Context.Service<
  Greeter,
  {
    readonly greet: (name: string) => Effect.Effect<string, EmptyName>
  }
>()("@${config.name}/Greeter") {
  static readonly layer = Layer.sync(Greeter, () => {
    const greet = Effect.fn("Greeter.greet")(function* (name: string) {
      if (name.trim().length === 0) {
        return yield* new EmptyName()
      }
      return \`Hello, \${name}!\`
    })
    return { greet }
  })
}
`
  )

const cliEntry = (config: ScaffoldConfig): File =>
  file(
    `${packageDir(config.name)}/src/cli.ts`,
    `import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Console, Effect, Layer } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import pkg from "../package.json" with { type: "json" }
import { Greeter } from "./greeter.ts"

const name = Argument.string("name").pipe(Argument.withDefault("World"))

const hello = Command.make("hello", { name }, ({ name }) =>
  Effect.gen(function* () {
    const greeter = yield* Greeter
    const message = yield* greeter.greet(name)
    yield* Console.log(message)
  }).pipe(
    Effect.catchTag("EmptyName", () => Console.error("Please provide a non-empty name."))
  )
).pipe(Command.withDescription("Print a greeting"))

const app = Command.make("${config.name}").pipe(
  Command.withDescription(${JSON.stringify("$DESC")}),
  Command.withSubcommands([hello])
)

app.pipe(
  Command.run({ version: pkg.version }),
  Effect.provide(Layer.mergeAll(Greeter.layer, BunServices.layer)),
  BunRuntime.runMain
)
`.replace('"$DESC"', JSON.stringify(config.description))
  )

const greeterTest = (config: ScaffoldConfig): File =>
  file(
    `${packageDir(config.name)}/tests/greeter.test.ts`,
    `import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Greeter } from "../src/greeter.ts"

describe("Greeter", () => {
  it.effect("greets by name", () =>
    Effect.gen(function* () {
      const greeter = yield* Greeter
      const message = yield* greeter.greet("Ada")
      expect(message).toBe("Hello, Ada!")
    }).pipe(Effect.provide(Greeter.layer))
  )

  it.effect("rejects empty names", () =>
    Effect.gen(function* () {
      const greeter = yield* Greeter
      const result = yield* Effect.flip(greeter.greet("  "))
      expect(result._tag).toBe("EmptyName")
    }).pipe(Effect.provide(Greeter.layer))
  )
})
`
  )

const gitignore = (config: ScaffoldConfig): File =>
  file(
    `${packageDir(config.name)}/.gitignore`,
    `# Compiled single-file executable
/${config.name}
/${config.name}.exe
`
  )

const readme = (config: ScaffoldConfig): File =>
  file(
    `${packageDir(config.name)}/README.md`,
    `# ${config.name}

${config.description}

## Develop

\`\`\`bash
bun install        # from the workspace root
bun run check      # typecheck
bun run test       # tests
bun run build      # compile single-file executable ./${config.name}
\`\`\`
`
  )

/** Config → files, by composition of the file functions above. */
export const blueprint = (config: ScaffoldConfig): ReadonlyArray<File> => [
  packageJson(config),
  tsconfig(config),
  vitestConfig(config),
  greeterService(config),
  cliEntry(config),
  greeterTest(config),
  gitignore(config),
  readme(config)
]
