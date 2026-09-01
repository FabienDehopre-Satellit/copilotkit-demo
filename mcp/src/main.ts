import { readFile } from 'node:fs/promises';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

interface Teammate {
  name: string;
  team: string;
  skills: string;
}

// A file makes the process boundary visible: this data never enters the Angular app.
const directory = JSON.parse(
  await readFile(new URL('../directory.json', import.meta.url), 'utf8'),
) as Teammate[];

const server = new McpServer({ name: 'team-directory', version: '1.0.0' });

server.registerTool(
  'find_teammates',
  {
    description:
      'Find Teammates in the Team directory by a case-insensitive word or phrase from their skills.',
    inputSchema: {
      skill: z.string().describe("A word or phrase to find in the Teammates' skills."),
    },
  },
  ({ skill }) => {
    const needle = skill.toLowerCase();
    const matches = directory.filter((teammate) =>
      teammate.skills.toLowerCase().includes(needle),
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(matches) }],
    };
  },
);

server.registerTool(
  'list_team',
  {
    description: 'List every Teammate in the Team directory with their team and skills.',
  },
  () => ({
    content: [{ type: 'text', text: JSON.stringify(directory) }],
  }),
);

await server.connect(new StdioServerTransport());
