import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';

/** A wildcard renderer knows nothing about its tool, so its arguments are whatever arrived. */
export type ToolCallArgs = Record<string, unknown>;

/**
 * The panel every tool call the app has no card for renders as: tool name, arguments, raw result.
 *
 * Registered as the wildcard `registerRenderToolCall({ name: '*' })`, which sits below every named
 * registration in CopilotKit's precedence chain, so it never shadows the Task card, the mini board
 * or the confirm dialog.
 *
 * It is plain on purpose, and always expanded. This is what a call to the MCP Team directory looks
 * like, and beat 6's whole point is the contrast with beat 5: there the app had designed UI for a
 * tool it knew about, here the app is rendering a tool it had never heard of. A purpose-built
 * Teammate card would erase exactly that distinction — and could not exist anyway, since the
 * directory's shape is the server's to change. Collapsing it would hide the payload the room is
 * being asked to look at.
 */
@Component({
  selector: 'app-tool-call-panel',
  templateUrl: './tool-call-panel.html',
  styleUrl: './tool-call-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolCallPanel implements ToolRenderer<ToolCallArgs> {
  readonly toolCall = input.required<AngularToolCall<ToolCallArgs>>();

  /** Absent only in the moment before the first argument delta arrives. */
  protected readonly name = computed(() => this.toolCall().name ?? 'tool');

  /** Arguments stream in, so this is partial and re-renders while it fills. */
  protected readonly argsJson = computed(() => JSON.stringify(this.toolCall().args ?? {}, null, 2));

  /** Raw, unparsed and unprettified: what the tool actually sent back is the thing to show. */
  protected readonly result = computed(() => this.toolCall().result ?? '');

  /** The gate on the result, because a tool is free to come back with the empty string. */
  protected readonly done = computed(() => this.toolCall().status === 'complete');
}
