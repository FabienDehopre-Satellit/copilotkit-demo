#:sdk Microsoft.NET.Sdk.Web
#:package Microsoft.Agents.AI.Hosting.AGUI.AspNetCore@1.19.0-preview.260822.1
// The GA package, for the OpenAI client and `AsAIAgent`. Same 1.19.0 as the preview above.
#:package Microsoft.Agents.AI.OpenAI@1.19.0
#:package DotNetEnv@3.2.0

using System.Text.Json;

using AGUI.Abstractions;
using AGUI.Server;
using DotNetEnv;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Microsoft.Extensions.AI;
using OpenAI;

// Before the builder: ASP.NET's environment-variable provider snapshots the environment when
// `CreateBuilder` adds it, so a later load would leave `Configuration["OPENAI_API_KEY"]` null.
Env.Load("../.env");

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:8888");
builder.Services.AddAGUIServer();
builder.Services.AddCors(o =>
    o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

// Pinned here and, on phase 1, in the Node runtime. The two must match: beat 7 re-runs prompts
// the room saw twenty minutes earlier, so latency is part of the demo.
var chatClient = new OpenAIClient(builder.Configuration["OPENAI_API_KEY"])
    .GetChatClient("gpt-5-mini")
    .AsIChatClient();

// Copy-pasted verbatim from the Node runtime's BuiltInAgent. A file both tiers read is the right
// engineering answer and the wrong demo answer: same prompt, the other language, no mechanism.
AIAgent agent = chatClient
    .AsAIAgent(
        name: "BoardAgent",
        instructions: "You are a helpful assistant.\n"
            + "Keep replies short and plain: they are read off a projector.")
    // MapAGUIServer reads messages, tools and resume, and drops `context` — the Board would never
    // reach the model, and "mark it done" would have no T-4 to resolve. This is the one thing the
    // Node tier was doing invisibly, in eleven lines. No backend tools: a C# tool here would make
    // phase 2 behave differently from phase 1, which is the whole claim.
    .AsBuilder()
    .Use(async (messages, session, options, next, ct) =>
    {
        if (options is ChatClientAgentRunOptions { ChatOptions: { } chatOptions }
            && chatOptions.TryGetRunAgentInput(out RunAgentInput? input)
            && input.Context is { Count: > 0 } entries)
        {
            var text = string.Join("\n\n", entries.Select(e => $"{e.Description}:\n{e.Value}"));
            messages = [new ChatMessage(ChatRole.System, text), .. messages];
        }

        RewrapFrontendTools(options);

        await next(messages, session, options, ct);
    })
    .Build();

var app = builder.Build();
app.UseCors();
app.MapAGUIServer("/", agent);
await app.RunAsync();

// Beat 7's second prompt, and the reason it is not one line. Once a turn has run a frontend tool,
// AGUI.Server 0.0.5 reads every later turn as a *continuation* and re-declares the tools the model
// has not called yet as bare `AIFunctionDeclaration`s. A declaration is not invocable, so
// FunctionInvokingChatClient never stops on it, and the continuation branch of the event mapping
// swallows the plain function call instead of emitting TOOL_CALL: the chat answers the first
// prompt and then goes dead. 0.0.6 fixes this upstream and cannot be taken — it writes explicit
// nulls that the pinned `@ag-ui/client` 0.0.57 rejects, which kills every turn instead of one. So
// re-present each declaration as the approval-required function 0.0.6 would have handed over.
static void RewrapFrontendTools(AgentRunOptions? options)
{
    if (options is not ChatClientAgentRunOptions { ChatOptions.Tools: { } tools })
    {
        return;
    }

    for (var i = 0; i < tools.Count; i++)
    {
        if (tools[i] is AIFunctionDeclaration declaration and not AIFunction)
        {
            tools[i] = new ApprovalRequiredAIFunction(new FrontendTool(declaration));
        }
    }
}

/// <summary>A frontend tool, invocable only in the browser. Approval stops the run before the body
/// could ever be reached, which is what makes the throw unreachable rather than optimistic.
/// </summary>
internal sealed class FrontendTool(AIFunctionDeclaration declaration) : AIFunction
{
    public override string Name => declaration.Name;

    public override string Description => declaration.Description;

    public override JsonElement JsonSchema => declaration.JsonSchema;

    protected override ValueTask<object?> InvokeCoreAsync(
        AIFunctionArguments arguments,
        CancellationToken cancellationToken)
        => throw new NotSupportedException("Frontend tools run in the browser.");
}
