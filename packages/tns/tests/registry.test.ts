import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Active, Deprecated, Tool, ToolName } from "../src/domain.ts"
import { RelativePath } from "../src/file.ts"
import { Registry } from "../src/registry.ts"
import { memFs } from "./support.ts"

const ROOT = "/repo"

const tool = (name: string, path: string, status: Tool["status"] = new Active({})): Tool =>
  new Tool({
    name: ToolName.make(name),
    path: RelativePath.make(path),
    description: `The ${name} tool.`,
    status
  })


describe("Registry", () => {
  const withRegistry = (initial: Record<string, string>) => {
    const fs = memFs(initial)
    return { fs, layer: Registry.layerAt(ROOT).pipe(Layer.provideMerge(fs.layer)) }
  }

  it.effect("registers and resolves a tool", () => {
    const { layer } = withRegistry({})
    return Effect.gen(function* () {
      const registry = yield* Registry
      yield* registry.register(tool("alpha", "packages/alpha"))
      const resolution = yield* registry.resolve("alpha")
      expect(resolution.tool.name).toBe("alpha")
      expect(resolution.tool.path).toBe("packages/alpha")
      expect(resolution.successor).toBeUndefined()
    }).pipe(Effect.provide(layer))
  })

  it.effect("rejects duplicate names", () => {
    const { layer } = withRegistry({})
    return Effect.gen(function* () {
      const registry = yield* Registry
      yield* registry.register(tool("alpha", "packages/alpha"))
      const error = yield* Effect.flip(registry.register(tool("alpha", "packages/other")))
      expect(error._tag).toBe("NameTaken")
    }).pipe(Effect.provide(layer))
  })

  it.effect("suggests near-miss names when not found", () => {
    const { layer } = withRegistry({})
    return Effect.gen(function* () {
      const registry = yield* Registry
      yield* registry.register(tool("alpha", "packages/alpha"))
      const error = yield* Effect.flip(registry.resolve("alpho"))
      expect(error._tag).toBe("ToolNotFound")
      expect(error.suggestions).toContain("alpha")
    }).pipe(Effect.provide(layer))
  })

  it.effect("deprecate moves the directory and resolution follows the successor", () => {
    const { fs, layer } = withRegistry({
      [`${ROOT}/packages/old-tool/README.md`]: "old"
    })
    return Effect.gen(function* () {
      const registry = yield* Registry
      yield* registry.register(tool("old-tool", "packages/old-tool"))
      yield* registry.register(tool("new-tool", "packages/new-tool"))
      const updated = yield* registry.deprecate("old-tool", "new-tool")
      expect(updated.path).toBe("deprecated/old-tool")
      expect(fs.files.has(`${ROOT}/deprecated/old-tool/README.md`)).toBe(true)
      expect(fs.files.has(`${ROOT}/packages/old-tool/README.md`)).toBe(false)
      // Resolution still works by name, from the new location, with successor.
      const resolution = yield* registry.resolve("old-tool")
      expect(resolution.tool.path).toBe("deprecated/old-tool")
      expect(resolution.successor?.name).toBe("new-tool")
    }).pipe(Effect.provide(layer))
  })

  it.effect("deprecate rejects a missing or deprecated successor", () => {
    const { layer } = withRegistry({
      [`${ROOT}/packages/a/x`]: "",
      [`${ROOT}/packages/b/x`]: ""
    })
    return Effect.gen(function* () {
      const registry = yield* Registry
      yield* registry.register(tool("a", "packages/a"))
      yield* registry.register(tool("b", "packages/b"))
      const missing = yield* Effect.flip(registry.deprecate("a", "ghost"))
      expect(missing._tag).toBe("InvalidSuccessor")
      yield* registry.deprecate("b")
      const deprecated = yield* Effect.flip(registry.deprecate("a", "b"))
      expect(deprecated._tag).toBe("InvalidSuccessor")
    }).pipe(Effect.provide(layer))
  })

  it.effect("list filters by status", () => {
    const { layer } = withRegistry({ [`${ROOT}/packages/a/x`]: "" })
    return Effect.gen(function* () {
      const registry = yield* Registry
      yield* registry.register(tool("a", "packages/a"))
      yield* registry.register(tool("b", "packages/b", new Deprecated({})))
      const active = yield* registry.list("active")
      const deprecated = yield* registry.list("deprecated")
      const all = yield* registry.list()
      expect(active.map((t) => t.name)).toEqual(["a"])
      expect(deprecated.map((t) => t.name)).toEqual(["b"])
      expect(all).toHaveLength(2)
    }).pipe(Effect.provide(layer))
  })
})
