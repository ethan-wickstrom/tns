import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import pkg from "../package.json" with { type: "json" }
import { deprecateCommand, listCommand, newCommand, whichCommand } from "./commands.ts"
import { Registry } from "./registry.ts"
import { Scaffolder } from "./scaffold.ts"

const app = Command.make("tns").pipe(
  Command.withDescription("Tools 'n Stuff: scaffold and index the CLIs in this monorepo"),
  Command.withSubcommands([newCommand, listCommand, whichCommand, deprecateCommand])
)

const AppLayer = Scaffolder.layer.pipe(
  Layer.provideMerge(Registry.layer),
  Layer.provideMerge(BunServices.layer)
)

app.pipe(
  Command.run({ version: pkg.version }),
  Effect.provide(AppLayer),
  BunRuntime.runMain
)
