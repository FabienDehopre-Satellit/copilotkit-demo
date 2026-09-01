import { createServer } from 'node:http';

import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { BuiltInAgent, CopilotRuntime, type MCPClientProvider } from '@copilotkit/runtime/v2';
import { createCopilotNodeListener } from '@copilotkit/runtime/v2/node';

// The one .env lives at the repo root and nothing reads it automatically, so both tiers
// load it explicitly. Never `export OPENAI_API_KEY` in a shell: that is the invisible
// prerequisite that kills a demo. A missing file gets a sentence rather than a stack,
// because under `--parallel` a stack scrolls away behind `ng serve`.
try {
  process.loadEnvFile('../.env');
} catch {
  console.error('No .env at the repo root. Copy .env.example to .env and put your key in it.');
  process.exit(1);
}

// The runtime owns the stdio child. The AI SDK client discovers its tools once here, while the
// provider hands the same ToolSet to CopilotKit on every run. Calling directoryClient.tools()
// inside the provider would repeat MCP discovery for every chat turn.
const directoryClient = await createMCPClient({
  transport: new Experimental_StdioMCPTransport({
    command: 'pnpm',
    args: ['--filter', 'mcp', 'exec', 'tsx', 'src/main.ts'],
    cwd: '..',
  }),
});
const directoryTools = await directoryClient.tools();
const directoryProvider: MCPClientProvider = {
  tools: async () => directoryTools,
};

const runtime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({
      // Pinned here and, on phase 2, in agent.cs. The two must match: beat 7 re-runs
      // prompts the room saw twenty minutes earlier, so latency is part of the demo.
      model: 'openai/gpt-5-mini',
      // Deliberately says nothing about the app. Beat 1's trace is slide 4, annotated with
      // what is *missing* from it, so a prompt naming Tasks would give that slide away. The
      // Board arrives as context and the verbs arrive as tool descriptions, both later.
      prompt: [
        'You are a helpful assistant.',
        'Keep replies short and plain: they are read off a projector.',
      ].join('\n'),
      // Every Board tool is a frontend tool registered in Angular, which is what makes
      // phase 2 a config swap rather than a port. Nothing runs in this tier.
      tools: [],
      // The Team directory stays outside the app. Its snake_case tools arrive over stdio and
      // remain visually distinct from Angular's camelCase Board tools in the transcript.
      mcpClients: [directoryProvider],
      // The default is 1, which lets the model emit a tool call and never see the result.
      maxSteps: 5,
    }),
  },
});

const listener = createCopilotNodeListener({
  runtime,
  basePath: '/api/copilotkit',
  // Angular calls this cross-origin on an absolute URL. `app.config.ts` carries why.
  cors: true,
});

createServer(listener).listen(8200, () => {
  console.log('listening on http://localhost:8200/api/copilotkit');
});
