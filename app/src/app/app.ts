import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { connectAgentContext, CopilotChat } from '@copilotkit/angular';

import { Board } from './board';
import { BoardStore } from './board-store';
import { registerBoardTools } from './board-tools';

@Component({
  selector: 'app-root',
  imports: [Board, CopilotChat],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** The Board: all Tasks, in memory only. A reload is already a full reset. */
  protected readonly board = inject(BoardStore);

  /**
   * The chat thread, bound into `<copilot-chat [threadId]>` and set directly. A new id is the
   * whole mechanism: CopilotKit sees the thread change and clears the transcript. The threads
   * drawer is never mounted, on either branch — it is the one genuinely licence-gated component,
   * and it hangs in `licensePending` under `selfManagedAgents`.
   */
  protected readonly threadId = signal(newThreadId());

  constructor() {
    // The whole read channel: one entry, re-sent on every turn. The accessor is load-bearing —
    // connectAgentContext wraps an effect(), so a plain object would register once and never
    // follow the signal. Called from the constructor, so the injection context is implicit and
    // teardown rides DestroyRef.
    connectAgentContext(() => ({
      description: 'The current task board',
      value: JSON.stringify(this.board.tasks()),
    }));

    // The write channel: four tools, all of them frontend tools, registered from the same
    // injection context so they are torn down with this component.
    registerBoardTools();
  }

  /**
   * Recovery only: nothing in the running order presses this. Both halves matter — a transcript
   * saying "I've moved that to done" above a Board where it is not is worse than either alone,
   * so restoring the Seed without dropping the thread is not an option.
   */
  protected reset(): void {
    this.board.reset();
    this.threadId.set(newThreadId());
  }
}

/**
 * A thread id nobody has used before. The clock rather than `crypto.randomUUID()`, which is
 * `undefined` outside a secure context: on a LAN IP over http that would throw in a field
 * initialiser and take the Board and the chat down with it. Monotonic across reloads too, so the
 * runtime never replays a previous run's history into a chat that looks empty.
 */
function newThreadId(): string {
  return `thread-${Date.now()}`;
}
