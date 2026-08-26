# CopilotRuntime on plain Node, the built-in agent, and MCP transports

Research for [issue #4](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/4).

Verified against `@copilotkit/runtime@1.69.2`, `@copilotkit/angular@0.3.1`, and the
`@ai-sdk/mcp` copy the runtime bundles (`1.0.74`). Claims below cite either the
published docs, the shipped type declarations, or a smoke test that was actually run.

## Headline answer on MCP

**Local stdio MCP servers are viable.** The planned "team directory" stdio server
can be built. But not through the option you would reach for first.

There are two separate MCP attachment points on `BuiltInAgent`, and only one of
them supports stdio:

| Option | Transports | Who owns the connection |
| --- | --- | --- |
| `mcpServers` | `http` and `sse` only | The runtime (opens and closes per run) |
| `mcpClients` | anything, stdio included | You |

`mcpServers` is remote-only. `mcpClients` takes a client you construct yourself,
so you pick the transport, and `Experimental_StdioMCPTransport` from
`@ai-sdk/mcp/mcp-stdio` spawns a local child process over stdio.

### Why `mcpServers` cannot do stdio

The shipped type union has exactly two members and no stdio variant
(`node_modules/@copilotkit/runtime/dist/agent/index.d.mts`):

```ts
interface MCPClientConfigHTTP {
  type: "http";
  url: string;
  options?: StreamableHTTPClientTransportOptions;
}
interface MCPClientConfigSSE {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
}
type MCPClientConfig = MCPClientConfigHTTP | MCPClientConfigSSE;
```

The runtime's own transport construction confirms it, from
`dist/agent/index.mjs`:

```js
let transport;
if (serverConfig.type === "http")
  transport = new StreamableHTTPClientTransport(new URL(serverConfig.url), serverConfig.options);
else if (serverConfig.type === "sse") {
  const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
  transport = new SSEClientTransport(new URL(serverConfig.url), serverConfig.headers);
}
if (transport) { /* ... createMCPClient({ transport }) ... */ }
```

Note the failure mode: an unrecognised `type` leaves `transport` undefined and
the server is skipped with no error. A hand-written `{ type: "stdio" }` would be
a TypeScript error, and if forced through with a cast it would fail silently
rather than throw.

Both `url` fields are typed `string` and passed to `new URL(...)`, so a local
HTTP MCP server on `http://localhost:PORT/mcp` is fine. "Remote-only" means
"URL-addressable", not "must be on the public internet".

The docs state the same limit in prose: "The Built-in Agent supports connecting
to MCP servers via **HTTP** or **SSE** transports."
([mcp-servers.mdx](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/integrations/built-in-agent/mcp-servers.mdx))

### Why `mcpClients` can

`MCPClientProvider` is a structural interface with a single method:

```ts
interface MCPClientProvider {
  /** Return tools to be merged into the agent's tool set. */
  tools(): Promise<ToolSet>;
}
```

The runtime never inspects the transport. It calls `.tools()` and merges the
result. From `dist/agent/index.mjs`:

```js
for (const client of config.mcpClients) {
  const mcpTools = await client.tools();
  streamTextParams.tools = { ...streamTextParams.tools, ...mcpTools };
}
const allMcpServers = [...config.mcpServers ?? []];
// ...mcpServers merged after, so mcpServers wins on name collision
```

The docs describe the ownership split: "Unlike `mcpServers`, the agent **never**
creates or closes these clients — you control the full lifecycle."

Because the interface is structural rather than nominal, it does not matter that
your `@ai-sdk/mcp` may resolve to a different copy than the runtime's nested
`1.0.74`. There is no `instanceof` check. Both `1.x` and `2.x` export
`./mcp-stdio`.

### Smoke test

Run against a real stdio MCP server, not inferred from types:

```js
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { BuiltInAgent } from "@copilotkit/runtime/v2";

const transport = new Experimental_StdioMCPTransport({
  command: "node",
  args: ["team-mcp.mjs"],
});
const client = await createMCPClient({ transport });
const tools = await client.tools();

const agent = new BuiltInAgent({
  model: "openai/gpt-4o-mini",
  mcpClients: [client],
  maxSteps: 2,
});
```

Output:

```
STDIO TOOLS DISCOVERED: [ 'lookupTeammate' ]
BuiltInAgent accepted mcpClients: true
TOOL RESULT: {"content":[{"type":"text","text":"Ada works in Engineering"}],"isError":false}
```

The server was a stock `McpServer` + `StdioServerTransport` from
`@modelcontextprotocol/sdk`. Tool discovery and execution both worked over stdio.

`StdioConfig` (from `@ai-sdk/mcp/mcp-stdio`):

```ts
interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stderr?: IOType | Stream | number;
  cwd?: string;
}
```

### Consequences for the demo beat

Build the team directory as a normal stdio MCP server and attach it via
`mcpClients`. Create the client once at server startup rather than per request,
since `mcpClients` is explicitly the persistent-connection path and each
`Experimental_StdioMCPTransport` spawns a child process.

The docs' caching pattern applies directly. `.tools()` is called on every agent
run, so wrap it:

```ts
let cachedTools = null;
const warmup = client.tools().then(t => { cachedTools = t; });
const provider = {
  async tools() {
    if (cachedTools) return cachedTools;
    await warmup;
    return cachedTools;
  },
};
new BuiltInAgent({ model: "openai/gpt-5-mini", mcpClients: [provider] });
```

A `provider` object satisfying `MCPClientProvider` is accepted in place of the
client itself, which is how you insert the cache.

The fallback, if stdio ever becomes awkward, is to wrap the same MCP server in a
Streamable HTTP transport on localhost and use `mcpServers`. Nothing about the
tool definitions changes.

## Minimal plain-Node runtime

Use the `v2` entrypoints. `@copilotkit/runtime/v2` for the runtime and agent,
`@copilotkit/runtime/v2/node` for the Node bridge. This is a different API from
the v1 `copilotRuntimeNodeHttpEndpoint` + `serviceAdapter` pairing that older
self-hosting docs describe; v1 has no `BuiltInAgent`.

From the [Angular guide](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/frontends/angular.mdx),
which is the closest first-party match to this project:

```ts
// server.ts
import { createServer } from "node:http";
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

const port = Number(process.env["PORT"] ?? 8200);

createServer(
  createCopilotNodeListener({
    runtime,
    basePath: "/api/copilotkit",
    cors: true,
  }),
).listen(port);
```

Run it with `npx tsx server.ts`. Dev dependencies are `tsx`, `typescript`, `@types/node`.

Three Node integration shapes exist
([runtime-server-adapter.mdx](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/runtime-server-adapter.mdx)):

- `createCopilotNodeListener({ runtime, basePath, cors })` returns a
  `(req, res)` listener you pass straight to `createServer`. Simplest.
- The same with `mode: "single-route"`.
- `createCopilotRuntimeHandler(...)` to build a Fetch handler, then
  `createCopilotNodeHandler(...)` to wrap it, when you are routing manually
  inside an existing server.

The docs mark `createCopilotExpressHandler` and `createCopilotHonoHandler` as
things to avoid in new projects; `createCopilotRuntimeHandler` is the
recommended primitive.

The agent registered under the key `default` is the one `CopilotChat` uses
without further configuration.

### Reaching it from Angular in dev

Point the provider at the absolute URL:

```ts
provideCopilotKit({ runtimeUrl: "http://localhost:8200/api/copilotkit" })
```

Cross-origin from `localhost:4200` to `localhost:8200`, handled by `cors: true`
on the listener. No Angular dev-server proxy is required. The docs' own
troubleshooting says to "keep `cors: true` in `createCopilotNodeListener` for
local development, or configure CORS to allow your Angular app's origin in
production."

`cors` also accepts a config object rather than `true`
(`dist/v2/runtime/core/fetch-cors.d.mts`):

```ts
interface CopilotCorsConfig {
  origin?: string | string[] | ((origin: string) => string | null);
  credentials?: boolean;
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  maxAge?: number;
}
```

A proxy would work too and would sidestep CORS entirely, but it is not what the
first-party guide does.

Health check: `http://localhost:8200/api/copilotkit/info` should report the
`default` agent.

## Built-in agent configuration

`BuiltInAgentConfiguration`, from the shipped declarations. Model plus prompt is
the whole minimum; everything else is optional.

### Model and OpenAI direct

The `model` string is `provider/model` or `provider:model`. Both work, because
`resolveModel` normalises with `spec.replace("/", ":").trim().split(":")`. The
docs are inconsistent on which they use; it does not matter.

For OpenAI the runtime calls `createOpenAI` from `@ai-sdk/openai` directly:

```js
case "openai": return createOpenAI({
  apiKey: apiKey || process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL
})(model);
```

So it is a direct OpenAI API call, no gateway. `OPENAI_BASE_URL` is available if
you ever need to point at a compatible endpoint.

Providers recognised: `openai`, `anthropic`, `google` (aliases `gemini`,
`google-gemini`), `minimax`, `vertex`. Anything else throws
`Unknown provider "..."`.

`model` also accepts an AI SDK `LanguageModel` instance instead of a string
(`type ModelSpecifier = string | LanguageModel`), which is the escape hatch for
custom provider configuration.

### API key

Two options, in this precedence:

1. The `apiKey` config field on `BuiltInAgent`.
2. Environment, per provider. For OpenAI that is `OPENAI_API_KEY`. The
   declaration lists `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `MINIMAX_API_KEY`
   for the others.

Environment is the better default here. The key stays in the process running
the runtime and never reaches the browser, which is the stated point of putting
a runtime in front of the model.

### System prompt

The field is `prompt`, not `instructions` or `systemPrompt`. Typed
`prompt?: string`.

There is a separate flag controlling whether system-role messages arriving from
the client are forwarded to the LLM.

### The `maxSteps` trap

`maxSteps` **defaults to 1**, and one step means the model can emit a tool call
but never gets a turn to use the result. The server-tools doc flags this
inline: `maxSteps: 2 //Important for tool calls`.

Any demo involving tools, MCP included, needs `maxSteps` raised. Set it to
something like 5 if tools may chain.

### Other options

`toolChoice`, `maxOutputTokens`, `temperature`, `topP`, `topK`,
`presencePenalty`, `frequencyPenalty`, `stopSequences`, `seed`, `maxRetries`,
plus `overridableProperties` for allowing specific fields to be overridden by
`forwardedProps` from the client.

Supported model ids are a union with a `(string & {})` escape, so autocomplete
suggests `openai/gpt-5`, `openai/gpt-5-mini`, `openai/gpt-4.1`, `openai/gpt-4o`,
`openai/gpt-4o-mini`, `openai/o3`, `openai/o4-mini`, the Anthropic and Gemini
families, and MiniMax, without rejecting anything else.

## Server tools vs frontend tools

Two distinct declarations, executing in two different places. They are not
alternatives; a single agent can have both.

### Server tools

Declared with `defineTool` and handed to the agent's `tools` array. The
`execute` body runs in the Node process.

```ts
import { BuiltInAgent, defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";

const getWeather = defineTool({
  name: "getWeather",
  description: "Get the current weather for a location",
  parameters: z.object({ location: z.string().describe("The location's name") }),
  execute: async ({ location }) => ({ temperature: 72, condition: "sunny", location }),
});

const builtInAgent = new BuiltInAgent({
  model: "openai:gpt-5.4-mini",
  tools: [getWeather],
  maxSteps: 2,
});
```

Use for anything needing secrets, a database, or backend network access. Returns
any JSON-serialisable value. Zod schemas can nest objects, arrays, enums,
optionals, defaults.

Server tools and MCP tools coexist. The docs are explicit: "MCP servers work
alongside `defineTool` server tools — the agent sees all tools from both
sources."

### Frontend tools

Declared in the client and executed in the browser. React uses the
`useFrontendTool` hook; **Angular uses `registerFrontendTool`**, a function, not
a hook (from `@copilotkit/angular`):

```ts
interface FrontendToolConfig<Args> {
  name: string;
  description: string;
  parameters: StandardSchemaV1<unknown, Args>;
  component?: Type<ToolRenderer<Args>>;
  handler: (args: Args, context: FrontendToolHandlerContext) => Promise<unknown>;
  followUp?: boolean;
  agentId?: string;
}
```

Use for DOM and browser work: reading or writing component state, `localStorage`,
triggering UI updates, driving a third-party frontend library, or anything
needing the user's immediate browser context.

Note that Angular takes a `component: Type<ToolRenderer>` where React takes a
`render` function. The React snippets in the docs do not transfer verbatim.

Angular also has `registerHumanInTheLoop` for tools that need user confirmation,
whose renderer receives a `respond` callback.

## Rendering MCP tool calls

Yes. MCP tools arrive as ordinary tool calls and go through the same renderer
resolution as everything else, so they can be rendered.

The mechanism is a catch-all renderer registered under the name `"*"`. In React
that is `useFrontendTool({ name: "*", render })` with
`CatchAllActionRenderProps`
([mcp.mdx](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/agentic-protocols/mcp.mdx),
"Use the useFrontendTool hook to render custom UI components for MCP tool
executions").

Angular's equivalent is `registerRenderToolCall`:

```ts
interface RenderToolCallConfig<Args> {
  name: string;
  args: StandardSchemaV1<unknown, Args>;
  component: Type<ToolRenderer<Args>>;
  agentId?: string;
  passAgent?: boolean;
}
```

Pass `name: "*"` for the catch-all. The wildcard path is real in the Angular
bundle, not just React. From `copilotkit-angular.mjs`:

```js
/** Resolve the documented application/frontend/wildcard/fallback precedence. */
function pickToolCallHandler(options) {
  const application = namedForAgent(options.application.filter(e => e.name !== "*"), options.name, options.agentId);
  if (application) return { type: "renderer", config: application };
  // ... frontend tool, then human-in-the-loop ...
  const wildcard = namedForAgent(options.application.filter(e => e.name === "*"), "*", options.agentId);
  if (wildcard) return { type: "renderer", config: wildcard };
  if (options.builtInFallback) { /* ... */ }
}
```

Precedence, most specific first:

1. Named application renderer from `registerRenderToolCall`
2. Named frontend tool with a `component`
3. Human-in-the-loop tool
4. Wildcard `"*"` renderer
5. Built-in fallback rendering

The wildcard sits below every named registration, so a catch-all MCP renderer
does not shadow purpose-built renderers. `AngularToolCall` carries an optional
`name`, which is how a wildcard renderer knows which tool it is drawing.

Practical approach for the demo: register a wildcard renderer as the generic MCP
tool-call card, then add named renderers for the specific team-directory tools
that deserve richer treatment.

## Runtime-level MCP, and MCP Apps

Separate from per-agent config, `CopilotRuntime` takes an `mcpApps` middleware
config that attaches MCP servers at runtime level with optional per-agent
scoping:

```ts
type McpAppsServerConfig = MCPClientConfig & {
  /** Agent to bind this server to. If omitted, the server is available to all agents. */
  agentId?: string;
};
interface McpAppsConfig { servers: McpAppsServerConfig[]; }
```

It reuses the same `MCPClientConfig`, so it inherits the same http/sse-only
limit. **No stdio here either.** It is not a way around the restriction.

`@copilotkit/angular` also ships an `mcp-apps` subpath for rendering MCP Apps
(MCP-UI) `ui://` resources, distinct from plain tool-call rendering. Out of
scope for this ticket but worth knowing it exists if the demo wants
server-provided UI.

## Open items

- Which model id to settle on. `openai/gpt-5-mini` appears in the Angular guide;
  the docs elsewhere use `openai:gpt-5.4-mini`, which is not in the typed union
  but is accepted by the `(string & {})` escape.
- Whether the stdio child process needs an explicit shutdown hook on server
  exit. `client.close()` exists; process-exit behaviour was not tested.
- Angular's `component`-based renderer API is thinly documented compared to
  React's `render`. Expect to read types rather than guides when building the
  MCP tool-call card.

## Sources

- [Built-in Agent: MCP Servers](https://docs.copilotkit.ai/integrations/built-in-agent/mcp-servers) ([source](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/integrations/built-in-agent/mcp-servers.mdx))
- [Built-in Agent: Server Tools](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/integrations/built-in-agent/server-tools.mdx)
- [Built-in Agent: Frontend Tools](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/integrations/built-in-agent/frontend-tools.mdx)
- [Frontends: Angular](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/frontends/angular.mdx)
- [Runtime server adapter](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/runtime-server-adapter.mdx)
- [Agentic protocols: MCP](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/agentic-protocols/mcp.mdx)
- Shipped declarations in `@copilotkit/runtime@1.69.2`: `dist/agent/index.d.mts`, `dist/agent/index.mjs`, `dist/v2/runtime/core/runtime.d.mts`, `dist/v2/runtime/core/fetch-cors.d.mts`, `dist/v2/node.d.mts`
- Shipped declarations in `@copilotkit/angular@0.3.1`: `dist/index.d.ts`, `dist/fesm2022/copilotkit-angular.mjs`
- `@ai-sdk/mcp` `dist/mcp-stdio/index.d.ts`
- Local smoke test of stdio MCP against `BuiltInAgent`, run 2026-08-26
