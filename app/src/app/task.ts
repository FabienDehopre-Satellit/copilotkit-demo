/** Which of the three stages a Task is at. The board renders one column per status. */
export type Status = 'todo' | 'doing' | 'done';

/** Rendering order, left to right. */
export const STATUSES: readonly Status[] = ['todo', 'doing', 'done'];

/** The only entity on the board. No Column, no Label, no due date, no priority. */
export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: Status;
  /** A first name, or null when nobody owns it yet. Never the string 'unassigned'. */
  readonly assignee: string | null;
}
