// PROTOTYPE — throwaway. Minimal stdio MCP server standing in for the
// team directory (#8), so beat 6's first tool call is a real server-side call.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const directory = [
  { name: "Ines", team: "Data Platform", skills: "data pipelines, integration" },
  { name: "Chloé", team: "Frontend", skills: "angular, design systems" },
];

const server = new Server({ name: "team-directory", version: "0.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "find_teammates",
      description: "Find teammates in the team directory by skill.",
      inputSchema: { type: "object", properties: { skill: { type: "string" } }, required: ["skill"] },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const skill = String(req.params.arguments?.skill ?? "").toLowerCase();
  const hits = directory.filter((t) => t.skills.toLowerCase().includes(skill));
  console.error(`[mcp] find_teammates(${skill}) -> ${hits.map((h) => h.name).join(", ") || "none"}`);
  return { content: [{ type: "text", text: JSON.stringify(hits) }] };
});

await server.connect(new StdioServerTransport());
