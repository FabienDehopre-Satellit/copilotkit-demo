# Spike: does a two-tool-call turn see a stale Board? (#14)

Throwaway. Not for merge. Reproduces beat 6 — `find_teammates` (MCP, server-side)
chained into `assignTask` (frontend tool) — against a **scripted fake OpenAI
Responses API** so the two-call sequence is deterministic and every request the
model receives is logged.

## Run it

```
node spike/fake-model/server.mjs     # :9100, logs to spike/fake-model/requests.jsonl
node spike/runtime/server.mjs        # :8200, BuiltInAgent + stdio MCP, maxSteps 5
cd spike/app && pnpm start           # :4200
```

Type: *"Find someone who knows data and give them the profile page task"*.

## What was measured

The Board is serialised into `connectAgentContext()` with a `REV=<n>` marker that
increments on every mutation. The fake model logs the system message of every call.

## Result

```
call 0 @12:58:01.004  ->  REV=0 T-1:Amira,T-2:Chloé
call 1 @12:58:01.025  ->  REV=0 T-1:Amira,T-2:Chloé
call 2 @12:58:01.041  ->  REV=0 T-1:Amira,T-2:Chloé   <- after the mutation
call 3 @12:58:49.890  ->  REV=1 T-1:Amira,T-2:Ines    <- next turn
```

App timeline for the same turn:

```
12:57:56.925  context READ -> REV=0 T-1:Amira,T-2:Chloé
12:58:01.031  assignTask(T-2, Ines) — handler entered
12:58:01.033  assignTask done -> REV=1 T-1:Amira,T-2:Ines
12:58:01.034  context READ -> REV=1 T-1:Amira,T-2:Ines
```

**Yes, stale, and not as a race.** The app knew `REV=1` at `01.034`; the model was
called at `01.041`, 7ms later, and still got `REV=0`. Waiting longer would not help.

Structural cause, from `@copilotkit/runtime@1.69.2` `src/agent/index.ts`: the
context is folded into **one system message built once per run**, then `streamText`
loops with that same array. Nothing re-reads `input.context` between steps.

## Three things that were assumed and turned out otherwise

1. **A frontend tool does not end the run.** `assignTask` executed in the browser
   and its result came back into the *same* run in 16ms (`call_assign`'s
   `function_call_output` is present in call 2's input). The whole beat is one run,
   three steps — so #8's `maxSteps >= 3` is exactly right, not conservative.
2. **`connectAgentContext` is reactive, not run-start-captured.** The accessor ran
   at registration and again 1ms after the signal changed — never at run start. The
   value CopilotKit holds is current as of the last change, which is better than a
   per-run snapshot. It is the *run input* that freezes, not the accessor.
3. **The UI leads the transcript, it does not lag.** The column flipped at `01.033`;
   the agent's summary streamed after `01.041`. On stage the card moves first and the
   sentence follows.

## Incidental, for the spec

- `@ai-sdk/openai@3.0.104`'s default model constructor is the **Responses API**
  (`POST /responses`), not `/chat/completions`. Trace 1 (#13) is captured from a real
  run, so it will be a Responses-API payload — `input`, `function_call`,
  `function_call_output`, not `messages` and `tool_calls`.
- The runtime prints an AI SDK warning **on every turn**: *"System messages in the
  prompt or messages fields can be a security risk…"*. Unavoidable, because folding
  context into a system message is what `BuiltInAgent` does. It is noise in whichever
  terminal is on screen.
- In the request, both `function_call` entries are grouped before both
  `function_call_output` entries rather than interleaved. Harmless here, worth
  knowing if the hand-built trace (#13, trace 2) is drawn from a real payload.
