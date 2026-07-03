import { Schema } from "effect"

/**
 * The shared file primitive: a relative path plus its full contents.
 *
 * Generic and domain-free — the Registry uses it to rewrite its index and the
 * Scaffolder uses it as blueprint output. Both modules speak this one kind of
 * thing.
 */
export const RelativePath = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^(?!\/)(?!.*\.\.).+$/)),
  Schema.brand("RelativePath")
)
export type RelativePath = typeof RelativePath.Type

export class File extends Schema.Class<File>("File")({
  path: RelativePath,
  contents: Schema.String
}) {}

export const file = (path: string, contents: string): File =>
  new File({ path: RelativePath.make(path), contents })
