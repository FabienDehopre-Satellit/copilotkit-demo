import { fileURLToPath } from 'node:url';

import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import type { MCPClientProvider } from '@copilotkit/runtime/v2';

/**
 * What `MCPClientProvider.tools()` resolves with, without pulling `ai` in for the one name.
 *
 * This is also why `runtime/package.json` depends on `zod` while nothing here imports it. Left out,
 * pnpm resolves the peer itself, picks zod 4, and hands us a *second* copy of `@ai-sdk/mcp` — whose
 * tools are then not assignable to the `ToolSet` of the `ai` copy `@copilotkit/runtime` is built
 * against, and `tsc` fails on this line. Pinning zod to the catalog collapses the two back into one.
 */
type Tools = Awaited<ReturnType<MCPClientProvider['tools']>>;

/**
 * The Team directory, reached over MCP.
 *
 * `mcpClients`, not `mcpServers`, and that is the whole reason this file exists.
 * `mcpServers` builds the transport itself and its two branches are `http` and `sse`: an
 * unrecognised type leaves the transport undefined and the server is *silently skipped*, with no
 * error. `mcpClients` takes anything that can answer `tools()`, so stdio is ours to own — and with
 * it the process, the lifetime, and the caching.
 *
 * Caching is not an optimisation. `tools()` is called on every agent run, and without it every
 * turn would spawn another copy of the directory server.
 */
class TeamDirectory implements MCPClientProvider {
  #tools: Promise<Tools> | undefined;

  tools(): Promise<Tools> {
    this.#tools ??= this.#connect();
    return this.#tools;
  }

  async #connect(): Promise<Tools> {
    try {
      const client = await createMCPClient({
        // Spawned as a child process at startup rather than started by hand: a manual process is
        // one more thing to forget at 09:00. `tsx` off the source, no build step. The path is
        // resolved from this file rather than from the working directory, so it survives being
        // started from somewhere other than `runtime/`; `tsx` itself still comes off the PATH that
        // pnpm sets up, which is why `pnpm dev` is the documented way to start this.
        transport: new Experimental_StdioMCPTransport({
          command: 'tsx',
          args: [fileURLToPath(new URL('../../mcp/src/main.ts', import.meta.url))],
        }),
      });
      return await client.tools();
    } catch (error) {
      // Degrade to no directory rather than take the turn down with us. Beat 6 is lost either way
      // if the server will not start; everything else in the running order should still play. The
      // cache is dropped so the next turn tries again, which is the only recovery available on
      // stage short of a restart.
      this.#tools = undefined;
      console.error('The team directory did not start. Beat 6 will not play:', error);
      return {};
    }
  }
}

/**
 * One instance, held for the life of the process. On `phase-2` the Node tier goes and this goes
 * with it: `mcp/` stays on the branch, unwired, because MCP moves rather than disappears.
 */
export const teamDirectory = new TeamDirectory();
