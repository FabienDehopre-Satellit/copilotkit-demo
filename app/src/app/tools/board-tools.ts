import { inject } from '@angular/core';
import { registerFrontendTool, registerHumanInTheLoop } from '@copilotkit/angular';
import { z } from 'zod';

import { BoardStore } from '../core/board-store';
import { STATUSES, type Status } from '../models/task';
import { CreatedTask } from '../tool-renderers/created-task';
import { DeleteConfirm } from '../tool-renderers/delete-confirm';
import { MiniBoard } from '../tool-renderers/mini-board';
import { ToolOutcome } from '../tool-renderers/tool-outcome';

/**
 * Every tool addresses a Task by id, and every description that takes one ends with this.
 *
 * The first sentence is where title-to-id resolution is asked for: the Board arrives as context,
 * the model turns "the profile page" into `T-4` itself, and human-readable ids mean a wrong
 * resolution is visible from the back of the room rather than silently mis-targeting.
 *
 * The second sentence is beat 4. "Bruno's task" matches two Tasks, and the beat succeeds when the
 * agent declines to act and asks which — a model behaviour, drilled here in prose, with nothing
 * in the code able to enforce it.
 */
const BY_ID = [
  'Identify the Task by its id, resolving what the user said against the board in your context.',
  'If more than one Task could be meant, ask which one instead of guessing.',
].join(' ');

const ID = z.string().describe('The id of an existing Task, such as T-4.');

/**
 * The `assignee` parameter's description, shared by `createTask` and `assignTask`. An absent
 * assignee is how "nobody has it yet" crosses the wire.
 *
 * `null` would be the honest encoding and it does not survive the trip: the runtime converts every
 * incoming tool schema back into Zod through a converter that handles object, string, number,
 * boolean and array and nothing else, so `{ "type": ["string", "null"] }` throws `Invalid JSON
 * schema` before the model is ever called and the turn dies with an empty reply. §13 has the
 * detail. An optional string says the same thing in a shape the converter accepts, and the
 * handlers still take a literal `null` if a model sends one.
 */
const ASSIGNEE = 'A first name. Leave it out entirely to leave the Task with nobody on it.';

/**
 * The arguments of the two tools that render through `ToolOutcome`, written out rather than
 * inferred from their schemas.
 *
 * `ToolOutcome` ignores its arguments and so is generic over them, and a generic component is a
 * weak inference site: left to itself the compiler takes the class's default `Record<string,
 * unknown>` as the tool's argument type and the handler's parameters go `unknown`. Naming the type
 * at the call fixes the tool's end and lets the component follow it.
 */
type MoveTaskArgs = { id: string; status: Status };
type AssignTaskArgs = { id: string; assignee?: string };

/**
 * The five tools: the four mutating ones, which are the only things that write to the board, and
 * `showBoard`, which writes nothing and only renders.
 *
 * All five are registered here, in Angular, and the Node runtime's `tools[]` stays empty — which
 * is what makes phase 2 a config swap rather than a port. Call this from an injection context.
 */
export function registerBoardTools(): void {
  const board = inject(BoardStore);

  registerFrontendTool({
    name: 'createTask',
    description: 'Add a new Task to the board. It is given the next id in sequence.',
    parameters: z.object({
      title: z.string().describe('Five words or fewer: it gets read off a projector.'),
      description: z.string().optional().describe('One line on what the Task is.'),
      status: z.enum(STATUSES).optional().describe('Defaults to todo.'),
      assignee: z.string().optional().describe(ASSIGNEE),
    }),
    handler: async (draft) => board.createTask(draft),
    // Angular's `component:` is where React has `render`. Unconditional: see `CreatedTask`.
    component: CreatedTask,
  });

  registerFrontendTool<MoveTaskArgs>({
    name: 'moveTask',
    description: `Move a Task to a different status. ${BY_ID}`,
    parameters: z.object({
      id: ID,
      status: z.enum(STATUSES).describe('The status to move it to.'),
    }),
    handler: async ({ id, status }) => board.moveTask(id, status),
    // A `component` is also how a tool opts out of the wildcard, which matches on its absence.
    // `ToolOutcome` explains what that would cost the beat it belongs to.
    component: ToolOutcome,
  });

  registerFrontendTool<AssignTaskArgs>({
    name: 'assignTask',
    // No fifth verb for unassigning: leaving the assignee out is what does it.
    description: `Set who a Task belongs to, or leave it with nobody on it. ${BY_ID}`,
    parameters: z.object({
      id: ID,
      assignee: z.string().optional().describe(ASSIGNEE),
    }),
    handler: async ({ id, assignee }) => board.assignTask(id, assignee),
    component: ToolOutcome,
  });

  // The one destructive verb, and the only tool that confirms. `registerHumanInTheLoop` is
  // Angular's `renderAndWaitForResponse`: it takes no handler, parks the run on a promise, and
  // lets the component answer. `DeleteConfirm` does the deletion on the click.
  registerHumanInTheLoop({
    name: 'deleteTask',
    // "The user is asked to confirm" on its own gets the model asking in prose and never calling
    // the tool, which loses the dialog and the beat with it. Saying who does the asking fixes it.
    description: `Remove a Task from the board for good. Call this as soon as the user asks: the app puts the confirm dialog in front of them and tells you whether they went through with it, so never ask for confirmation yourself. ${BY_ID}`,
    parameters: z.object({ id: ID }),
    component: DeleteConfirm,
  });

  // The rendering tool, and the only one of the five that changes nothing. It is registered as an
  // ordinary frontend tool because a tool that renders is an ordinary tool — the whole point of
  // beat 5 is that returning UI is not a separate mechanism.
  registerFrontendTool({
    name: 'showBoard',
    // The last sentence is steering, and it belongs here rather than in the result: the board is
    // on screen a beat before the reply arrives (§13), so re-listing the Tasks in prose reads as
    // the agent describing something the room can already see.
    description:
      'Show the user the whole board. Call this whenever they ask to see it: it renders the three columns in the chat and changes nothing. The Tasks are then in front of them, so reply with one short sentence saying the board is on screen, and never list the Tasks yourself.',
    parameters: z.object({}),
    handler: async () => 'The board is on screen in the chat.',
    component: MiniBoard,
  });
}
