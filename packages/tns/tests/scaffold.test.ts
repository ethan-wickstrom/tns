import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { blueprint } from "../src/blueprint.ts"
import { ToolName } from "../src/domain.ts"
import { Registry } from "../src/registry.ts"
import { Scaffolder } from "../src/scaffold.ts"
import { memFs, stubSpawner } from "./support.ts"

const ROOT = "/repo"

const testLayers = (initial: Record<string, string> = {}) => {
  const fs = memFs(initial)
  const spawned: Array<string> = []
  const layer = Scaffolder.layerAt(ROOT).pipe(
    Layer.provideMerge(Registry.layerAt(ROOT)),
    Layer.provideMerge(fs.layer),
    Layer.provideMerge(stubSpawner(spawned))
  )
  return { fs, spawned, layer }
}

describe("blueprint", () => {
  const config = { name: ToolName.make("demo"), description: "A demo tool." }

  it("is deterministic and rooted in the package directory", () => {
    const first = blueprint(config)
    const second = blueprint(config)
    expect(first).toEqual(second)
    for (const file of first) {
      expect(file.path.startsWith("packages/demo/")).toBe(true)
    }
  })

  it("emits a package.json that extends the workspace conventions", () => {
    const files = blueprint(config)
    const pkg = JSON.parse(files.find((f) => f.path.endsWith("package.json"))!.contents)
    expect(pkg.name).toBe("demo")
    expect(pkg.dependencies).toEqual({ "@effect/platform-bun": "beta", effect: "beta" })
    expect(pkg.scripts.test).toBe("vitest run")
    expect(pkg.scripts.build).toContain("--compile")
    expect(pkg.scripts.build).not.toContain("--bytecode")
    expect(pkg.scripts["build:cross"]).not.toContain("--bytecode")
    const tsconfig = JSON.parse(files.find((f) => f.path.endsWith("tsconfig.json"))!.contents)
    expect(tsconfig.extends).toBe("../../tsconfig.base.json")
  })
})

describe("Scaffolder", () => {
  it.effect("plan rejects invalid names", () => {
    const { layer } = testLayers()
    return Effect.gen(function* () {
      const scaffolder = yield* Scaffolder
      const error = yield* Effect.flip(scaffolder.plan("Bad_Name", "x"))
      expect(error._tag).toBe("InvalidName")
    }).pipe(Effect.provide(layer))
  })

  it.effect("plan rejects names already in the index", () => {
    const { layer } = testLayers({
      [`${ROOT}/tools.json`]: JSON.stringify({
        tools: [
          {
            name: "taken",
            path: "packages/taken",
            description: "x",
            status: { _tag: "Active" }
          }
        ]
      })
    })
    return Effect.gen(function* () {
      const scaffolder = yield* Scaffolder
      const error = yield* Effect.flip(scaffolder.plan("taken", "x"))
      expect(error._tag).toBe("NameTaken")
    }).pipe(Effect.provide(layer))
  })

  it.effect("plan alone writes nothing (dry-run)", () => {
    const { fs, spawned, layer } = testLayers()
    return Effect.gen(function* () {
      const scaffolder = yield* Scaffolder
      const plan = yield* scaffolder.plan("demo", "A demo tool.")
      expect(plan.files.length).toBeGreaterThan(0)
      expect(fs.files.size).toBe(0)
      expect(spawned).toHaveLength(0)
    }).pipe(Effect.provide(layer))
  })

  it.effect("apply writes files, installs, and registers atomically", () => {
    const { fs, spawned, layer } = testLayers()
    return Effect.gen(function* () {
      const scaffolder = yield* Scaffolder
      const registry = yield* Registry
      const plan = yield* scaffolder.plan("demo", "A demo tool.")
      const report = yield* scaffolder.apply(plan)
      expect(report.filesWritten).toBe(plan.files.length)
      expect(fs.files.has(`${ROOT}/packages/demo/package.json`)).toBe(true)
      expect(spawned.some((cmd) => cmd.includes("bun"))).toBe(true)
      // "scaffolded but unindexed" is unrepresentable:
      const resolution = yield* registry.resolve("demo")
      expect(resolution.tool.path).toBe("packages/demo")
    }).pipe(Effect.provide(layer))
  })
})
