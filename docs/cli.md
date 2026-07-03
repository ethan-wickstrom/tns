# CLI structure

Import `Argument`, `Command`, and `Flag` from `effect/unstable/cli`. Build
commands with `Command.make(name, config, handler)`, describe them with
`Command.withDescription`, and compose them with `Command.withSubcommands`.
Keep handlers thin. They read services and call them, and business logic
lives in the services. Help, version, and completions are generated
automatically.

Entry point shape:

```typescript
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import { Command } from "effect/unstable/cli"
import pkg from "../package.json" with { type: "json" }

const AppLayer = MyService.layer.pipe(
  Layer.provideMerge(BunServices.layer)
)

app.pipe(
  Command.run({ version: pkg.version }),
  Effect.provide(AppLayer),
  BunRuntime.runMain
)
```

`packages/tns/src/cli.ts` is a working example of this shape.

Only the entry file imports platform-specific modules. All other code
imports abstractions such as `FileSystem` and `Terminal` from `effect`.
Because the CLI parser evolves during the beta, confirm the current
`Command.run` shape and the available `Argument` and `Flag` constructors in
the installed package before use, and test flag ordering rather than
assuming it.
