import { Schema } from "effect"
import { RelativePath } from "./file.ts"

/**
 * Domain model for the tool index.
 *
 * `tools.json` at the workspace root is the single authoritative
 * representation of "which tools exist". Location does not encode identity:
 * a deprecated tool moves to `deprecated/` but keeps its name, and the index
 * keeps resolving it.
 */

export const ToolName = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[a-z][a-z0-9-]*$/, {
      description: "lowercase letters, digits and dashes, starting with a letter"
    })
  ),
  Schema.brand("ToolName")
)
export type ToolName = typeof ToolName.Type

export class Active extends Schema.TaggedClass<Active>()("Active", {}) {}

export class Deprecated extends Schema.TaggedClass<Deprecated>()("Deprecated", {
  supersededBy: Schema.optionalKey(ToolName)
}) {}

export const ToolStatus = Schema.Union([Active, Deprecated])
export type ToolStatus = typeof ToolStatus.Type

export class Tool extends Schema.Class<Tool>("Tool")({
  name: ToolName,
  path: RelativePath,
  description: Schema.String,
  status: ToolStatus
}) {}

export class ToolIndex extends Schema.Class<ToolIndex>("ToolIndex")({
  tools: Schema.Array(Tool)
}) {
  static readonly Json = Schema.fromJsonString(ToolIndex)
  static readonly empty = new ToolIndex({ tools: [] })

  find(name: string): Tool | undefined {
    return this.tools.find((tool) => tool.name === name)
  }
}

/**
 * The result of resolving a name through the index: the tool itself, plus the
 * active successor when the deprecation chain leads to one.
 */
export class Resolution extends Schema.Class<Resolution>("Resolution")({
  tool: Tool,
  successor: Schema.optionalKey(Tool)
}) {}

// --- Errors ---

export class ToolNotFound extends Schema.TaggedErrorClass<ToolNotFound>()("ToolNotFound", {
  name: Schema.String,
  suggestions: Schema.Array(ToolName)
}) {}

export class NameTaken extends Schema.TaggedErrorClass<NameTaken>()("NameTaken", {
  name: ToolName
}) {}

export class InvalidName extends Schema.TaggedErrorClass<InvalidName>()("InvalidName", {
  name: Schema.String,
  reason: Schema.String
}) {}

export class InvalidSuccessor extends Schema.TaggedErrorClass<InvalidSuccessor>()(
  "InvalidSuccessor",
  {
    name: ToolName,
    reason: Schema.String
  }
) {}
