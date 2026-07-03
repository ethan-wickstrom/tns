import { Effect, FileSystem, Schema } from "effect"

/** The workspace root is the nearest ancestor directory holding `tools.json`. */
export class NotWorkspaceRoot extends Schema.TaggedErrorClass<NotWorkspaceRoot>()(
  "NotWorkspaceRoot",
  { searchedFrom: Schema.String }
) {}

const parentOf = (dir: string): string | undefined => {
  const idx = dir.lastIndexOf("/")
  if (idx <= 0) return dir === "/" ? undefined : "/"
  return dir.slice(0, idx)
}

export const findWorkspaceRoot: Effect.Effect<
  string,
  NotWorkspaceRoot,
  FileSystem.FileSystem
> = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const start = process.cwd()
  let dir: string | undefined = start
  while (dir !== undefined) {
    const exists = yield* Effect.orDie(fs.exists(`${dir}/tools.json`))
    if (exists) return dir
    dir = parentOf(dir)
  }
  return yield* new NotWorkspaceRoot({ searchedFrom: start })
}).pipe(Effect.withSpan("findWorkspaceRoot"))
