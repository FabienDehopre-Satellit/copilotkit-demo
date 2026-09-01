import { readFileSync } from 'node:fs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/** A person in the Team directory. A Teammate is not an Assignee: nothing links them but the name. */
interface Teammate {
  readonly name: string;
  readonly team: string;
  readonly skills: string;
}

/**
 * The roster, read off disk rather than hardcoded here. "This process owns data your app has never
 * seen" is more literal as a file you can open on a slide than as an array in the server.
 *
 * Read relative to this file, not to the working directory: the runtime spawns this as a child
 * process and its cwd is `runtime/`, not `mcp/`.
 */
const DIRECTORY: readonly Teammate[] = JSON.parse(
  readFileSync(new URL('../directory.json', import.meta.url), 'utf8'),
) as Teammate[];

const server = new McpServer({ name: 'team-directory', version: '0.0.0' });

/**
 * The two tools, both snake_case. That is deliberate and must not be "fixed": when the transcript
 * shows `find_teammates` next to `assignTask` in the same turn, the naming difference is a free
 * visual cue that the two came from two different places.
 *
 * Nothing about the directory is in the agent's system prompt — these descriptions are the whole of
 * how the agent discovers it, which is the mechanism the beat exists to teach.
 */
server.registerTool(
  'find_teammates',
  {
    description:
      'Search the team directory for people whose skills match a word. Use this whenever the user asks who could do something, or mentions the team directory. Returns the matching teammates, each with their team and skills.',
    inputSchema: {
      skill: z
        .string()
        .describe(
          'One skill or area of work, such as "data" or "integration". The match is a plain substring of the skills text, so search one term at a time rather than a phrase.',
        ),
    },
  },
  // Case-insensitive substring match over the free-text skills string, and nothing cleverer.
  // Fuzzy or semantic matching would be non-deterministic on stage; the matching gap is closed in
  // the data instead — "data pipelines, ETL, systems integration" answers both halves of the
  // pinned prompt. An empty list rather than a throw: a thrown error mid-beat is unrecoverable,
  // while an empty list lets the model say "nobody matches" and the talk moves on.
  ({ skill }) => {
    // A blank search is not a match against everyone, which is what a bare `includes('')` would
    // make it. `list_team` is the tool for wanting the whole roster.
    const needle = skill.trim().toLowerCase();
    const matches = needle
      ? DIRECTORY.filter((teammate) => teammate.skills.toLowerCase().includes(needle))
      : [];
    return json(matches);
  },
);

/**
 * Everyone. The pinned prompt never needs it. It earns its place twice over: the agent visibly
 * *chose* between two tools, and it is a cheap ad-lib ("who's in the directory?") for showing the
 * source data before the real prompt, which matters when Ines is the punchline.
 */
server.registerTool(
  'list_team',
  {
    description:
      'List everyone in the team directory, with their team and skills. Use this when the user asks who is in the team or wants the whole directory.',
    inputSchema: {},
  },
  () => json(DIRECTORY),
);

/** Every result is the same shape: JSON in a text block, which is what the panel renders raw. */
function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

await server.connect(new StdioServerTransport());

// The runtime spawns this and never explicitly stops it. `tsx watch` restarting the runtime closes
// our stdin, and without this the orphan would sit there holding the file open for the rest of the
// day. Exiting on close means one directory server per runtime, always.
process.stdin.on('close', () => process.exit(0));
