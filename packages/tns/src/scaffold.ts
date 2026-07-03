import { Effect, FileSystem, Layer, Schema } from "effect"
import * as Context from "effect/Context"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process"
import { blueprint, toolFor } from "./blueprint.ts"
import { InvalidName, NameTaken, Tool, ToolName } from "./domain.ts"
import { File } from "./file.ts"
import { Registry } from "./registry.ts"
import { findWorkspaceRoot } from "./root.ts"

/**
 * The Scaffolder module: two entry points, `plan` and `apply`.
 *
 * `plan` validates and returns the full file set (what `--dry-run` prints).
 * `apply` writes the files, installs dependencies, and registers the tool in
 * the index — registration happens inside `apply`, so "scaffolded but
 * unindexed" is unrepresentable. The blueprint is an internal seam.
 */

export class ScaffoldPlan extends Schema.Class<ScaffoldPlan>("ScaffoldPlan")({
  tool: Tool,
  files: Schema.Array(File)
}) {}

export class Report extends Schema.Class<Report>("Report")({
  tool: Tool,
  filesWritten: Schema.Number
}) {}

const dirnameOf = (path: string): string | undefined => {
  const idx = path.lastIndexOf("/")
  return idx === -1 ? undefined : path.slice(0, idx)
}

export class Scaffolder extends Context.Service<
  Scaffolder,
  {
    readonly plan: (
      name: string,
      description: string
    ) => Effect.Effect<ScaffoldPlan, InvalidName | NameTaken>
    readonly apply: (plan: ScaffoldPlan) => Effect.Effect<Report, NameTaken>
  }
>()("@tns/Scaffolder") {
  static readonly layerAt = (
    root: string
  ): Layer.Layer<Scaffolder, never, FileSystem.FileSystem | Registry | ChildProcessSpawner.ChildProcessSpawner> =>
    Layer.effect(
      Scaffolder,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const registry = yield* Registry
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

        const plan = Effect.fn("Scaffolder.plan")(function* (name: string, description: string) {
          const toolName = yield* Schema.decodeEffect(ToolName)(name).pipe(
            Effect.mapError(
              () =>
                new InvalidName({
                  name,
                  reason: "use lowercase letters, digits and dashes, starting with a letter"
                })
            )
          )
          const taken = yield* registry.resolve(name).pipe(
            Effect.as(true),
            Effect.catchTag("ToolNotFound", () => Effect.succeed(false))
          )
          if (taken) {
            return yield* new NameTaken({ name: toolName })
          }
          const config = { name: toolName, description }
          return new ScaffoldPlan({ tool: toolFor(config), files: blueprint(config) })
        })

        const apply = Effect.fn("Scaffolder.apply")(function* (scaffoldPlan: ScaffoldPlan) {
          for (const f of scaffoldPlan.files) {
            const absolute = `${root}/${f.path}`
            const dir = dirnameOf(absolute)
            if (dir !== undefined) {
              yield* Effect.orDie(fs.makeDirectory(dir, { recursive: true }))
            }
            yield* Effect.orDie(fs.writeFileString(absolute, f.contents))
          }
          yield* Effect.orDie(
            spawner.exitCode(ChildProcess.make("bun", ["install"], { cwd: root }))
          )
          yield* registry.register(scaffoldPlan.tool)
          return new Report({ tool: scaffoldPlan.tool, filesWritten: scaffoldPlan.files.length })
        })

        return { plan, apply }
      })
    )

  /** Production adapter: discovers the workspace root from the cwd. */
  static readonly layer: Layer.Layer<
    Scaffolder,
    never,
    FileSystem.FileSystem | Registry | ChildProcessSpawner.ChildProcessSpawner
  > = Layer.unwrap(Effect.map(Effect.orDie(findWorkspaceRoot), (root) => Scaffolder.layerAt(root)))
}
