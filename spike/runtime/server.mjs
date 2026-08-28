// PROTOTYPE — throwaway. Node CopilotRuntime + BuiltInAgent, pointed at the
// fake model, with the team-directory MCP server attached over stdio.
import { CopilotRuntime, BuiltInAgent } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import http from "node:http";

process.env.OPENAI_BASE_URL = "http://localhost:9100/v1";
process.env.OPENAI_API_KEY = "fake";

const mcp = await createMCPClient({
  transport: new StdioMCPTransport({ command: "node", args: [new URL("../mcp/server.mjs", import.meta.url).pathname] }),
});

const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      model: "openai/fake-model",
      prompt: "You manage a task board.",
      mcpClients: [mcp],
      maxSteps: 5,
    }),
  },
});

const listener = createCopilotNodeListener({ runtime, basePath: "/api/copilotkit", cors: true });
http.createServer(listener).listen(8200, () => console.log("[runtime] http://localhost:8200/api/copilotkit"));
