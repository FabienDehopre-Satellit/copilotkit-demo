# Runsheet

The document the talk is presented *from*. Not the [spec](./demo-spec.md), which is read once by
whoever builds the demo, and not the Deck, which is what the room sees. This is read every time the
talk is given, it lives on the laptop, and it is never on screen.

Settled in [#17](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/17) and specified
in [§12](./demo-spec.md#12-the-runsheet-docsrunsheetmd) of the spec. Where this file and the spec
disagree about what the machine actually does, this file wins: it is the one that gets corrected
after a run-through.

---

## Five processes

| worktree | command | processes |
|---|---|---|
| `copilotkit-demo` (`main`) | `pnpm dev` | `app` 4200, `runtime` 8200 (spawning `mcp` as a stdio child), `agent` 8888 |
| `copilotkit-demo-phase2` (`phase-2`) | `ng serve --port 4300` from `app/` | `app` 4300 |
| `main`, separately | `pnpm present` in `slides/` | Slidev 3030 |

**Three names in the parallel stream — `app`, `runtime`, `agent` — and that is correct, not a broken
install.** `mcp` has no `dev` script because the runtime spawns it, and `slides` has `present`
instead of `dev`, so `--if-present` skips both.

**The phase-2 worktree never runs `pnpm dev`.** `agent/`, `runtime/` and `mcp/` are byte-identical on
both branches, so a second `pnpm dev` would only fail to bind 8200 and 8888 — loudly, inside a
parallel output stream, at the moment you have least attention to spare. `app/` is the only package
that genuinely needs two instances, so the phase-2 worktree starts exactly that one and nothing else.

The 4300 tab talks to the 8888 agent that `main`'s `pnpm dev` already started. Starting the agent
from the phase-2 worktree instead does not help: whichever worktree comes second still loses 8888.

The phase-2 worktree needs no `.env`. `.env` is git-ignored, so a fresh worktree has none, and only
the runtime and the agent ever read it — neither of which the phase-2 worktree starts.

---

## Screens, windows, tabs

**One projected browser window, three tabs**, left to right in the order the talk uses them:

| tab | url | used by |
|---|---|---|
| Deck | `localhost:3030` | all hour |
| phase 1 | `localhost:4200` | beats 1 to 6 |
| phase 2 | `localhost:4300` | beat 7 |

Every transition all hour, including beat 7's swap, is a tab change. Nothing else moves.

The **laptop screen is extended, never mirrored**. It carries what the room never sees: Slidev's
presenter view at `localhost:3030/presenter`, and the two terminals. **Terminals are never
projected** — the runtime prints an AI SDK warning about system messages on every single turn that
cannot be silenced, and it is meaningless to the room.

The **editor is never projected either.** All code is on slides.

**The phase-1 tab stays open through beat 7.** It costs nothing, it shows the room you did not touch
it, and it is the fallback if the .NET side is dead.

**The two apps are never side by side.** Two identical-looking boards at half width is the one
arrangement in which the audience cannot tell which is which, and phase 2's whole claim is sameness,
which needs sequence to read.

---

## The running order

Seven beats, ~65 minutes, no hard cap. The prompts are pinned: type them as written, because the
wording is what makes each beat land, and they are copied here rather than linked because a
document you present from cannot send you to another file for the words you are about to type.
[§10](./demo-spec.md#10-the-beats) is still where a prompt is *decided* — rehearsal changes wording
(see below), and a change made there has to land in this table **and** in the Deck's presenter
notes, `slides/slides.md`, which copy them a third time for the same reason. Then re-export
`deck.pdf`.

| beat | tab | prompt | what should happen | clock |
|---|---|---|---|---|
| 1 | 4200 | *What usually goes wrong when a company builds its own employee onboarding portal?* | Plain answer, no tool call. Off-board on purpose | **~4** at end |
| — | 3030 | opener: slides 2 to 8 | | **~17** at end |
| 2 | 4200 | *What's Bruno working on, and is anything not assigned to anyone yet?* | Names T-5 and T-6, and T-3 as unassigned | |
| 3a | 4200 | *Amira finished the profile page — mark it done.* | `moveTask`, T-4 to `done` | |
| 3b | 4200 | *Put Dries on picking an SSO provider.* | `assignTask`, T-3 to Dries | |
| 3c | 4200 | *Actually, drop the domain registration task.* | `deleteTask` on T-7, confirm dialog, you click through | |
| 4 | 4200 | *Put Bruno's task in done.* | It asks **which** one. Answer *the equipment checklist* and it moves T-5 | |
| 5a | 4200 | *Add a task to book the training room for the induction day* | `createTask`, T-9, rendered as a Task card | |
| 5b | 4200 | *Show me the board* | `showBoard`, mini three-column board in the transcript | |
| 6 | 4200 | *Who in the team directory has done data or integration work? Put them on the HR spreadsheet import.* | `find_teammates` then `assignTask` in one turn — the MCP call in a plain wildcard panel, the assign as its one-sentence outcome. The answer is **Ines**, on T-2 | **~40** at end |
| — | 3030 | slide 14 architecture, slides 15 to 17, the C# read-through | | **~43** at beat 7 |
| 7a | **4300** | *Amira finished the profile page — mark it done.* | Identical to 3a, fresh Seed | |
| 7b | **4300** | *Add a task to book the training room for the induction day* | Identical to 5a, card and all | |

**No Reset between beats 1 and 6, and none before beat 7.** The 4300 tab is a different origin, so it
is already on a fresh Seed. Reset on stage is a recovery move only.

Worth saying aloud at beat 6: Chloé holds T-2 and Chloé is Frontend, so reassigning to Ines reads as
a correction rather than an arbitrary move.

---

## Night before

1. Finish the Deck. Trace 1 on slide 4 is already captured and does not need re-taking; if it ever
   does, it comes from a real beat-1 turn via a throwaway `console.log` in `runtime/src/main.ts` that
   is deleted again immediately.
2. `pnpm export` in `slides/`, which writes `slides/deck.pdf`, and **commit it**. It is the Deck's
   only fallback, and it is stale the moment a slide changes.
3. Rebase `phase-2` onto `main`.
4. `git diff main phase-2 --stat` shows **exactly one file**, `app/src/app/app.config.ts`, six lines.
   This is a check, not a vibe: that diff is on slide 15 and is only true if nothing drifted.
5. Run beat 7 once against the rebased worktree.

**The rebase is deliberately not in the door-time list.** Rebasing under time pressure is how beat 7
breaks.

---

## At the door

1. `pnpm dev` in the main worktree. Wait for all three names in the stream.
2. `ng serve --port 4300` in the phase-2 worktree, from `app/`.
3. `pnpm present` in `slides/`. It serves on 3030 and starts nothing else.
4. One throwaway prompt into 4200, **and one into 4300**.
5. Hard-reload both app tabs. The Board is in memory, so this is a complete reset to the Seed with an
   empty transcript.
6. Deck to slide 1, presenter view on the laptop, display extended, notifications off.

**Step 4's 4300 half is not optional.** A root `.env` is a Node idiom that `dotnet run agent.cs`
would not read on its own; `agent.cs` loads it explicitly, and if that ever stops working the failure
appears only on the .NET side. This is the single pre-flight step that proves the key reached the
agent, and skipping it moves the discovery to beat 7 in front of the room.

---

## Recovery

Light resilience means these are decided now and written down, not improvised on stage.

| what breaks | move |
|---|---|
| A prompt returns something wrong or ugly | Say so out loud, retype **once**. Never twice. Twice is a debugging session in front of an audience |
| Beat 4 guesses instead of asking which Bruno Task | **Not a failure.** Narrate it. It resolved your words and resolved them wrong, which is the beat's own title |
| Board in a bad state mid-talk | **Reset demo.** Safe at any point: every later beat's target survives a restore, so it costs only the visible history of what already ran |
| Runtime or MCP dies | Laptop terminal, `pnpm dev` again. Chat errors are the tell. Beats 1 to 6 only |
| The .NET agent is dead at beat 7 | **No live recovery, and none needed.** The read-through comes before the run precisely so the slides carry the argument. Say what would have happened, and go to the close |
| Slidev dies | `slides/deck.pdf` |
| OpenAI or the venue network is down | Nothing to do. `deck.pdf`, and talk it through |

**A pre-recorded clip of beat 7 is refused on purpose, not overlooked.** It is the cheapest insurance
in the plan and the only place where resilience would cost the climax of the talk. A video of your
demo, shown as your demo, is a substitution the room feels.

---

## Rehearsal

Two activities, weeks apart.

**Prompt drilling, during the build.** All twelve pinned prompts — the eleven typed in the running
order above, plus beat 4's answer to the question the agent asks back — run about five times each
from its correct Board state. Anything under 5/5 gets its **wording** changed, never its
beat dropped — nothing is designated as the cut, so a beat that will not run reliably is a wording
problem by definition. This is how beat 4 finally gets tested: its success criterion is the model
*declining to act*, which is a model behaviour and not a code path, so it can only be measured by
repetition.

**Full run-throughs, at least two**, out loud and timed, one of them on the real projector in the
real room. Two things stay unverified until then: whether the `agent.cs` read-through is legible at
presentation font, and whether Traces 1 and 2 are readable from the back row.

**Timing without a stopwatch on stage.** Slidev's presenter view shows elapsed time. Four
checkpoints, also marked in the running order:

| checkpoint | target |
|---|---|
| end of beat 1 | ~4 |
| end of the opener | ~17 |
| end of beat 6 | ~40 |
| start of beat 7 | ~43 |

Running 5 to 10 minutes long is acceptable. Overrun is absorbed by Q&A, not by dropping a beat.
