import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';

import { BoardStore } from '../core/board-store';
import { groupByStatus } from '../models/task';

/** `showBoard` takes nothing. The board it shows is the one the app already holds. */
export type ShowBoardArgs = Record<string, never>;

/**
 * The mini board, rendered in the transcript by `showBoard`.
 *
 * `showBoard` is the rendering tool: it writes nothing and exists only to put this on screen,
 * which is the cleanest statement of beat 5's point that a tool call can come back as UI rather
 * than as prose.
 *
 * It reads the store directly and ignores its `toolCall` — an argument-free tool has nothing to
 * render *from*, so the Board itself is the input. That also keeps this pane and the Board beside
 * it reading off one signal, so they cannot disagree.
 *
 * Id and title only. Descriptions and assignees are three columns away in a 26rem pane, and the
 * full Task is already on the Board next to it; what the mini board has to show is the shape.
 */
@Component({
  selector: 'app-mini-board',
  templateUrl: './mini-board.html',
  styleUrl: './mini-board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniBoard implements ToolRenderer<ShowBoardArgs> {
  readonly toolCall = input.required<AngularToolCall<ShowBoardArgs>>();

  readonly #board = inject(BoardStore);

  protected readonly grouped = computed(() => groupByStatus(this.#board.tasks()));
}
