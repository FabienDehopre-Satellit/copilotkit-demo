# Blazor, CopilotKit, AG-UI, and A2UI

Research date: 2026-09-07. All version numbers and statuses are as of that date. Primary sources
cited inline.

## If asked on stage

CopilotKit ships no Blazor SDK and none is on the roadmap — its frontend packages are React (GA)
and Angular/Vue/React Native (source only), all TypeScript, so a Blazor app can only reach them by
embedding a JS bundle through interop or an iframe, which is not worth doing. The reusable piece is
the wire protocol underneath: **AG-UI**, which is transport-agnostic SSE plus a small event
vocabulary, and Microsoft already ships the *server* half for .NET (`Microsoft.Agents.AI.Hosting.AGUI.AspNetCore`,
what `agent.cs` uses in Phase 2). There is no first-party AG-UI *client* renderer for Blazor — the
protocol deliberately leaves rendering to the client — but the events are simple enough to consume
from a hand-rolled Blazor component, and two solo community projects already do
(`lionfire/ag-ui-blazor`, `23min/a2ui-blazor`). If the goal is a .NET-native agentic chat UI today,
the pragmatic answer is Microsoft's own stack — the `Microsoft.Extensions.AI` AI Chat Web App
template is a Blazor app — not CopilotKit.

## 1. CopilotKit and Blazor

No Blazor support, official or community, and nothing on the roadmap. CopilotKit describes itself as
"The Frontend Stack for Agents & Generative UI. React, Angular, Mobile, Slack" and its published
client surface is React/Next.js (GA), with Angular, Vue and React Native carrying source but
"documentation coming soon"
([github.com/CopilotKit/CopilotKit](https://github.com/CopilotKit/CopilotKit),
[docs.copilotkit.ai](https://docs.copilotkit.ai/)). The Angular package targets Angular 19–21
([copilotkit.ai/blog/copilotkit-for-angular](https://www.copilotkit.ai/blog/copilotkit-for-angular)).
Every one of these is a TypeScript/npm package built on web components or framework-native
bindings; none emits a framework-neutral custom element documented for external hosts.

Consuming CopilotKit from Blazor would therefore mean one of:

- **JS interop**: bundle `@copilotkit/*` with a JS build step, mount `<copilot-chat>` into a DOM
  node, and marshal every state change across the Blazor/JS boundary by hand. The chat component
  drives its own agent runs (`copilotkit.core.runAgent`), so shared state, tool approvals and
  `threadId` binding all have to be bridged. High effort, fragile across CopilotKit's fast-moving
  preview releases.
- **iframe**: host a tiny React app and post messages. Loses in-page context sharing, which is the
  entire point of CopilotKit.

Neither is a supported path. There is no CopilotKit GitHub issue or discussion requesting Blazor
(searched 2026-09-07; the hits are all GitHub Copilot / `microsoft/chat-copilot`, unrelated).

## 2. AG-UI protocol — .NET / Blazor on the UI side

AG-UI is an "open, lightweight, event-based protocol" — HTTP POST + Server-Sent Events carrying a
fixed event set (`TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, `STATE_DELTA`, …). CopilotKit authors
it ([github.com/ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui),
[docs.ag-ui.com/introduction](https://docs.ag-ui.com/introduction)).

**Server side for .NET exists and is first-party.** The AG-UI `.NET SDK` was tracked in
[ag-ui issue #28](https://github.com/ag-ui-protocol/ag-ui/issues/28) (opened 2025-05-23, closed
"Done"), built on `Microsoft.Extensions.AI`, and lives at
[`sdks/dotnet`](https://github.com/ag-ui-protocol/ag-ui/tree/main/sdks/dotnet). Microsoft Agent
Framework wraps it as `Microsoft.Agents.AI.Hosting.AGUI.AspNetCore` (`--prerelease`), exposing a MAF
`AIAgent` as an AG-UI endpoint via `MapAGUIServer`
([learn.microsoft.com/agent-framework/integrations/.../ag-ui](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/ui/ag-ui/),
doc dated 2026-08-11; tracked in
[microsoft/agent-framework #1774](https://github.com/microsoft/agent-framework/issues/1774)). This
is exactly the layer this repo's Phase 2 `agent.cs` uses.

**Client / UI side for .NET: nothing first-party.** That Microsoft doc is explicit — the .NET
integration "exposes a MAF `AIAgent` as an AG-UI HTTP endpoint" and "AG-UI clients decide how to
render text, tool, approval, and state events." Its recommended *client* is a CopilotKit React
frontend registered as an `HttpAgent`. The reference client library `@ag-ui/client` is npm/TypeScript
([npmjs.com/package/@ag-ui/client](https://www.npmjs.com/package/@ag-ui/client)) — it is the package
`@copilotkit/angular` 0.3.1 pins at 0.0.57, per this repo's AGENTS.md. The AG-UI Dojo
([dojo.ag-ui.com](https://dojo.ag-ui.com/microsoft-agent-framework-dotnet)) demonstrates a .NET MAF
*backend* against a JS *frontend*. The Agent Framework Go provider ships both server and client
helpers; the .NET one ships server only.

**Community Blazor AG-UI client:** [`lionfire/ag-ui-blazor`](https://github.com/lionfire/ag-ui-blazor)
— MIT, ~2 stars, 31 commits, self-labelled "experimental vibe code," one author. Provides MudBlazor
chat components, tool-approval UI, token/cost tracking, connection handling, for both Blazor Server
and WASM. Proof the protocol is consumable from Blazor; not something to depend on for a talk demo.

So: a Blazor app can speak AG-UI to a .NET agent backend by opening the SSE stream and mapping the
~16 event types onto Razor components itself. That is a real option and not a large amount of code
for a chat-shaped UI, but you are building the renderer, not adopting one.

## 3. A2UI (Agent-to-UI)

Google's Apache-2.0 spec for **declarative generative UI**: an agent emits JSON describing a
component tree drawn from a catalog the host advertises; the host renders with its own native
widgets, and no executable code crosses the trust boundary
([developers.googleblog.com/introducing-a2ui](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)).
v0.8 shipped 2025-12-15; **v0.9 shipped 2026-04-17** with renderers for React (new), Flutter, Lit
and Angular, a shared `web-core` browser library, and a Python agent SDK (`pip install
a2ui-agent-sdk`)
([copilotkit.ai/blog/a2ui-whats-new](https://www.copilotkit.ai/blog/a2ui-whats-new-in-google-generative-ui-spec)).

A2UI is a **layer above AG-UI**, not a competitor: "any agent already speaking AG-UI can drive A2UI
v0.9 without touching agent code" — A2UI component descriptions travel as AG-UI `CUSTOM` events. It
solves generative UI (agent decides *what widgets to show*), which is a harder problem than the chat
transcript CopilotKit's Angular demo shows.

**.NET / Blazor:** no official renderer and none announced. One community project:
[`23min/a2ui-blazor`](https://github.com/23min/a2ui-blazor) — MIT, ~3 stars, 56 commits, one org,
NuGet `A2UI.Blazor` / `A2UI.Blazor.Server`, 16-widget catalog, data binding, streaming, bUnit +
Playwright tests, WASM and Server. More thoroughly tested than the AG-UI Blazor project but still a
solo, early effort implementing spec v0.9.

Because A2UI's whole premise is "host renders with native widgets," it is architecturally a *better*
fit for Blazor than CopilotKit's web-component approach — a Blazor A2UI renderer is idiomatic Razor.
It is just not something Google or Microsoft ships.

## 4. What a Blazor dev should actually use for an agentic chat UI

The .NET-native answer, all first-party:

- **AI Chat Web App template** (`dotnet new install Microsoft.Extensions.AI.Templates`) — a
  **Blazor** web app with chat UI components, citations, follow-up suggestions, RAG ingestion, over
  the `Microsoft.Extensions.AI` / `Microsoft.Extensions.VectorData` abstractions. Preview.
  ([devblogs.microsoft.com/dotnet/announcing-dotnet-ai-template-preview1](https://devblogs.microsoft.com/dotnet/announcing-dotnet-ai-template-preview1/))
- **Microsoft Agent Framework** (the merge of Semantic Kernel + AutoGen) for the agent itself, with
  a documented upgrade path from the chat template
  ([devblogs.microsoft.com/dotnet/upgrading-to-microsoft-agent-framework-in-your-dotnet-ai-chat-app](https://devblogs.microsoft.com/dotnet/upgrading-to-microsoft-agent-framework-in-your-dotnet-ai-chat-app/)).
  `IChatClient` from `Microsoft.Extensions.AI` is the common abstraction; streaming, tool calls and
  approvals are all in-process, no protocol needed when UI and agent are the same app.
- **Third-party Blazor chat components**: DevExpress `DxAIChat`
  ([docs.devexpress.com/Blazor/405290](https://docs.devexpress.com/Blazor/405290/ai/ai-chat)) and
  Syncfusion both bind to `Microsoft.Extensions.AI`. Commercial, drop-in.
- **Bridge via AG-UI** only when the agent is a separate remote service (the Phase 1/Phase 2 split
  this repo demonstrates). Then expose it with `Microsoft.Agents.AI.Hosting.AGUI.AspNetCore` and
  either consume the SSE stream from a hand-written Blazor component or lean on `23min/a2ui-blazor` /
  `lionfire/ag-ui-blazor`.

The trade CopilotKit makes — a polished, batteries-included frontend for agents you don't control —
only pays off in React today, Angular soon. For Blazor, you either keep the agent in-process and use
the Microsoft chat stack, or you speak AG-UI and render it yourself.

## Sources

- https://github.com/CopilotKit/CopilotKit
- https://docs.copilotkit.ai/
- https://www.copilotkit.ai/blog/copilotkit-for-angular
- https://github.com/ag-ui-protocol/ag-ui
- https://github.com/ag-ui-protocol/ag-ui/issues/28
- https://github.com/ag-ui-protocol/ag-ui/tree/main/sdks/dotnet
- https://docs.ag-ui.com/introduction
- https://www.npmjs.com/package/@ag-ui/client
- https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/ui/ag-ui/
- https://github.com/microsoft/agent-framework/issues/1774
- https://dojo.ag-ui.com/microsoft-agent-framework-dotnet
- https://github.com/lionfire/ag-ui-blazor
- https://github.com/23min/a2ui-blazor
- https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/
- https://www.copilotkit.ai/blog/a2ui-whats-new-in-google-generative-ui-spec
- https://devblogs.microsoft.com/dotnet/announcing-dotnet-ai-template-preview1/
- https://devblogs.microsoft.com/dotnet/upgrading-to-microsoft-agent-framework-in-your-dotnet-ai-chat-app/
- https://docs.devexpress.com/Blazor/405290/ai/ai-chat
