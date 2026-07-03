import { Effect, FileSystem, Layer, PlatformError, Sink, Stream } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"

/**
 * Test adapters: an in-memory filesystem (the local-substitutable stand-in
 * for the Registry/Scaffolder persistence seam) and a stub process spawner.
 */

export interface MemFs {
  readonly layer: Layer.Layer<FileSystem.FileSystem>
  readonly files: Map<string, string>
  readonly directories: Set<string>
}

const enoent = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "FileSystem",
    method,
    pathOrDescriptor: path
  })

export const memFs = (initial: Record<string, string> = {}): MemFs => {
  const files = new Map<string, string>(Object.entries(initial))
  const directories = new Set<string>()
  const layer = FileSystem.layerNoop({
    exists: (path) =>
      Effect.succeed(
        files.has(path) ||
          directories.has(path) ||
          [...files.keys()].some((key) => key.startsWith(`${path}/`))
      ),
    readFileString: (path) => {
      const contents = files.get(path)
      return contents === undefined ? Effect.fail(enoent("readFileString", path)) : Effect.succeed(contents)
    },
    writeFileString: (path, data) => {
      files.set(path, data)
      return Effect.void
    },
    makeDirectory: (path) => {
      directories.add(path)
      return Effect.void
    },
    rename: (oldPath, newPath) => {
      let moved = false
      for (const [key, value] of [...files.entries()]) {
        if (key === oldPath || key.startsWith(`${oldPath}/`)) {
          files.delete(key)
          files.set(newPath + key.slice(oldPath.length), value)
          moved = true
        }
      }
      if (directories.delete(oldPath)) {
        directories.add(newPath)
        moved = true
      }
      return moved ? Effect.void : Effect.fail(enoent("rename", oldPath))
    }
  })
  return { layer, files, directories }
}

/** Stub spawner: records commands and reports exit code 0 without spawning. */
export const stubSpawner = (spawned: Array<string> = []) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        spawned.push(
          command._tag === "StandardCommand"
            ? [command.command, ...command.args].join(" ")
            : command._tag
        )
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(1),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.empty,
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void)
        })
      })
    )
  )
