import { Console, Effect, Match } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import type { Resolution, Tool } from "./domain.ts"
import { Registry } from "./registry.ts"
import { Scaffolder } from "./scaffold.ts"

/**
 * The thin CLI: deliberately shallow pass-throughs over the Registry and
 * Scaffolder interfaces. All depth lives behind those two modules.
 */

const fail = (message: string) =>
  Effect.gen(function* () {
    yield* Console.error(message)
    process.exitCode = 1
  })

const statusLabel = (tool: Tool): string =>
  Match.value(tool.status).pipe(
    Match.tag("Active", () => "active"),
    Match.tag("Deprecated", (status) =>
      status.supersededBy !== undefined
        ? `deprecated, use ${status.supersededBy}`
        : "deprecated"
    ),
    Match.exhaustive
  )

const notFoundMessage = (name: string, suggestions: ReadonlyArray<string>): string =>
  suggestions.length === 0
    ? `Tool "${name}" is not in the index.`
    : `Tool "${name}" is not in the index. Did you mean: ${suggestions.join(", ")}?`

// --- tns new <name> [--description] [--dry-run] ---

const newName = Argument.string("name").pipe(
  Argument.withDescription("Name of the new tool (lowercase letters, digits, dashes)")
)
const description = Flag.string("description").pipe(
  Flag.withAlias("d"),
  Flag.withDefault("A tns tool."),
  Flag.withDescription("One-line description of the tool")
)
const dryRun = Flag.boolean("dry-run").pipe(
  Flag.withDescription("Print the files that would be written without writing them")
)

export const newCommand = Command.make(
  "new",
  { name: newName, description, dryRun },
  ({ name, description, dryRun }) =>
    Effect.gen(function* () {
      const scaffolder = yield* Scaffolder
      const plan = yield* scaffolder.plan(name, description)
      if (dryRun) {
        yield* Console.log(`Would scaffold "${plan.tool.name}" at ${plan.tool.path}:`)
        for (const file of plan.files) {
          yield* Console.log(`  ${file.path}`)
        }
        return
      }
      const report = yield* scaffolder.apply(plan)
      yield* Console.log(
        `Scaffolded "${report.tool.name}" at ${report.tool.path} (${report.filesWritten} files).`
      )
    }).pipe(
      Effect.catchTags({
        InvalidName: (error) => fail(`Invalid name "${error.name}": ${error.reason}.`),
        NameTaken: (error) => fail(`Tool "${error.name}" already exists in the index.`)
      })
    )
).pipe(Command.withDescription("Scaffold a new CLI tool in packages/"))

// --- tns list [--filter] ---

const filter = Flag.choice("filter", ["all", "active", "deprecated"]).pipe(
  Flag.withDefault("all" as const),
  Flag.withDescription("Which tools to list")
)

export const listCommand = Command.make("list", { filter }, ({ filter }) =>
  Effect.gen(function* () {
    const registry = yield* Registry
    const tools = yield* registry.list(filter)
    if (tools.length === 0) {
      yield* Console.log("No tools in the index.")
      return
    }
    for (const tool of tools) {
      yield* Console.log(`${tool.name}  ${tool.path}  [${statusLabel(tool)}]  ${tool.description}`)
    }
  })
).pipe(Command.withDescription("List the tools in the index"))

// --- tns which <name> ---

const whichName = Argument.string("name").pipe(
  Argument.withDescription("Name of the tool to resolve")
)

const printResolution = (resolution: Resolution) =>
  Effect.gen(function* () {
    yield* Console.log(resolution.tool.path)
    if (resolution.tool.status._tag === "Deprecated") {
      const successor = resolution.successor
      yield* Console.error(
        successor !== undefined
          ? `note: "${resolution.tool.name}" is deprecated; use "${successor.name}" (${successor.path})`
          : `note: "${resolution.tool.name}" is deprecated`
      )
    }
  })

export const whichCommand = Command.make("which", { name: whichName }, ({ name }) =>
  Effect.gen(function* () {
    const registry = yield* Registry
    const resolution = yield* registry.resolve(name)
    yield* printResolution(resolution)
  }).pipe(
    Effect.catchTag("ToolNotFound", (error) =>
      fail(notFoundMessage(error.name, error.suggestions))
    )
  )
).pipe(Command.withDescription("Resolve a tool name to its location, following deprecation"))

// --- tns deprecate <name> [--superseded-by] ---

const deprecateName = Argument.string("name").pipe(
  Argument.withDescription("Name of the tool to deprecate")
)
const supersededBy = Flag.string("superseded-by").pipe(
  Flag.optional,
  Flag.withDescription("Name of the active tool that replaces it")
)

export const deprecateCommand = Command.make(
  "deprecate",
  { name: deprecateName, supersededBy },
  ({ name, supersededBy }) =>
    Effect.gen(function* () {
      const registry = yield* Registry
      const updated = yield* registry.deprecate(
        name,
        supersededBy._tag === "Some" ? supersededBy.value : undefined
      )
      yield* Console.log(`Deprecated "${updated.name}"; it now lives at ${updated.path}.`)
    }).pipe(
      Effect.catchTags({
        ToolNotFound: (error) => fail(notFoundMessage(error.name, error.suggestions)),
        InvalidSuccessor: (error) => fail(`Cannot deprecate "${error.name}": ${error.reason}.`)
      })
    )
).pipe(Command.withDescription("Deprecate a tool, moving it to deprecated/"))
