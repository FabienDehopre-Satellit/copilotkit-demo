import { inject } from '@angular/core';
import { registerFrontendTool, registerHumanInTheLoop } from '@copilotkit/angular';
import { z } from 'zod';

import { BoardStore } from './board-store';
import { DeleteConfirm } from './delete-confirm';
import { STATUSES } from './task';

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
 * An absent `assignee` is how "nobody owns it" crosses the wire.
 *
 * `null` would be the honest encoding and it does not survive the trip: the runtime converts every
 * incoming tool schema back into Zod through a converter that handles object, string, number,
 * boolean and array and nothing else, so `{ "type": ["string", "null"] }` throws `Invalid JSON
 * schema` before the model is ever called and the turn dies with an empty reply. §13 has the
 * detail. An optional string says the same thing in a shape the converter accepts, and the
 * handlers still take a literal `null` if a model sends one.
 */
const UNASSIGN = 'A first name. Leave it out entirely to leave the Task with nobody on it.';

/**
 * The four mutating tools. Nothing else writes to the board.
 *
 * All four are registered here, in Angular, and the Node runtime's `tools[]` stays empty — which
 * is what makes phase 2 a config swap rather than a port. Call this from an injection context.
 */
export function registerBoardTools(): void {
  const board = inject(BoardStore);

  registerFrontendTool({
    name: 'createTask',
    description: 'Add a new Task to the board. It is given the next free id.',
    parameters: z.object({
      title: z.string().describe('Five words or fewer: it gets read off a projector.'),
      description: z.string().optional().describe('One line on what the Task is.'),
      status: z.enum(STATUSES).optional().describe('Defaults to todo.'),
      assignee: z.string().optional().describe(UNASSIGN),
    }),
    handler: async ({ title, description, status, assignee }) =>
      board.createTask(title, description, status, assignee),
  });

  registerFrontendTool({
    name: 'moveTask',
    description: `Move a Task to a different status. ${BY_ID}`,
    parameters: z.object({
      id: ID,
      status: z.enum(STATUSES).describe('The status to move it to.'),
    }),
    handler: async ({ id, status }) => board.moveTask(id, status),
  });

  registerFrontendTool({
    name: 'assignTask',
    // No fifth verb for unassigning: leaving the assignee out is what does it.
    description: `Set who a Task belongs to, or leave it with nobody on it. ${BY_ID}`,
    parameters: z.object({
      id: ID,
      assignee: z.string().optional().describe(UNASSIGN),
    }),
    handler: async ({ id, assignee }) => board.assignTask(id, assignee),
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
}
