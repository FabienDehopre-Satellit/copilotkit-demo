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

  /**
   * The one sentence the room reads, which is not what the model reads.
   *
   * A result that closes the turn has to carry its steering in the string, because the string is
   * the only channel there is — and steering read off a projector is the seam showing. So each
   * path below hands `#respond` both halves: the full string for the model, this for the screen.
   * Empty until we answer, so the fallback below covers the frame before that.
   */
  readonly #shown = signal('');

  /** What we responded with, dug back out of the envelope CopilotKit wraps it in. */
  protected readonly result = computed(() => unwrap(this.toolCall().result));

  /** What the transcript prints: our own sentence, or the raw result if we never set one. */
  protected readonly outcome = computed(() => this.#shown() || this.result());

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
        const miss = this.#board.deleteTask(this.id());
        this.#respond(miss, miss);
      }
    });
  }

  // The click is the end of the exchange too, and for the same reason `keep()` says so. A bare
  // `Deleted T-7 "Register the domain."` leaves the model resuming a turn whose user message is
  // already answered, with a fact and no instruction as the newest thing in the thread — so it
  // invents the next step, and what it invents is `showBoard`, which spends beat 5's reveal in
  // beat 3. The store's sentence stays the opening of the string: the wording of a result lives
  // next to the write, and the rest closes the turn around it.
  protected confirm(): void {
    const deleted = this.#board.deleteTask(this.id());
    this.#respond(
      `${deleted} The user pressed "Delete" and the deletion is done. Reply with one short ` +
        `sentence saying so. Do not call another tool and do not show the board.`,
      deleted,
    );
  }

  // The refusal is the end of the exchange, so it says so. "The user said no" on its own reads to
  // the model as a question still open, and it asks again in prose — which puts a second confirm
  // in front of the room right after the dialog it just answered. Naming the answer as final, and
  // saying what to reply instead, is what closes it.
  protected keep(): void {
    this.#respond(
      `The user pressed "Keep it" and refused the deletion. ${this.id()} was not deleted and the ` +
        `board is unchanged. This answer is final: do not ask again and do not offer to delete ` +
        `it. Reply with one short sentence saying the Task is still on the board.`,
      `Kept ${this.label()}.`,
    );
  }

  /** Once only, whichever path got here: a second answer to a question already answered is noise. */
  #respond(result: string, shown: string): void {
    if (untracked(this.answered)) {
      return;
    }
    this.answered.set(true);
    this.#shown.set(shown);
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
