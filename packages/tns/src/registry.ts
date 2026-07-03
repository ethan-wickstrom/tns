import { Effect, FileSystem, Layer, Schema } from "effect"
import * as Context from "effect/Context"
import {
  Deprecated,
  InvalidSuccessor,
  Resolution,
  Tool,
  ToolIndex,
  ToolNotFound,
  NameTaken
} from "./domain.ts"
import type { ToolName } from "./domain.ts"
import { RelativePath } from "./file.ts"
import { findWorkspaceRoot } from "./root.ts"

/**
 * The Registry module: the single choice point for "which tools exist".
 *
 * The only sanctioned access to `tools.json`. Hides JSON parsing/validation,
 * deprecation-chain following, invariant enforcement, file rewriting, and
 * name suggestion behind four entry points. The persistence seam is internal:
 * production uses the real FileSystem, tests substitute an in-memory one.
 */

export const INDEX_FILE = "tools.json"

const basename = (path: string): string => path.split("/").filter(Boolean).at(-1) ?? path

const editDistance = (a: string, b: string): number => {
  const rows = a.length + 1
  const cols = b.length + 1
  const d = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0)
    row[0] = i
    return row
  })
  for (let j = 0; j < cols; j++) d[0]![j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return d[rows - 1]![cols - 1]!
}

const suggestionsFor = (name: string, index: ToolIndex): ReadonlyArray<ToolName> =>
  index.tools
    .map((tool) => ({ tool, distance: editDistance(name, tool.name) }))
    .filter(({ distance }) => distance <= 2)
    .sort((a, b) => a.distance - b.distance)
    .map(({ tool }) => tool.name)

export type ListFilter = "all" | "active" | "deprecated"

export class Registry extends Context.Service<
  Registry,
  {
    readonly resolve: (name: string) => Effect.Effect<Resolution, ToolNotFound>
    readonly list: (filter?: ListFilter) => Effect.Effect<ReadonlyArray<Tool>>
    readonly register: (tool: Tool) => Effect.Effect<void, NameTaken>
    readonly deprecate: (
      name: string,
      supersededBy?: string
    ) => Effect.Effect<Tool, ToolNotFound | InvalidSuccessor>
  }
>()("@tns/Registry") {
  /** Registry rooted at an explicit workspace directory. */
  static readonly layerAt = (root: string): Layer.Layer<Registry, never, FileSystem.FileSystem> =>
    Layer.effect(
      Registry,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const indexPath = `${root}/${INDEX_FILE}`

        const load = Effect.gen(function* () {
          const exists = yield* fs.exists(indexPath)
          if (!exists) return ToolIndex.empty
          const content = yield* fs.readFileString(indexPath)
          return yield* Schema.decodeEffect(ToolIndex.Json)(content)
        }).pipe(Effect.orDie)

        const save = (index: ToolIndex) =>
          Effect.gen(function* () {
            const json = yield* Schema.encodeEffect(ToolIndex.Json)(index)
            yield* fs.writeFileString(indexPath, `${json}\n`)
          }).pipe(Effect.orDie)

        const resolve = Effect.fn("Registry.resolve")(function* (name: string) {
          const index = yield* load
          const tool = index.find(name)
          if (tool === undefined) {
            return yield* new ToolNotFound({ name, suggestions: suggestionsFor(name, index) })
          }
          // Follow the deprecation chain to the final active successor.
          let successor: Tool | undefined
          let current = tool
          const visited = new Set<string>([tool.name])
          while (current.status._tag === "Deprecated" && current.status.supersededBy !== undefined) {
            const next = index.find(current.status.supersededBy)
            if (next === undefined || visited.has(next.name)) break
            visited.add(next.name)
            successor = next
            current = next
          }
          return successor !== undefined
            ? new Resolution({ tool, successor })
            : new Resolution({ tool })
        })

        const list = Effect.fn("Registry.list")(function* (filter: ListFilter = "all") {
          const index = yield* load
          if (filter === "all") return index.tools
          const tag = filter === "active" ? "Active" : "Deprecated"
          return index.tools.filter((tool) => tool.status._tag === tag)
        })

        const register = Effect.fn("Registry.register")(function* (tool: Tool) {
          const index = yield* load
          if (index.find(tool.name) !== undefined) {
            return yield* new NameTaken({ name: tool.name })
          }
          yield* save(new ToolIndex({ tools: [...index.tools, tool] }))
        })

        const deprecate = Effect.fn("Registry.deprecate")(function* (
          name: string,
          supersededBy?: string
        ) {
          const index = yield* load
          const tool = index.find(name)
          if (tool === undefined) {
            return yield* new ToolNotFound({ name, suggestions: suggestionsFor(name, index) })
          }
          let successorName: ToolName | undefined
          if (supersededBy !== undefined) {
            const successor = index.find(supersededBy)
            if (successor === undefined) {
              return yield* new InvalidSuccessor({
                name: tool.name,
                reason: `successor "${supersededBy}" is not in the index`
              })
            }
            if (successor.name === tool.name) {
              return yield* new InvalidSuccessor({
                name: tool.name,
                reason: "a tool cannot supersede itself"
              })
            }
            if (successor.status._tag !== "Active") {
              return yield* new InvalidSuccessor({
                name: tool.name,
                reason: `successor "${successor.name}" is deprecated`
              })
            }
            successorName = successor.name
          }
          // Move the directory out of packages/ exactly once; identity is
          // preserved by the index, not the location.
          let newPath = tool.path
          if (tool.status._tag === "Active") {
            newPath = RelativePath.make(`deprecated/${basename(tool.path)}`)
            yield* Effect.orDie(fs.makeDirectory(`${root}/deprecated`, { recursive: true }))
            yield* Effect.orDie(fs.rename(`${root}/${tool.path}`, `${root}/${newPath}`))
          }
          const updated = new Tool({
            ...tool,
            path: newPath,
            status:
              successorName !== undefined
                ? new Deprecated({ supersededBy: successorName })
                : new Deprecated({})
          })
          const tools = index.tools.map((t) => (t.name === tool.name ? updated : t))
          yield* save(new ToolIndex({ tools }))
          return updated
        })

        return { resolve, list, register, deprecate }
      })
    )

  /** Production adapter: discovers the workspace root from the cwd. */
  static readonly layer: Layer.Layer<Registry, never, FileSystem.FileSystem> = Layer.unwrap(
    Effect.map(Effect.orDie(findWorkspaceRoot), (root) => Registry.layerAt(root))
  )
}
