import { Injectable, signal } from '@angular/core';

import { SEED_TASKS } from './seed';
import { STATUSES, type Status, type Task } from './task';

/**
 * What `createTask` is given: a Task with no id yet, since the Board issues that. Every field but
 * the title is optional, and §4's defaults fill the rest in.
 *
 * `status` is a plain `string` rather than a `Status`, and that is deliberate everywhere it
 * appears below: these values come off the wire as raw parsed JSON, so the type the model *should*
 * have sent is not the type that arrived. The guards are what make it one.
 */
export interface TaskDraft {
  readonly title: string;
  readonly description?: string;
  readonly status?: string;
  readonly assignee?: string | null;
}

/**
 * The Board, and the only thing that writes to it.
 *
 * It is a root service rather than a field on `App` because the delete confirm is rendered by
 * CopilotKit inside the chat transcript, several components away from anything the app lays out
 * itself, and it has to be able to perform the deletion it is confirming.
 *
 * The four methods below are the four mutating tools, named after them. Each returns the short
 * string the tool hands back to the model, so the wording of a result lives next to the write it
 * describes and the delete confirm can reuse it verbatim.
 */
@Injectable({ providedIn: 'root' })
export class BoardStore {
  /** In memory only, no localStorage and no JSON file, so a reload is already a full reset. */
  readonly #tasks = signal<readonly Task[]>(SEED_TASKS);

  /** Monotonically increasing; never decreases on delete, so ids are never reused mid-talk. */
  #highestIssuedId = Math.max(
    0,
    ...SEED_TASKS.map((t) => Number.parseInt(t.id.slice('T-'.length), 10)).filter(Number.isInteger),
  );

  /** All Tasks, taken together. Read by the Board component and by the one context entry. */
  readonly tasks = this.#tasks.asReadonly();

  findTask(id: string): Task | undefined {
    return this.#tasks().find((task) => task.id === id);
  }

  /** Half of Reset. The other half is a fresh thread id, and `App` owns that. */
  reset(): void {
    this.#tasks.set(SEED_TASKS);
    this.#highestIssuedId = Math.max(
      0,
      ...SEED_TASKS.map((t) => Number.parseInt(t.id.slice('T-'.length), 10)).filter(
        Number.isInteger,
      ),
    );
  }

  createTask(draft: TaskDraft): string {
    const { title, description, status, assignee } = draft;
    if (status !== undefined && !isStatus(status)) {
      return unknownStatus(status);
    }

    // Arguments arrive as raw parsed JSON — nothing validates them against the schema before the
    // handler runs — so the defaults of §4 are applied here rather than declared in the schema.
    const task: Task = {
      id: this.#nextId(),
      title,
      description: description ?? '',
      status: status ?? 'todo',
      assignee: assignee ?? null,
    };
    this.#tasks.update((tasks) => [...tasks, task]);

    return `Created ${task.id} "${task.title}" in ${task.status}, ${describeAssignee(task)}.`;
  }

  moveTask(id: string, status: string): string {
    const task = this.findTask(id);
    if (!task) {
      return this.#unknownId(id);
    }
    if (!isStatus(status)) {
      return unknownStatus(status);
    }

    this.#replace(id, { ...task, status });

    return `Moved ${task.id} "${task.title}" to ${status}.`;
  }

  assignTask(id: string, assignee: string | null | undefined): string {
    const task = this.findTask(id);
    if (!task) {
      return this.#unknownId(id);
    }

    // Leaving the assignee out unassigns, which is why there is no fifth verb for it. A literal
    // null means the same thing, for a model that sends one — see `ASSIGNEE` in board-tools.ts.
    const next = { ...task, assignee: assignee ?? null };
    this.#replace(id, next);

    return `${task.id} "${task.title}" is now ${describeAssignee(next)}.`;
  }

  deleteTask(id: string): string {
    const task = this.findTask(id);
    if (!task) {
      return this.#unknownId(id);
    }

    this.#tasks.update((tasks) => tasks.filter((candidate) => candidate.id !== id));

    return `Deleted ${task.id} "${task.title}".`;
  }

  /**
   * Readable enough for the model to correct itself from, which is the whole reason ids are
   * `T-1` rather than a uuid: a wrong resolution is visible from the back of the room.
   */
  #unknownId(id: string): string {
    const ids = this.#tasks().map((task) => task.id);
    return `No Task has id "${id}". The board holds ${ids.join(', ')}.`;
  }

  /**
   * One past the highest id ever issued, not the lowest unused one: after beat 3 deletes T-7, the
   * next Task is still T-9, which is what §10's board-state table expects. Reusing a deleted id
   * would also put a familiar number on an unfamiliar Task, mid-talk.
   */
  #nextId(): string {
    this.#highestIssuedId += 1;
    return `T-${this.#highestIssuedId}`;
  }

  #replace(id: string, task: Task): void {
    this.#tasks.update((tasks) =>
      tasks.map((candidate) => (candidate.id === id ? task : candidate)),
    );
  }
}

function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

function unknownStatus(value: string): string {
  return `"${value}" is not a status. The three are ${STATUSES.join(', ')}.`;
}

function describeAssignee(task: Task): string {
  return task.assignee ? `assigned to ${task.assignee}` : 'unassigned';
}

/**
 * The id in a `createTask` result, or undefined when the call created nothing.
 *
 * The Board issues the id and the tool hands back a sentence, so this is the only way the card
 * renderer can learn which Task it is rendering: a tool call carries the arguments the model sent
 * and the string the handler returned, and nothing else — there is no id on either. Reading the id
 * back out here keeps the sentence and its one reader in the same file, so re-wording `createTask`
 * cannot quietly stop the card from rendering.
 *
 * It fails closed. Every other string the handler can return — an unknown status, above — starts
 * with something else, and the renderer shows those as text.
 */
export function createdTaskId(result: string): string | undefined {
  return /^Created (T-\d+) /.exec(result)?.[1];
}
