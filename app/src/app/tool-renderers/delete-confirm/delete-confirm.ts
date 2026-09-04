import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { HumanInTheLoopToolCall, HumanInTheLoopToolRenderer } from '@copilotkit/angular';

import { BoardStore } from '../../core/board-store';

/** `deleteTask`'s one argument. A type alias, not an interface, so it satisfies the constraint. */
export type DeleteTaskArgs = { id: string };

/**
 * The confirm dialog for `deleteTask`, rendered inside the chat transcript.
 *
 * `registerHumanInTheLoop` replaces the tool's handler entirely: the run parks on a promise until
 * this component calls `respond()`, and whatever it responds with *is* the tool result the model
 * reads. So the deletion happens here, on the click, and nowhere else. It is the one destructive
 * verb, which is why it is the one tool that asks — `done` is terminal and there is no archive to
 * fall back on.
 */
@Component({
  selector: 'app-delete-confirm',
  templateUrl: './delete-confirm.html',
  styleUrl: './delete-confirm.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteConfirm implements HumanInTheLoopToolRenderer<DeleteTaskArgs> {
  readonly toolCall = input.required<HumanInTheLoopToolCall<DeleteTaskArgs>>();

  readonly #board = inject(BoardStore);

  /** Set the moment we respond. The run has not finished yet, but there is nothing left to ask. */
  protected readonly answered = signal(false);

  protected readonly status = computed(() => this.toolCall().status);

  /** What we responded with, dug back out of the envelope CopilotKit wraps it in. */
  protected readonly result = computed(() => unwrap(this.toolCall().result));

  /** Arguments stream in, so the id is briefly absent while the status is `in-progress`. */
  protected readonly id = computed(() => this.toolCall().args.id ?? '');
  protected readonly task = computed(() => this.#board.findTask(this.id()));

  /** `T-7 — Register the domain`, so the room reads the target and not just an id. */
  protected readonly label = computed(() => {
    const task = this.task();
    return task ? `${task.id} — ${task.title}` : this.id();
  });

  constructor() {
    // Nothing to confirm when the id is not on the board, so don't put a dialog in front of the
    // room that has no good answer. Letting the store run is how the model finds out: `deleteTask`
    // on an id it does not hold writes nothing and returns the same readable error the other three
    // tools return, which is exactly what the model needs to correct itself.
    effect(() => {
      const nothingToDelete = this.status() === 'executing' && this.id() !== '' && !this.task();
      if (nothingToDelete) {
        this.#respond(this.#board.deleteTask(this.id()));
      }
    });
  }

  protected confirm(): void {
    this.#respond(this.#board.deleteTask(this.id()));
  }

  protected keep(): void {
    this.#respond(`The user said no. ${this.id()} was not deleted and the board is unchanged.`);
  }

  /** Once only, whichever path got here: a second answer to a question already answered is noise. */
  #respond(result: string): void {
    if (untracked(this.answered)) {
      return;
    }
    this.answered.set(true);
    this.toolCall().respond(result);
  }
}

/**
 * `respond(x)` does not resolve the parked handler with `x`. It resolves it with
 * `{ toolCallId, toolName, result: x }`, and the runtime stringifies anything that is not already
 * a string — so the tool message, and the panel that renders it, carry that JSON rather than the
 * sentence. The model reads it either way, and there is no way to intercept it from the app: the
 * envelope is built inside `registerHumanInTheLoop`. §13 records the behaviour; this pulls the
 * sentence back out so the room reads English.
 */
function unwrap(result: string | undefined): string {
  if (!result) {
    return '';
  }
  try {
    const envelope: unknown = JSON.parse(result);
    if (envelope && typeof envelope === 'object' && 'result' in envelope) {
      const inner = (envelope as { result: unknown }).result;
      return typeof inner === 'string' ? inner : result;
    }
  } catch {
    // Not JSON, so it is already the string we responded with.
  }
  return result;
}
