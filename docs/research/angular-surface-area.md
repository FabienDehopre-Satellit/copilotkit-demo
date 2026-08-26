# Angular CopilotKit: surface area, versions, and React-parity gaps

Research for issue [#2](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/2).
Investigated 2026-08-26 against `@copilotkit/angular@0.3.1`, the docs at
<https://docs.copilotkit.ai/angular>, and the CopilotKit monorepo.

## Headline

**Every capability the demo needs has a real, documented Angular API.** There is no
React-only beat in the planned demo. The Angular package is a first-party, signal-based
port with essentially 1:1 component and hook parity — not a thin wrapper and not a preview.

The gaps that do exist are in *documentation coverage* and in two narrow spots
(`injectCapabilities` is documented but not shipped; `selfManagedAgents` is licence-gated
for production). Details below.

## 1. Version and stability

| Fact | Value | Source |
| --- | --- | --- |
| Latest version | `0.3.1`, published 2026-08-03 | `npm view @copilotkit/angular` |
| First release | `0.1.1`, 2026-06-18 | ditto — the package is ~2 months old |
| Canary tag | `0.3.2-canary.1785878925` (2026-08-04) | ditto |
| Licence | MIT | package.json |
| Bundled core | `@copilotkit/core` / `@copilotkit/shared` `1.66.0` | package.json dependencies |

**Stability signal: presented as stable, not preview.** The docs call it "the first-party,
signal-based Angular frontend for AG-UI agents and Copilot Runtime". The package README
says "First-party Angular bindings". There is no beta/experimental/preview banner anywhere
on the Angular docs.

**But** the `0.x` version number is real, and CopilotKit ships a shared
`docs-status.mdx` page into the Angular docs folder
(`showcase/shell-docs/src/content/docs/frontends/angular/docs-status.mdx`) that says:

> This frontend is feature complete, but the docs are still catching up. Its quickstart and
> reference guides are ready with more guides on the way. […] For broader product patterns,
> use the React docs as the complete feature map, then translate the implementation with
> the frontend-specific reference.

That is the honest summary: **feature-complete, docs-incomplete**. For the talk, expect to
occasionally read a React page for the concept and the Angular reference for the symbol.

## 2. Angular version requirements

There is a **discrepancy between the package and the quickstart** worth knowing before
scaffolding:

- `package.json` `peerDependencies` accept **Angular 20, 21, or 22**
  (`^20.0.0 || ^21.0.0 || ^22.0.0`) for `@angular/core`, `@angular/common`, and
  `@angular/cdk`, plus `rxjs ^7.8.0`.
- The published support matrix (`package.json` → `copilotkit.angularSupport`) lists tested
  combinations for Angular 20.3.26 / 21.2.18 / 22.0.7. The library is compiled at the
  Angular 20 floor.
- The **quickstart doc says "Angular 22" and "Node.js 22"** and tells you to
  `npx @angular/cli@22 new`.

So 20 and 21 will install and are tested, but 22 is the documented happy path. `@angular/cdk`
is a **required peer dep** and must match your Angular major — this is the most common
install failure, called out in the quickstart troubleshooting.

**Modern Angular assumptions — all favourable for this demo:**

- Standalone components throughout (`imports: [CopilotChat]`, no NgModules).
- Signal-based public API: signal inputs, `Signal<T>` returns, `OutputEmitterRef`.
- **Zoneless-compatible.** "The package does not require Zone.js." Most UI components are
  `OnPush`; the docs note `RenderToolCalls` currently uses default change detection.
- The documented minimal production setup pairs `provideCopilotKit` with
  `provideZonelessChangeDetection()` and `provideClientHydration()`.

## 3. Capability matrix — the answer to the question

Everything the demo wants is present. Exact symbols:

| Capability | Angular API | Status |
| --- | --- | --- |
| Integrated chat | `<copilot-chat>` (`CopilotChat`), `CopilotPopup`, `CopilotSidebar` | Shipped, documented |
| Agent reads app state | `connectAgentContext()` fn, `[copilotkitAgentContext]` directive, `CopilotKit.addContext()` | Shipped, documented |
| Frontend tools mutating UI | `registerFrontendTool()` | Shipped, documented |
| App component inside chat | `component:` on `registerFrontendTool`, or `registerRenderToolCall()` | Shipped, documented |
| MCP | Runtime-side `mcpServers`; frontend `provideMCPApps()` from `@copilotkit/angular/mcp-apps` | Shipped, documented |
| Human-in-the-loop | `registerHumanInTheLoop()`, `injectInterrupt()` | Shipped, documented |
| Shared / read-write agent state | `injectAgentStore()` → `.state()`, `.messages()`, `.isRunning()`; write via `agent.setState()` | Shipped, documented |
| Suggestions | `suggestionsConfig` in `provideCopilotKit`, `CopilotKit.addSuggestionsConfig()`, `CopilotChatSuggestionView` | Shipped; no `injectSuggestions` helper (see gaps) |
| Headless / custom chat view | `injectAgentStore()`, `injectChatState()`, `ChatState`, `provideSlots()` / `CopilotSlot` | Shipped, documented |
| Threads | `injectThreads()`, `ThreadsStore`, `CopilotThreadsDrawer` | Shipped; drawer component undocumented |
| Voice / transcription | `transcribeAudio()`, `CopilotChatAudioRecorder` | Shipped |
| Attachments | `attachmentsConfig`, `CopilotChatAttachmentsDirective` | Shipped |
| Memories | `injectMemories()` | Shipped |
| A2UI / Open Generative UI | `a2ui` + `openGenerativeUI` in config | Shipped |

The full export surface is large — 100+ runtime exports and ~90 exported types from
`@copilotkit/angular`, verified from the shipped `dist/index.d.ts`. CopilotKit maintains a
machine-validated API inventory (`packages/angular/API.md`) checked in tests, so the
documented surface is kept honest.

### React → Angular symbol map

Derived by diffing `reference/hooks` (React) against `reference/angular/functions` in the
docs source. Every React v2 hook has an Angular counterpart:

| React hook | Angular equivalent |
| --- | --- |
| `useCopilotKit` | `inject(CopilotKit)` service |
| `useAgent` | `injectAgentStore(agentId)` |
| `useAgentContext` | `connectAgentContext()` / `[copilotkitAgentContext]` |
| `useFrontendTool` | `registerFrontendTool()` |
| `useHumanInTheLoop` | `registerHumanInTheLoop()` |
| `useRenderTool` / `useRenderToolCall` | `registerRenderToolCall()` |
| `useInterrupt` | `injectInterrupt()` |
| `useThreads` | `injectThreads()` |
| `useCopilotChatConfiguration` | `provideCopilotChatConfiguration()` / `injectChatConfiguration()` |
| `useDefaultRenderTool` | `defaultToolRendering: true` + `CopilotDefaultToolRenderer` |
| `useConfigureSuggestions` / `useSuggestions` | `suggestionsConfig` + `CopilotKit.addSuggestionsConfig()` |
| `useComponent` | no direct equivalent — use `registerFrontendTool({ component })` |
| `useCapabilities` | `injectCapabilities()` — **documented but not shipped in 0.3.1** |

Component parity is 1:1 across `CopilotChat`, `CopilotChatAssistantMessage`,
`CopilotChatInput`, `CopilotChatMessageView`, `CopilotChatUserMessage`, `CopilotChatView`,
`CopilotPopup`, `CopilotSidebar`. React's `<CopilotKit>` provider becomes
`provideCopilotKit()`. React documents `CopilotThreadsDrawer`; Angular ships
`CopilotThreadsDrawer` but has no reference page for it.

## 4. The genuine gaps

These are the things to know, and none of them block the planned demo.

1. **`injectCapabilities` is documented but does not exist in 0.3.1.** There is a reference
   page at `reference/angular/functions/injectCapabilities.mdx`, but the symbol appears
   zero times in the shipped `dist/index.d.ts` *and* zero times in the shipped
   `fesm2022/copilotkit-angular.mjs`. React's `useCapabilities` is real. Do not plan a beat
   around runtime capability detection in Angular.

2. **`useComponent` has no Angular sugar.** In React it is a convenience wrapper that
   registers a tool and renders a component from the tool args in one call. In Angular you
   write the slightly longer `registerFrontendTool({ name, description, parameters,
   component, handler })`. Same capability, one extra step.

3. **No `injectSuggestions` helper.** React exposes suggestions as hooks
   (`useSuggestions`, `useConfigureSuggestions`). Angular exposes them as config plus
   service methods (`addSuggestionsConfig`, `reloadSuggestions`, `getSuggestions`,
   `suggestionsByAgent`) and a `CopilotChatSuggestionView` component. Capability parity,
   different ergonomics.

4. **Docs coverage lags React.** The Angular sidebar has 51 routes covering all the major
   areas, but the shared "docs status" caveat applies: read React pages for product
   patterns, Angular reference for exact symbols.

5. **`0.x` versioning with a fast cadence.** 25 versions in ~2 months, three minors
   (0.1 → 0.2 → 0.3) in that window. **Pin the exact version** for a talk demo; do not
   float on a caret range.

6. **Bundle size.** The quickstart explicitly warns that CopilotKit pulls in markdown and
   syntax-highlighting deps (`marked`, `highlight.js`, `katex`) and a fresh app can exceed
   Angular's default 1 MB production budget. Raise `budgets` in `angular.json`.

## 5. Required global setup

Three pieces, all confirmed from the quickstart.

**Stylesheet** — self-contained, no other CSS needed. Without it the chat renders unstyled:

```css
/* src/styles.css */
@import "@copilotkit/angular/styles.css";
```

**Provider:**

```ts
import { ApplicationConfig } from "@angular/core";
import { provideCopilotKit } from "@copilotkit/angular";

export const appConfig: ApplicationConfig = {
  providers: [
    provideCopilotKit({
      runtimeUrl: "http://localhost:8200/api/copilotkit",
    }),
  ],
};
```

**Full `CopilotKitConfig` shape** (verbatim from `dist/index.d.ts`):

```ts
interface CopilotKitConfig {
  runtimeUrl?: string;
  headers?: Record<string, string>;
  licenseKey?: string;
  properties?: Record<string, unknown>;
  agents?: Record<string, AbstractAgent>;
  selfManagedAgents?: Record<string, AbstractAgent>;
  tools?: ClientTool[];
  renderToolCalls?: RenderToolCallConfig[];
  renderActivityMessages?: RenderActivityMessageConfig[];
  suggestionsConfig?: SuggestionsConfig[];
  frontendTools?: FrontendToolConfig[];
  humanInTheLoop?: HumanInTheLoopConfig[];
  /** Opt in to a text-only renderer for otherwise unknown tool calls. */
  defaultToolRendering?: boolean;
  a2ui?: A2UIConfig;
  openGenerativeUI?: OpenGenerativeUIConfig;
}
```

Note `provideCopilotKit` returns a plain `Provider`, while `provideMCPApps` returns
`EnvironmentProviders`.

**Chat:**

```ts
@Component({
  selector: "app-root",
  imports: [CopilotChat],
  template: `<div style="height: 100vh"><copilot-chat /></div>`,
})
export class App {}
```

The host element **must have a defined height** — this is called out in the chat-ui guide
and is the most likely "why is my chat invisible" moment on stage.

## 6. SSR, hydration, zoneless

There is a dedicated `reference/angular/production-lifecycle` page. Summary:

- Browser-only behaviour is inert during server rendering and activates after hydration.
- Provide identical CopilotKit config and initial component inputs on server and first
  browser render.
- Do not call `runAgent`, media capture, sandbox functions, or MCP iframe operations during
  SSR.
- Put app-owned `window` / `document` / observer / media access behind `isPlatformBrowser`
  or `afterNextRender`.
- Do not branch the pre-hydration template on browser globals; change state through signals
  after hydration.
- Keep popup/sidebar `open`, `mode`, `position` inputs stable through hydration.

**Cleanup is automatic.** All the `inject*` / `register*` helpers must be called from an
injection context and tie themselves to the owning `DestroyRef`: `registerFrontendTool`,
`registerRenderToolCall`, and `registerHumanInTheLoop` remove their registrations on
destroy; `injectAgentStore` unsubscribes; `connectAgentContext` removes its context.
`AgentStore.teardown()` exists only for manually constructed stores.

**Security note relevant to the demo:** `headers`, `properties`, tool arguments, activity
content, and MCP host context are all browser-visible. Model credentials must stay behind
Copilot Runtime.

## 7. Implications for the two demo phases

### Phase 1 — built-in agent behind a Node CopilotRuntime

Fully supported and it is the documented default path:

```ts
import { BuiltInAgent, CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";

const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      model: "openai:gpt-5-mini",
      prompt: "You are a helpful assistant for an Angular app.",
    }),
  },
});
```

`<copilot-chat />` with no `agentId` automatically uses the agent the runtime registers as
`default`. Keep `cors: true` on the listener for local dev.

### Phase 2 — Microsoft Agent Framework .NET agent via `selfManagedAgents`

Supported, and mechanically simple — but there are **two caveats worth planning around**.

```ts
import { HttpAgent } from "@ag-ui/client";

provideCopilotKit({
  selfManagedAgents: { "support-agent": new HttpAgent({ url: "https://…/support" }) },
});
```

Each key becomes the `agentId` that chat components reference. `selfManagedAgents` can
coexist with `runtimeUrl`; both merge into the client registry and `selfManagedAgents` wins
on ID collision — which is a clean way to stage the phase 1 → phase 2 swap live.

Caveats:

1. **The browser talks to your .NET agent directly.** Requests bypass Copilot Runtime, so
   runtime-side auth, middleware, and routing do not apply. Your endpoint must authenticate
   and authorize every request itself, and CORS must allow the Angular origin.
2. **`selfManagedAgents` is part of CopilotKit's Enterprise Intelligence tier and requires
   licensing for production.** For an internal talk demo this is almost certainly fine, but
   it is worth a sentence on the slide rather than a surprise. Worth confirming whether the
   gate is enforced at runtime or is purely a licensing term before building the beat.

The .NET side must speak the **AG-UI protocol** (`@ag-ui/client` `0.0.57` is what 0.3.1
bundles) for `HttpAgent` to work. That protocol compatibility — not the Angular API — is the
real risk in phase 2.

### MCP

MCP servers are configured **entirely on the Node runtime**, via `mcpServers` on the agent:

```ts
new BuiltInAgent({
  model: "openai:gpt-5-mini",
  mcpServers: [{ type: "sse", url: "https://my-mcp-server.example.com/sse" }],
});
```

The Angular frontend has **no MCP server configuration API** — tool availability just flows
down from the backend agent. This is confirmed by grep: `mcp` appears zero times in the
main entry's `index.d.ts`.

The separate `@copilotkit/angular/mcp-apps` entry point is a different, narrower thing: it
renders **interactive MCP App resources** (`ui://` resources) returned by an MCP server,
inside the chat, in a sandboxed iframe. Add `provideMCPApps()` only if you want that
interactive-widget beat. Plain MCP tool calling needs nothing on the Angular side.

Note this pairs awkwardly with phase 2: MCP servers are a *runtime* concept, so if the
agent is self-managed .NET and bypasses the runtime, MCP has to be wired on the .NET side
instead. **Demo the MCP beat during phase 1**, while the Node runtime is still in the path.

## Sources

All primary. Retrieved 2026-08-26.

- `npm view @copilotkit/angular` — versions, dates, dist-tags
- `npm pack @copilotkit/angular@0.3.1` → `dist/index.d.ts`, `dist/mcp-apps/index.d.ts`,
  `package.json`, `README.md` — the authoritative shipped export surface
- <https://docs.copilotkit.ai/angular> — quickstart, stability wording, version prerequisites
- <https://docs.copilotkit.ai/angular/backend/self-managed-agents>
- <https://docs.copilotkit.ai/angular/mcp-servers>
- CopilotKit monorepo `showcase/shell-docs/src/content/`:
  `docs/frontends/angular.mdx`, `docs/frontends/angular/docs-status.mdx`,
  `docs/frontends/angular/guides/frontend-tools-generative-ui.mdx`,
  `reference/angular/production-lifecycle.mdx`, and the
  `reference/angular/{functions,components,services,directives}` and `reference/hooks`
  listings used for the parity diff
