import { Injectable, signal } from '@angular/core';

import { SEED_TASKS } from './seed';
import { STATUSES, type Status, type Task } from './task';

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

  /** All Tasks, taken together. Read by the Board component and by the one context entry. */
  readonly tasks = this.#tasks.asReadonly();

  findTask(id: string): Task | undefined {
    return this.#tasks().find((task) => task.id === id);
  }

  /** Half of Reset. The other half is a fresh thread id, and `App` owns that. */
  reset(): void {
    this.#tasks.set(SEED_TASKS);
  }

  createTask(
    title: string,
    description: string | undefined,
    status: Status | undefined,
    assignee: string | null | undefined,
  ): string {
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

  moveTask(id: string, status: Status): string {
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
    // null means the same thing, for a model that sends one — see `UNASSIGN` in board-tools.ts.
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

  /** The next free id. T-9 is beat 5's, and every one after it comes from here too. */
  #nextId(): string {
    const numbers = this.#tasks()
      .map((task) => Number.parseInt(task.id.slice('T-'.length), 10))
      .filter((number) => Number.isInteger(number));
    return `T-${Math.max(0, ...numbers) + 1}`;
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
