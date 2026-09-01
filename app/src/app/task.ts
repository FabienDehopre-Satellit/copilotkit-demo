/** Rendering order, left to right. Also the source of the tools' `status` enum. */
export const STATUSES = ['todo', 'doing', 'done'] as const;

/** Which of the three stages a Task is at. The board renders one column per status. */
export type Status = (typeof STATUSES)[number];

/** The only entity on the board. No Column, no Label, no due date, no priority. */
export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: Status;
  /** A first name, or null when nobody owns it yet. Never the string 'unassigned'. */
  readonly assignee: string | null;
}

/** One group per status, in rendering order. A status holding no Tasks still gets a group. */
export function groupByStatus(
  tasks: readonly Task[],
): readonly { status: Status; tasks: readonly Task[] }[] {
  return STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }));
}
