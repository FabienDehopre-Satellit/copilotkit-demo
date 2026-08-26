# How the agent reads app state in Angular: context vs shared state

Research for [issue #3](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/3).

Sources verified against `@copilotkit/angular` **0.3.1**, CopilotKit monorepo at commit
`b5d037545f49214b577bfae7c84ba330016b64ed` (2026-08-26), `@ag-ui/client` **0.0.57**,
`@ag-ui/core` **0.0.58**, and the published docs at <https://docs.copilotkit.ai/angular>.
Paths like `packages/angular/src/...` refer to the [CopilotKit repo](https://github.com/CopilotKit/CopilotKit).

## Short answer

There are two distinct channels, and they land in two different fields of the same AG-UI
`RunAgentInput` on every run:

| | Read-only context | Shared state |
|---|---|---|
| Angular API | `connectAgentContext()` / `[copilotkitAgentContext]` | `injectAgentStore()` + `agent.setState()` |
| Wire field | `RunAgentInput.context: {description, value}[]` | `RunAgentInput.state: any` |
| Direction | app → agent only | app ↔ agent |
| Value type | **string** (you stringify) | any JSON-serialisable object |
| Agent writes back via | — | `STATE_SNAPSHOT` / `STATE_DELTA` events |
| Reactive to signals | yes, via `effect()` | yes, `store().state()` is a `Signal` |

Both are wired at the `CopilotKitCore` level, below any specific agent, so both work with the
built-in runtime agent **and** with self-managed AG-UI agents. See
[Self-managed agents](#does-any-of-this-work-with-self-managed-ag-ui-agents).

## 1. Read-only context: `connectAgentContext`

### Signature

`packages/angular/src/lib/agent-context.ts`:

```ts
export interface ConnectAgentContextConfig {
  injector?: Injector;
}

export function connectAgentContext(
  context: Context | (() => Context),
  config?: ConnectAgentContextConfig,
): void
```

`Context` comes from `@ag-ui/client` and is exactly two **string** fields
(`ContextSchema` in `@ag-ui/core`):

```ts
{ description: string; value: string }
```

The `value` must be a string. Serialise objects yourself with `JSON.stringify`. (The Angular
package README shows `value: { theme: "dark" }`, which contradicts the type — the
[reference docs](https://docs.copilotkit.ai/reference/angular/functions/connectAgentContext)
are correct: "The stringified context value.")

### Where it must be called from

Inside an Angular injection context — a component/directive/service field initialiser or
constructor — because it calls `inject(Injector)` and `inject(CopilotKit)`. Outside one, pass
`{ injector }` explicitly. The whole body runs in `runInInjectionContext`.

### Does it track signals or snapshot once?

**It tracks, if you pass an accessor.** The implementation is one `effect`:

```ts
effect((teardown) => {
  const contextValue = typeof context === "function" ? context() : context;
  const id = copilotkit.core.addContext(contextValue);
  teardown(() => copilotkit.core.removeContext(id));
});
```

Consequences worth designing around:

- Passing a plain object registers once and never updates. Passing `() => ({...})` re-registers
  whenever any signal read inside the accessor changes.
- Each update is a **remove + add with a fresh UUID**, not an in-place mutation. Nothing on the
  wire depends on context identity, so this is fine, but it does mean the entire context entry
  is rebuilt on every board change — keep the accessor cheap or memoise the `JSON.stringify`
  in a `computed`.
- Cleanup is automatic on destroy of the owning injector.
- The effect body reads signals *and* writes to a store that notifies subscribers. Wrap
  anything expensive in a `computed` upstream so the effect only re-runs on real changes.

### The template directive

`packages/angular/src/lib/directives/copilotkit-agent-context.ts` exports
`CopilotKitAgentContext`, selector `[copilotkitAgentContext]`:

```html
<div [copilotkitAgentContext]="contextObject()"></div>
<!-- or -->
<div copilotkitAgentContext [description]="'Board state'" [value]="boardJson()"></div>
```

It uses `ngOnInit`/`ngOnChanges`/`ngOnDestroy`, and `updateContext()` is remove-then-add, same as
the function. **Gotcha, confirmed in the source and called out in the docs:** `ngOnChanges` only
updates when `this.contextId` is already set. `getContext()` returns `null` when neither a
`context` object nor *both* `description` and `value` are defined, so if the directive renders
before you have a complete context, the first registration never happens and later input changes
will not create it. Prefer `connectAgentContext` with an accessor for anything dynamic.

### When does the agent actually see it?

Context is **not** pushed mid-run. `CopilotKitCore` snapshots the store into the run input at the
moment a run starts — `packages/core/src/core/run-handler.ts` does
`context: this._internal.getContextForAgent(agent.agentId)` on both the `runAgent` (line 541) and
`connectAgent` (line 388) paths. So a board change mid-conversation is picked up on **the next
agent turn**, not the one already streaming.

There is a known staleness edge here. `CopilotKitCore.waitForPendingFrameworkUpdates()` exists
specifically so a follow-up run (after a frontend tool executes) waits for the framework to flush
deferred state before re-reading the context store; the React core overrides it with `flushSync`.
**The Angular `CopilotKit` service uses the base `CopilotKitCore` and does not override it**
(`packages/angular/src/lib/copilotkit.ts:142`), and Angular `effect`s are scheduled, not
synchronous. So if a frontend tool handler updates a signal that a context accessor reads, the
follow-up run in the same tool-calling loop may serialise the pre-update context. Verify
empirically before relying on it; the safe workaround is to have tool handlers mutate the shared
agent state (`agent.setState`) rather than relying on context to reflect their own writes.

### Per-agent scoping (available in core, not exposed in Angular)

`packages/core/src/core/context-store.ts` accepts `ScopedContext extends Context` with an optional
`agentIds?: string[]`; entries scoped to other agents are dropped from the run input and the
scoping metadata is stripped before it goes over the wire. The Angular signature types the
parameter as plain `Context`, so to scope you must call
`copilotkit.core.addContext({ description, value, agentIds })` yourself and `removeContext(id)` on
destroy. For a single-agent task board this does not matter.

## 2. Shared state: `injectAgentStore` + `agent.setState`

### Signature

`packages/angular/src/lib/agent.ts`:

```ts
export function injectAgentStore(
  agentId: string | Signal<string | undefined>,
): Signal<AgentStore>

export class AgentStore {
  readonly agent: AbstractAgent;              // imperative escape hatch
  readonly isRunning: Signal<boolean>;
  readonly messages: Signal<Message[]>;
  readonly state: Signal<unknown>;            // note: unknown, not generic
  readonly interruptController: InterruptController;
  teardown(): void;
}
```

Note the double call: the function returns a `Signal<AgentStore>` (the store itself is swapped
when the agent identity changes), and the store's members are themselves signals. So reads look
like `store().state()`, `store().messages()`, `store().isRunning()`.

`injectAgentStore` calls `inject(CopilotkitAgentFactory)` and `inject(DestroyRef)`, so it also
must be called from an injection context. Teardown is automatic via `DestroyRef`.

### Reading — genuinely reactive, not a snapshot

The store subscribes to the agent through `core.subscribeToAgentWithOptions` and pushes into
`WritableSignal`s on `onMessagesChanged` / `onStateChanged` / run lifecycle callbacks. The signals
are seeded synchronously in the constructor from `agent.messages` / `agent.state` so a restored
thread renders on first paint. `state` is shallow-copied on every push
(`snapshotState`: spread for objects and arrays, pass-through otherwise), which is what makes
signal equality work — but it is **shallow**, so nested objects are shared by reference between
successive emissions. Type it and treat it as immutable.

`state` is typed `Signal<unknown>`. There is no generic parameter, so cast at the edge:

```ts
readonly state = computed(
  () => (this.store().state() as BoardState | undefined) ?? EMPTY_BOARD,
);
```

### Writing — through the agent, not the signal

The signals are `asReadonly()`. Writes go through the plain AG-UI agent:

```ts
const agent = this.store().agent;
agent.setState({ ...current, priority: "high" });   // replace, never mutate
```

`AbstractAgent.setState` clones the value and then notifies subscribers asynchronously (a
microtask), which is what makes `store().state()` update after your own write. Because the store
only ever sees the object it is handed, **mutating in place will not trigger change detection** —
always replace the object. This is the docs' explicit rule: "Read through `store().state()` so
Angular tracks changes. Write through the plain AG-UI agent at `store().agent`. Replace the
object instead of mutating it in place."

Other useful members on `store().agent`: `addMessage()`, `setMessages()`, `abortRun()`,
`threadId`. To actually start a turn use `copilotkit.core.runAgent({ agent })`.

The documented full pattern (from the Angular shared-state guide):

```ts
@Component({ /* ... */ })
export class AgentStateComponent {
  private readonly copilotKit = inject(CopilotKit);
  readonly store = injectAgentStore("my_agent");
  readonly state = computed(() => (this.store().state() as AgentState | undefined) ?? {});

  async askQuestion(question: string): Promise<void> {
    const agent = this.store().agent;
    agent.setState({ ...this.state(), question, answer: "" });
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: question });
    await this.copilotKit.core.runAgent({ agent });
  }
}
```

### How the agent writes back

`AbstractAgent.prepareRunAgentInput` puts `state: <clone of this.state>` into every
`RunAgentInput`, so the agent receives the whole state object on each run. Coming back, the AG-UI
client applies two event types to `agent.state`, which then flows into the store's signal:

- `STATE_SNAPSHOT` — full replacement.
- `STATE_DELTA` — JSON Patch (`applyPatch`) applied to the current state.

For the **built-in runtime agent** (`packages/runtime/src/agent/index.ts`) this is implemented by
handing the LLM two tools and translating their results into those events:

- `AGUISendStateSnapshot` — "Replace the entire application state with a new snapshot",
  args `{ snapshot: any }`.
- `AGUISendStateDelta` — "Apply incremental updates to application state using JSON Patch
  operations", args `{ delta: Array<{ op: "add"|"replace"|"remove", path, value? }> }`.

Both are appended to `streamTextParams.tools` on every run, and their tool results are converted
into `STATE_SNAPSHOT` / `STATE_DELTA` events before being forwarded to the client. The Angular
package re-exports the tool name as `AGUI_SEND_STATE_SNAPSHOT_TOOL_NAME = "AGUISendStateSnapshot"`
(used by the A2UI renderer to suppress rendering an in-flight state tool call as UI).

An agent can advertise support via AG-UI `AgentCapabilities.state`
(`snapshots`, `deltas`, `memory`, `persistentState`), readable in Angular through
`injectCapabilities(agentId?)`.

## 3. How each one reaches the model

For the built-in runtime agent, both channels are concatenated into the **system prompt** on every
run (`packages/runtime/src/agent/index.ts`, around line 1030):

````text
<config.prompt>

## Context from the application
<description>:
<value>

## Application State
This is state from the application that you can edit by calling AGUISendStateSnapshot or AGUISendStateDelta.
```json
<JSON.stringify(input.state, null, 2)>
```
````

That is the whole mechanism. Two design consequences:

1. The agent is *told* it may edit state, and given the tools to do so. Context carries no such
   affordance — it is prose facts.
2. Both are re-sent **in full on every turn**, pretty-printed for state. Neither is cached or
   diffed on the prompt side.

## 4. How much state is sensible to expose?

The docs give no number, so this is derived from the mechanism above rather than quoted.

- Cost model: `tokens ≈ size(context) + size(pretty-printed state)`, charged **per turn**, on top
  of a conversation history that is also growing. A 10 kB board JSON is roughly 3–4 k tokens
  re-sent on every single turn — a 10-turn conversation pays for it ten times.
- Pretty-printing (`null, 2`) inflates state notably versus compact JSON. You cannot change that
  for the built-in agent, so keep the object shallow and field names short.
- Practical budget for a demo task board: keep the exposed projection in the low single-digit kB.
  A board of ~20 cards with id/title/status/assignee is comfortable; full descriptions,
  timestamps, comment threads, and audit history are not.
- Expose a **projection**, not your domain model. Drop UI-only fields, derived values the model can
  infer, and anything the agent has no reason to act on. If the agent needs detail on one card,
  make that a frontend tool call (`getCardDetail`) rather than shipping every card's detail every
  turn.
- Ownership rule from the docs: shared state for values **the agent may modify**; context for
  application-owned facts the agent only reads. Duplicating a value in both is pure waste — state
  is already in the prompt.
- Anything sensitive is in the prompt verbatim. Filter before exposing.

## 5. Does any of this work with self-managed AG-UI agents?

**Yes, for both channels** — and it is worth being precise about why, because the docs do not say
so directly.

Neither channel is implemented in the agent. Context is injected by `CopilotKitCore`'s run handler
into `RunAgentInput.context`, and state is injected by `AbstractAgent.prepareRunAgentInput` into
`RunAgentInput.state`, before `agent.runAgent()` / `agent.connectAgent()` is called. Any
`AbstractAgent` subclass — runtime proxy, self-managed HTTP agent, or a mock — receives them
identically. The regression test `packages/core/src/__tests__/core-context-injection.test.ts`
asserts exactly this against a plain mock agent on both the `runAgent` and `connectAgent` paths.

Angular registers self-managed agents through `provideCopilotKit`
(`packages/angular/src/lib/config.ts`):

```ts
provideCopilotKit({
  agents: { "board-agent": myAgent },              // dev / local prototyping
  selfManagedAgents: { "board-agent": myAgent },   // production, your own secured endpoint
})
```

Each key is the `agentId` you pass to `injectAgentStore` and to the chat components.
`selfManagedAgents` takes precedence over runtime-discovered agents on ID collision, and the docs
note it is an **Enterprise Intelligence tier feature requiring a license for production use**;
`agents` is the unsecured dev-only path. With self-managed agents you own auth on every request —
no runtime middleware applies.

The caveats are on the agent side, not the Angular side:

- **Context**: your agent gets `input.context` as an array of `{description, value}` and must put
  it in its own prompt. The built-in agent's `## Context from the application` block is *its*
  behaviour, not the protocol's.
- **State writes**: your agent must emit `STATE_SNAPSHOT` or `STATE_DELTA` events for state to flow
  back. The `AGUISendStateSnapshot` / `AGUISendStateDelta` tools are the built-in agent's
  implementation detail; a LangGraph/CrewAI/custom agent emits the events its own way. Advertise
  it via `AgentCapabilities.state`.
- **Persistence**: `RunAgentInput.state` is whatever the client currently holds, so with a
  stateless self-managed agent the client is the source of truth across runs. If your agent keeps
  its own state, `persistentState` in its capabilities is the flag that says so.

## 6. What this means for the task-board state model (ticket #6)

Concretely, for a board the agent can rearrange:

- The board **is** shared state, not context — the agent will move cards. One `injectAgentStore`
  scoped to the board agent's ID.
- Angular signals stay the app's source of truth for rendering; the agent's state is the
  synchronisation channel. Decide one direction of ownership per field and stick to it, because
  there is no merge: `setState` replaces, `STATE_SNAPSHOT` replaces, `STATE_DELTA` patches.
- Define a `BoardState` type and a single `computed` casting `store().state()` with a defaulted
  empty board — the signal is `unknown` and starts empty before any run.
- Keep the shape flat and patch-friendly (`{ columns: [...], cards: [...] }` with stable ids)
  so `STATE_DELTA` JSON Pointer paths are short and the model can move one card without
  rewriting the board.
- Use `connectAgentContext` only for surrounding facts the agent should read but never edit —
  current user, today's date, board name, permission level.
- Never mutate the state object in place; always replace.

## Sources

- `packages/angular/src/lib/agent-context.ts`, `.../directives/copilotkit-agent-context.ts`,
  `.../agent.ts`, `.../config.ts`, `.../capabilities.ts`, `.../copilotkit.ts`,
  `.../components/a2ui/a2ui-tool-types.ts` — CopilotKit @ `b5d0375`
- `packages/core/src/core/context-store.ts`, `.../core.ts`, `.../run-handler.ts`
- `packages/core/src/__tests__/core-context-injection.test.ts`,
  `.../core-context-timing.test.ts`
- `packages/runtime/src/agent/index.ts` (prompt assembly ~L1030, state tools ~L1293,
  event emission ~L1685)
- `@ag-ui/core@0.0.58` `dist/index.d.ts` — `ContextSchema`, `RunAgentInputSchema`,
  `StateCapabilitiesSchema`
- `@ag-ui/client@0.0.57` `dist/index.d.ts` / `index.mjs` — `AbstractAgent`,
  `prepareRunAgentInput`, `setState`, `STATE_SNAPSHOT` / `STATE_DELTA` application
- <https://docs.copilotkit.ai/angular/guides/shared-state>
- <https://docs.copilotkit.ai/angular/backend/self-managed-agents>
- <https://docs.copilotkit.ai/reference/angular/functions/connectAgentContext>
- <https://docs.copilotkit.ai/reference/angular/functions/injectAgentStore>
