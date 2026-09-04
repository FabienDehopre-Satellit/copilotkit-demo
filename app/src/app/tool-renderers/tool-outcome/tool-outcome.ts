import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';

/**
 * The one line `moveTask` and `assignTask` leave in the transcript: the sentence the handler
 * already returned, and nothing else.
 *
 * It exists because of what having no `component` costs. CopilotKit's precedence chain matches a
 * frontend tool only when it brings one — `frontend.filter((entry) => entry.component !== undefined)`
 * — so a registration without one is not a lower-priority match, it is not a match at all, and the
 * call falls through to the wildcard `ToolCallPanel`. That panel is beat 6's, and it says "the app
 * had never heard of this tool". Letting it catch the two Board verbs the app defines itself makes
 * the claim false the first time the room sees it, in beat 3, twenty minutes early.
 *
 * So the fix is a named renderer rather than a change to the wildcard: this wins at the frontend
 * tier and the wildcard is left catching exactly the MCP tools it is there for.
 *
 * `BoardStore` writes the sentence next to the write it describes, so there is nothing to compose
 * here and nothing to keep in step. The arguments are ignored, which is why the class is generic:
 * it renders any tool whose result is already a sentence, and the two it renders disagree about
 * everything else.
 */
@Component({
  selector: 'app-tool-outcome',
  templateUrl: './tool-outcome.html',
  styleUrl: './tool-outcome.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolOutcome<
  Args extends Record<string, unknown> = Record<string, unknown>,
> implements ToolRenderer<Args> {
  readonly toolCall = input.required<AngularToolCall<Args>>();

  /** The gate: until the handler has run there is no outcome to summarise, so nothing renders. */
  protected readonly done = computed(() => this.toolCall().status === 'complete');

  protected readonly result = computed(() => this.toolCall().result ?? '');
}
