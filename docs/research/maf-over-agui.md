# MAF .NET over AG-UI to a CopilotKit Angular frontend

Research for [issue #5](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/5). Sources checked 2026-08-26.

## Short answer

Yes, and it takes about three lines of C#.

Microsoft ships a **first-party AG-UI hosting adapter for MAF .NET**:
`Microsoft.Agents.AI.Hosting.AGUI.AspNetCore`. It exposes any MAF `AIAgent` as an
AG-UI SSE endpoint. Nothing needs hand-rolling. CopilotKit's Angular
`selfManagedAgents` option points an `HttpAgent` straight at that endpoint, and
**browser-side frontend tools keep working** — they ride the AG-UI protocol's own
`tools` field, not any CopilotKit runtime feature.

The one real caveat is not technical but architectural: Microsoft's own AG-UI
security guidance says *don't* expose an AG-UI server directly to a browser,
which is precisely what `selfManagedAgents` does. Fine for the demo, needs a
different shape for production. See [The catch](#the-catch).

## 1. MAF .NET: packages, versions, status

Core MAF .NET is **GA**. The AG-UI hosting adapter is **still preview**.

| Package | Latest | Status |
| --- | --- | --- |
| `Microsoft.Agents.AI` | 1.19.0 | stable / GA |
| `Microsoft.Agents.AI.OpenAI` | 1.19.0 | stable / GA |
| `Microsoft.Agents.AI.Hosting.AGUI.AspNetCore` | 1.19.0-preview.260822.1 | **preview only** — no stable version has ever shipped |
| `AGUI.Client` / `AGUI.Abstractions` (.NET client SDK) | 0.0.5 | early preview |

Versions read from the NuGet v3 API (`api.nuget.org` flat-container index and the
`packageid:` search with `prerelease=false`). The AG-UI hosting package returns
**zero** stable results, so `--prerelease` is mandatory. The Microsoft Learn
install snippet says the same: `dotnet add package
Microsoft.Agents.AI.Hosting.AGUI.AspNetCore --prerelease`.

Namespaces live under `Microsoft.Agents.AI`; message and content types come from
`Microsoft.Extensions.AI`
([migration guide](https://learn.microsoft.com/agent-framework/migration-guide/from-semantic-kernel/)).

The minimal agent-with-tools shape
([function tools](https://learn.microsoft.com/agent-framework/agents/tools/function-tools)):

```csharp
[Description("Get the weather for a given location.")]
static string GetWeather([Description("The location.")] string location)
    => $"The weather in {location} is cloudy with a high of 15°C.";

AIAgent agent = chatClient.AsAIAgent(
    name: "Assistant",
    instructions: "You are a helpful assistant",
    tools: [AIFunctionFactory.Create(GetWeather)]);
```

`AIFunctionFactory.Create` turns any C# method into a tool;
`[Description]` on the method and its parameters is what the model sees.

## 2. The AG-UI adapter exists, and it is first-party

Not a community shim — Microsoft documents it on Learn as the
[AG-UI integration](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/),
and names CopilotKit explicitly as the intended frontend.

```csharp
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.Services.AddAGUIServer();

AIAgent agent = CreateAgent();

WebApplication app = builder.Build();
app.MapAGUIServer("/", agent);
await app.RunAsync();
```

`MapAGUIServer` accepts AG-UI `RunAgentInput` requests and streams the agent's
response as AG-UI events over SSE. Per Learn, the .NET integration covers:

1. Streaming agent text over SSE.
2. Surfacing **backend and frontend tool calls** as AG-UI events.
3. MAF tool-approval requests round-tripped to the client (human-in-the-loop).
4. Client state, state snapshots and deltas, forwarded properties.
5. Resuming persisted hosted sessions via the AG-UI `threadId`.
6. Exposing workflows-converted-to-agents through the same endpoint.

Runnable samples live at
[`dotnet/samples/02-agents/AGUI`](https://github.com/microsoft/agent-framework/tree/main/dotnet/samples/02-agents/AGUI):
`Step01_GettingStarted`, `Step02_BackendTools`, `Step03_FrontendTools`,
`Step04_HumanInLoop`, `Step05_StateManagement`. Prerequisites are .NET 9+ per the
sample README (Learn's page says .NET 8 or later — trust the samples).

There is also an [AG-UI Dojo entry](https://dojo.ag-ui.com/microsoft-agent-framework-dotnet)
for `microsoft-agent-framework-dotnet`, referenced from Learn. (The dojo page is a
client-rendered SPA and did not yield its demo list to a plain fetch, so the
feature matrix there is unverified.)

### How much hand-rolled ASP.NET code would it have been?

Moot, but worth sizing so nobody proposes it. A hand-rolled endpoint would need
to deserialize `RunAgentInput` (threadId, runId, messages, tools, context, state,
plus a `resume` array for interrupts), frame SSE correctly with keepalive
comments, and emit the protocol's event vocabulary — which per the
[AG-UI event reference](https://docs.ag-ui.com/concepts/events) spans eight
categories:

- **Lifecycle**: `RUN_STARTED`, `STEP_STARTED`/`STEP_FINISHED`, `RUN_FINISHED`, `RUN_ERROR`
- **Text**: `TEXT_MESSAGE_START`/`CONTENT`(`delta`)/`END`, plus a `CHUNK` convenience form
- **Tool calls**: `TOOL_CALL_START` (`toolCallId`, `toolCallName`), `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT`, plus `TOOL_CALL_CHUNK`
- **State**: `STATE_SNAPSHOT`, `STATE_DELTA` (RFC 6902 JSON Patch), `MESSAGES_SNAPSHOT`
- **Activity**, **Subagent**, **Reasoning**, and `RAW`/`CUSTOM` escape hatches

Event type names are UPPERCASE_UNDERSCORE; field names are camelCase
(`threadId`, `runId`, `messageId`). Transport is HTTP POST in, SSE out, JSON
payloads, with `: keepalive` comment lines every 15s on an idle stream.

Just the chat-turn-with-tool-calls subset means a correct streaming state machine
across three interleaved event families and a two-leg continuation for tool
results. Several hundred lines, and every one of them a place to drift from a
protocol Microsoft warns is "still under development and subject to change."
Use the adapter.

## 3. Wiring `selfManagedAgents` from Angular

`provideCopilotKit` takes `selfManagedAgents`, a map of agent id to an
`AbstractAgent` — normally `HttpAgent` from `@ag-ui/client`:

```ts
import { ApplicationConfig } from "@angular/core";
import { provideCopilotKit } from "@copilotkit/angular";
import { HttpAgent } from "@ag-ui/client";

export const appConfig: ApplicationConfig = {
  providers: [
    provideCopilotKit({
      selfManagedAgents: {
        default: new HttpAgent({ url: "http://localhost:8888/" }),
      },
    }),
  ],
};
```

`@copilotkit/angular` is at **0.3.1** on npm; `@ag-ui/client` at **0.0.58**.
Both pre-1.0 — expect churn.

`provideCopilotKit` also accepts `runtimeUrl`, `headers`, `properties`, and
`frontendTools`. `selfManagedAgents` and `runtimeUrl` are alternatives:
self-managed agents **bypass the CopilotKit runtime entirely** — the browser
connects directly to the agent endpoint instead of going through a server-side
proxy. In React the same thing is spelled `selfManagedAgents` or, identically,
`agents__unsafe_dev_only`. That the two names alias the same prop tells you how
CopilotKit thinks about it.

### CORS

The browser is now the direct client, so the MAF endpoint owns CORS. `HttpAgent`
POSTs `RunAgentInput` as JSON and reads an SSE stream back; a JSON content type
plus any custom header triggers a preflight, so the ASP.NET app needs
`AddCors`/`UseCors` allowing the Angular origin, `POST`, `Content-Type`, `Accept`,
and whatever auth header you use. (Microsoft's Python AG-UI docs show exactly
this — a `CORSMiddleware` block in the "Custom Server Configuration" section —
which confirms the requirement is real, though the ASP.NET spelling of it is
mine, not a citation.)

### API-key exposure

This is where the scary CopilotKit warnings need parsing carefully, because they
target a *different* configuration than ours.

The warning — "never use `agents__unsafe_dev_only` or `selfManagedAgents` in
production, these props ship embedded credentials directly to the browser
bundle" — is written against `BuiltInAgent({ apiKey: process.env.OPENAI_KEY! })`,
where the **model provider key** is constructed in browser code. That is
genuinely fatal.

`HttpAgent({ url })` is not that. It carries a URL, not a model key. The Azure
OpenAI credential stays server-side in the MAF process, where
`DefaultAzureCredential` / `ManagedIdentityCredential` reads it. **No model API
key reaches the browser in the MAF-over-AG-UI shape.**

What you do lose is the runtime's server-side auth, middleware and routing. Per
CopilotKit's self-managed-agents doc: *"your agent endpoint must authenticate and
authorize every request."* Anything you put in `HttpAgent`'s `headers` (e.g.
`Authorization: Bearer …`) is visible to the user, so it must be a
per-user token the user is already entitled to — never a shared secret.

Also worth flagging for anything beyond the demo: CopilotKit documents
`selfManagedAgents` as **part of its Enterprise Intelligence tier** for production
use. The `runtimeUrl` and `publicLicenseKey` paths are the non-licensed options.

## 4. The make-or-break question: do frontend tools still work?

**Yes.** Confidently, on both sides of the wire.

**Client side.** Frontend tools are a `CopilotKitCore` concern, not a runtime
concern. A `FrontendTool` is `{ name, description, parameters, handler, followUp,
agentId, available }`, and the execution loop per CopilotKit's own architecture
docs is:

```
Agent -> Core:  TOOL_CALL_START { name: "myTool" }
Agent -> Core:  TOOL_CALL_ARGS  { ... }
Core  -> Tool:  handler(args)
Tool  -> Core:  result
Core  -> Agent: TOOL_CALL_RESULT
   (if followUp) Core -> Agent: re-run with the result
```

Every arrow there is between the browser and the agent. The runtime is not in the
picture, so removing it changes nothing. Tool declarations reach the agent through
`RunAgentInput.tools`, a protocol field — `HttpAgent.runAgent({ tools: [...] })`
takes them directly.

**One live footgun.** Tools registered with `useFrontendTool` are attached by
CopilotKit's core, not by the agent object. Calling the agent directly drops them:

```ts
await agent.runAgent();            // wrong — runs without registered tools
await copilotkit.runAgent({ agent }); // right — attaches them
```

In Angular, register tools via `provideCopilotKit({ frontendTools: [...] })` (or
the runtime registration API) and drive runs through the CopilotKit service, not
by poking the `HttpAgent` yourself.

**Server side.** MAF's `MapAGUIServer` handles client-declared tools with **zero
extra server code**. Proof: the `Step03_FrontendTools` server `Program.cs` in the
agent-framework repo is byte-for-byte the same shape as `Step01_GettingStarted` —
`AddAGUIServer()`, build an agent, `MapAGUIServer("/", agent)`. No tool
registration, no flag, no opt-in. Microsoft's Python page states it outright: *"The
standard AG-UI server from the Getting Started tutorial automatically supports
frontend tools. No changes needed on the server side."*

Contrast with Go, where you must set `DisableFuncAutoCall: true` to stop the
server executing tools itself. .NET needs no such switch, because a client-declared
tool arrives with a schema and no implementation — MAF has nothing to execute
locally, so it emits the tool call and waits.

So phase 2 is unblocked. The agent learns about browser-side tools because
CopilotKit sends their JSON schemas in `RunAgentInput.tools` on every run, and MAF
merges them into the model's tool list alongside its own C# tools.

## The catch

Microsoft's
[AG-UI security considerations](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/security-considerations)
is blunt about the exact architecture `selfManagedAgents` produces:

> **Do not expose AG-UI servers directly to untrusted clients** (e.g., JavaScript
> running in browsers, mobile apps). Instead, implement a trusted frontend server
> that mediates communication and constructs AG-UI protocol messages in a
> controlled manner.

The recommendation is a three-tier trust boundary: untrusted end user -> trusted
frontend server -> AG-UI server. `selfManagedAgents` collapses the middle tier.
The named threats, all of which apply when a browser can POST arbitrary
`RunAgentInput`:

1. **Message-list injection** — a client can inject `system` or `assistant`
   messages, or fake tool results, straight into the conversation.
2. **Client-side tool injection** — a client can declare tools whose
   *descriptions* carry instructions to the model. This is the flip side of the
   feature phase 2 depends on: the same channel that makes frontend tools work
   makes them forgeable.
3. **State injection** — `state` is semantically message-like and is a prompt-injection vector.
4. **Context injection** and **forwarded-properties injection**.

Microsoft calls messages and state "the primary vectors," and notes AG-UI has no
built-in authorization: authenticate the endpoint with ASP.NET Core's own schemes.
A client-supplied `threadId` is "protocol data, not authorization credentials" —
if you enable session persistence, authorize the caller before resuming a session,
and register an `AgentIsolationKeyProvider` to scope sessions per principal (the
sample carries this warning inline).

Note the two sides agree on the diagnosis and disagree on nothing: CopilotKit calls
the prop `__unsafe_dev_only`; Microsoft says don't do it. Both are describing the
same missing tier.

### What this means for the demo

Phase 2 as specced — Angular + `selfManagedAgents` + MAF AG-UI endpoint — works,
and is the right shape for a local demo. It is a **demo/prototype topology**, and
the doc should say so wherever it's shown. CopilotKit's own runtime snippet labels
the direct-connect path "intended for development and prototyping purposes only."

If the demo ever needs a production story, the exit is the CopilotKit runtime
(`runtimeUrl`) — which *is* the trusted frontend server Microsoft is asking for,
and which registers the MAF endpoint as an `HttpAgent` server-side. Per Learn, that
path preserves everything: *"This allows CopilotKit's frontend tools to flow
through as AG-UI client tools, and all AG-UI features (streaming, approvals, state
sync) work automatically."* Frontend tools survive the move. Switching topologies
later is a config change, not a rewrite.

## Sources

- [AG-UI Integration with Agent Framework](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/) — Microsoft Learn
- [Getting Started with AG-UI](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/getting-started) — `MapAGUIServer`, SSE wire format, conversation continuity
- [Frontend Tool Rendering with AG-UI](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/frontend-tools) — protocol flow, "no changes needed on the server side"
- [Security Considerations for AG-UI](https://learn.microsoft.com/agent-framework/integrations/by-component/ui/ag-ui/security-considerations) — trust boundaries, the browser warning
- [Using function tools with an agent](https://learn.microsoft.com/agent-framework/agents/tools/function-tools) — `AIFunctionFactory.Create`
- [Microsoft Agent Framework overview](https://learn.microsoft.com/agent-framework/overview/)
- [`dotnet/samples/02-agents/AGUI`](https://github.com/microsoft/agent-framework/tree/main/dotnet/samples/02-agents/AGUI) — Step01–Step05, incl. the `Step03_FrontendTools` server `Program.cs`
- [AG-UI event types](https://docs.ag-ui.com/concepts/events)
- [CopilotKit: self-managed agents](https://docs.copilotkit.ai/backend/self-managed-agents)
- [CopilotKit: Microsoft Agent Framework integration](https://docs.copilotkit.ai/microsoft-agent-framework)
- CopilotKit repo via Context7 (`/copilotkit/copilotkit`): `provideCopilotKit` Angular reference, `FrontendTool` type reference, `dev-docs/architecture/plugin-points.md` tool-execution sequence, `skills/react-core/references/provider-setup.md` credential warnings
- NuGet v3 API for package versions; npm registry for `@copilotkit/angular` and `@ag-ui/client`
