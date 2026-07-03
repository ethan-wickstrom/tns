# Testing

Use `vitest` with `@effect/vitest@beta`. The test script is `vitest run`,
never `bun test`. Write Effect tests with `it.effect`, which provides a
test clock that starts at zero. Use `it.live` when a test needs real time
or visible logs. Provide a fresh layer inside each test with
`Effect.provide`, and reserve `it.layer` for expensive shared resources.
Compose test layers with `Layer.provideMerge` so leaf services stay
reachable for setup and assertions. Never import platform modules in tests.
Mock services with `Layer.succeed`.
