import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';

import { BoardStore, createdTaskId } from './board-store';
import { TaskCard } from './task-card';
import type { Status } from './task';

/** `createTask`'s arguments. A type alias, not an interface, so it satisfies the constraint. */
export type CreateTaskArgs = {
  title: string;
  description?: string;
  status?: Status;
  assignee?: string;
};

/**
 * `createTask`'s result, rendered in the transcript as the same Task card the Board uses.
 *
 * This is the whole of beat 5's first half: a tool is not only a way to act, it is also a way to
 * show. The card renders on every call, with nothing for the model to decide — rendering only when
 * the user asks for a card makes the beat hinge on the model inferring a boolean, and that failure
 * is silent, which is the one failure mode §4 rules out.
 *
 * The card reads the live Task out of the store rather than redrawing the arguments, so what the
 * room sees in the transcript is the Task that is on the Board beside it, not a copy that could
 * disagree with it.
 */
@Component({
  selector: 'app-created-task',
  imports: [TaskCard],
  templateUrl: './created-task.html',
  styleUrl: './created-task.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatedTask implements ToolRenderer<CreateTaskArgs> {
  readonly toolCall = input.required<AngularToolCall<CreateTaskArgs>>();

  readonly #board = inject(BoardStore);

  protected readonly status = computed(() => this.toolCall().status);

  /** Absent until the handler has run: arguments stream in ahead of the result. */
  protected readonly result = computed(() => this.toolCall().result ?? '');

  protected readonly task = computed(() => {
    const id = createdTaskId(this.result());
    return id ? this.#board.findTask(id) : undefined;
  });
}
