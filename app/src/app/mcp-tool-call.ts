import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AngularToolCall } from '@copilotkit/angular';

@Component({
  selector: 'app-mcp-tool-call',
  templateUrl: './mcp-tool-call.html',
  styleUrl: './mcp-tool-call.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpToolCall {
  readonly toolCall = input.required<AngularToolCall>();

  protected readonly arguments = computed(() => JSON.stringify(this.toolCall().args, null, 2));
}
