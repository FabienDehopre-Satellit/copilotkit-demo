# Is `selfManagedAgents` licence-gated, and is the gate enforced?

Research for [issue #12](https://github.com/FabienDehopre-Satellit/copilotkit-demo/issues/12). Sources checked 2026-08-26.

## Short answer

**The gate is a commercial term, not a code path.** `selfManagedAgents` is
Enterprise-tier *licensing*, and CopilotKit says so on the docs page — but no
shipped package checks a licence before registering or running a self-managed
agent. There is no entitlement call, nothing throws, nothing degrades.

CopilotKit's own source comment is the cleanest statement of it:

> `selfManagedAgents` is part of CopilotKit's Enterprise Intelligence tier.
> **The signal is advisory and client-side only (not enforced)** […]
>
> — `packages/react-core/src/v2/providers/CopilotKitProvider.tsx:471-475`

In React, "advisory" means a `console.warn`. In **`@copilotkit/angular@0.3.1` —
the version this demo uses — there is not even a warning.** The string
`selfManagedAgents` appears three times in the shipped bundle, all of them plain
object spreads.

**Phase 2 stands as designed.** An unlicensed local dev machine running an
internal talk demo hits no limit at all. The MAF-behind-the-Node-CopilotRuntime
fallback is not needed; keep it as the production-shape answer, not a
viability rescue. See [What this does *not* license](#5-what-this-does-not-license)
for the one feature that genuinely is gated.

Everything below was read out of packages pulled from npm, not from docs.

## 1. What the docs actually claim

The Enterprise framing is real and it is explicit. From
`showcase/shell-docs/src/content/docs/backend/self-managed-agents.mdx` (the
source behind [docs.copilotkit.ai/backend/self-managed-agents](https://docs.copilotkit.ai/backend/self-managed-agents)):

> **Part of CopilotKit Intelligence**
> `selfManagedAgents` is part of CopilotKit's [Enterprise Intelligence tier](/premium/intelligence-platform).
> [Talk to an engineer](https://copilotkit.ai/talk-to-an-engineer) about licensing
> **for production use**.

Two things worth noting in that callout. It is an *info* callout, not a warning
or a "requires" banner. And the ask is scoped to **production use** — the same
page positions `agents__unsafe_dev_only` as "the free local-dev escape hatch",
with `selfManagedAgents` as the supported production path for the same shape.

The [pricing page](https://www.copilotkit.ai/pricing) never names
`selfManagedAgents` at all. It sells four tiers (Developer free, Pro $39/mo,
Team $100/seat/mo, Enterprise custom) and lists VPC/on-prem deployment, seats,
SSO and support as the Enterprise differentiators. Nothing there implies a
runtime capability check.

The [premium overview](https://docs.copilotkit.ai/premium/overview) says a
licence key "unlocks self-hosted CopilotKit Intelligence capabilities and does
not require runtime traffic to go through the cloud-hosted service" — i.e. the
key exists to enable **offline verification of the Intelligence platform**, not
to police the frontend provider.

## 2. Every package in the path is MIT

Pulled and inspected:

| Package | Version | `license` field | `LICENSE` file |
| --- | --- | --- | --- |
| `@copilotkit/angular` | 0.3.1 | MIT | MIT (Tawkit Inc.) |
| `@copilotkit/core` | 1.66.0 | *absent* | MIT (Atai Barkai) |
| `@copilotkit/shared` | 1.66.0 | MIT | — |
| `@copilotkit/runtime` | 1.66.0 | MIT | MIT (Atai Barkai) |
| `@copilotkit/license-verifier` | 0.5.0 | MIT | MIT |
| `@copilotkit/channels-intelligence` | 0.7.0 | MIT | — |

The repo root [`LICENSE`](https://github.com/CopilotKit/CopilotKit/blob/main/LICENSE)
is MIT. Enumerating `packages/*/package.json` across the monorepo via the GitHub
API turns up **no non-MIT licence anywhere** — the handful with no `license`
field (`core`, `voice`, `sqlite-runner`, `web-inspector`, `agentcore-runner`,
`demo-agents`, `tailwind-config`) are omissions, not restrictions; `core` ships
an MIT `LICENSE` file regardless. There is no BSL, no Elastic licence, no
`LicenseRef-` SPDX expression, no "Enterprise Edition" package. The premise that
"parts of CopilotKit may not be MIT" does not hold as of these versions.

Note that MIT licensing does not by itself settle the commercial question —
someone could ship MIT code and still sell a licence for the right to use a
feature. It does mean there is no *legal* mechanism forcing the gate, and it
rules out a source-available licence quietly restricting production use.

## 3. What `selfManagedAgents` does in the shipped Angular bundle

`@copilotkit/angular@0.3.1` → `dist/fesm2022/copilotkit-angular.mjs`. All three
occurrences:

```js
// line 1883 — CopilotKit service constructor
core = new CopilotKitCore({
  runtimeUrl: this.#config.runtimeUrl,
  headers: this.#config.headers,
  agents__unsafe_dev_only: {
    ...this.#config.agents,
    ...this.#config.selfManagedAgents,   // ← merged, unconditionally
  },
  ...
});

// lines 2226-2229 — updateRuntime()
if (options.agents !== undefined || options.selfManagedAgents !== undefined) {
  this.core.setAgents__unsafe_dev_only({
    ...(options.agents ?? this.#config.agents),
    ...(options.selfManagedAgents ?? this.#config.selfManagedAgents),
  });
}
```

`selfManagedAgents` and the dev-only `agents` option are **the same code path**.
They are spread into one object and handed to the identical core API. The two
names differ only in what the docs say about them. There is no branch, no
condition, no key lookup between the config and the agent registry.

Downstream in `@copilotkit/core@1.66.0` (`dist/index.mjs:1032-1044`),
`setAgents__unsafe_dev_only` validates agent ids, stores them as `localAgents`,
applies headers and credentials, and notifies subscribers. No licence reference
in the function or anywhere near it.

`localAgents` also **survive runtime failure**. In the `/info` error handler
(`core/dist/index.mjs:1256`) the registry falls back to
`this._agents = this.localAgents` — so an `HttpAgent` registered via
`selfManagedAgents` keeps working even with no runtime reachable at all.

## 4. Every licence-shaped thing in the bundles, and what it actually does

Grepping `licen*`, `entitle*`, `telemetry`, `publicApiKey` across
`core/dist/index.mjs`, the Angular fesm bundle, and `runtime/dist/**` produces
exactly four mechanisms. None of them touch agents.

### 4a. The watermark — shipped disabled

```js
// copilotkit-angular.mjs:29-34
// The license watermark is currently disabled. The implementation below is
// [retained] …
const LICENSE_WATERMARK_ENABLED = false;
const LICENSE_KEY_REGEX = /^ck_pub_[0-9a-f]{32}$/i;
```

`ensureLicenseWatermark()` is called from the `CopilotKit` service constructor
(line 1914) and returns immediately on the disabled flag. The would-be
behaviour was a fixed-position "CopilotKit Unlicensed" badge plus a one-shot
`console.warn`. Both are dead code in 0.3.1. Even when enabled it was cosmetic —
it appends a `<div>`, it does not restrict anything.

`resolveLicense()` (line 92) only decides whether to inject the key as an
`x-copilotcloud-public-api-key` header. With no key it returns
`{ valid: false }` and `provideCopilotKit` passes the headers through unchanged.
No throw, no early return, no feature flag.

### 4b. `checkFeature` fails **open**

From `@copilotkit/shared/src/index.ts:56-82` (the package ships its `src`):

```ts
/**
 * Features are enabled unless the runtime definitively reports the license
 * as "expired" or "invalid". A null/"none"/"unknown" status fails open
 * (unlicensed = unrestricted, with branding) …
 */
export function createLicenseContextValue(status) {
  const resolvedStatus = status ?? null;
  const featuresEnabled =
    resolvedStatus !== "expired" && resolvedStatus !== "invalid";
  return { status: resolvedStatus, license: null,
           checkFeature: () => featuresEnabled, getLimit: () => null };
}
```

"Unlicensed = unrestricted, with branding" is CopilotKit's own summary of the
design, and the branding half is the watermark from 4a — which is off. Note
`checkFeature` ignores its argument entirely: there is no per-feature data in
`/info` yet, so it is a single boolean for all four registered feature names
(`chat`, `sidebar`, `popup`, `threads` — `core/dist/index.mjs:5476-5481`).

### 4c. The server never enforces anything

In `@copilotkit/runtime@1.66.0`, `licenseChecker` is used in exactly **one**
place across the whole `dist` tree — filling in a field on the `/info` response:

```js
// runtime/dist/v2/runtime/handlers/get-runtime-info.mjs:7-15
function resolveLicenseStatus(runtime) {
  if (!runtime.licenseChecker) return "none";
  const status = runtime.licenseChecker.getStatus();
  if (status.warningSeverity === "none") return "valid";
  if (status.error === "expired") return "expired";
  ...
}
```

and it is only attached at all on `CopilotIntelligenceRuntime`
(`runtime/dist/v2/runtime/core/runtime.mjs:89`), the threads/persistence/channels
tier. A plain `CopilotRuntime` / `CopilotSseRuntime` has **no `licenseChecker`**,
and `/info` omits `licenseStatus` entirely (it is spread in only under
`isIntelligenceRuntime(runtime)`).

No request handler, middleware, or agent-run path consults it. The token is read
from `options.licenseToken ?? process.env.COPILOTKIT_LICENSE_TOKEN`; if absent,
`createLicenseChecker(undefined)` returns a status of
`{ valid: false, license: null, error: null, warningSeverity: "info" }` — which
`resolveLicenseStatus` maps to `"none"`, which `checkFeature` treats as enabled.

Verification is a **local Ed25519/JWT signature check** (`license-verifier`
imports Node `crypto`, nothing else). There is **no entitlement call, no licence
server, no phone-home** anywhere in the licence path. An air-gapped machine
behaves identically to a connected one.

### 4d. Telemetry — separate concern, opt-out, non-blocking

`runtime/dist/v2/runtime/telemetry/telemetry-client.mjs`: a 5%-sampled event
send to a CopilotKit lambda, disabled by `COPILOTKIT_TELEMETRY_DISABLED=1` or
the standard `DO_NOT_TRACK=1`. A `logRuntimeTelemetryDisclosure()` runs in the
runtime constructor. This is **server-side only** — it lives in
`@copilotkit/runtime`, which a `selfManagedAgents`-only frontend never loads.
The browser bundles send nothing. Telemetry never gates behaviour; `capture()`
early-returns when disabled.

## 5. What this does *not* license

One real gate exists, and it is worth knowing precisely because it is the
exception that proves the pattern. The **threads drawer** in
`@copilotkit/angular` is genuinely closed by default
(`copilotkit-angular.mjs:11727-11738`):

```js
// `checkFeature` fails OPEN (returns true) when no license is configured, so it
// cannot by itself detect the no-license case; we therefore also require a
// positive license-present signal.
licensed = computed(() => {
  const ctx = this.licenseContext();
  const licensePresent = ctx.status === "valid" || ctx.status === "expiring";
  return licensePresent && ctx.checkFeature("threads");
});
```

CopilotKit had to add a *second* condition specifically because `checkFeature`
fails open. When `licensed` is false the drawer renders a locked view with an
Upgrade CTA and skips the `/threads` fetch. This is the shape enforcement takes
when CopilotKit means it — and nothing remotely like it exists on the agent path.

Two consequences for phase 2:

- Persisted thread history is Intelligence-tier and really is off without a key.
  A demo that wants a thread list needs a licence or needs to build its own.
- With `selfManagedAgents` and **no** `runtimeUrl`, `licenseStatus` stays
  `undefined` forever, so `licensePending` (`status === null`) is permanently
  true and the drawer sits in its loading state rather than showing the locked
  view. Don't mount the threads drawer in a runtime-less configuration.

Chat, sidebar and popup are registered feature names but nothing in the Angular
bundle calls `checkFeature` for them — `checkFeature` appears only in the threads
gate.

## 6. Verdict for phase 2

**An unlicensed local dev machine running an internal talk demo hits no limit.**
Concretely, with `provideCopilotKit({ selfManagedAgents: { agent: new HttpAgent({ url }) } })`
and no licence key:

- The agent registers and runs. Same code path as the free dev option.
- No watermark (the flag is off in 0.3.1).
- No console warning (Angular doesn't ship React's advisory warn).
- No network call for verification, ever.
- No throw, no degraded mode, no rate limit, no MAU counter.
- Telemetry: none from the browser; server-side only, sampled, opt-out — and not
  in play at all if you skip the Node runtime.

The only thing to avoid is the threads drawer.

The obligation that remains is **commercial and honest**: CopilotKit asks for an
Enterprise conversation about `selfManagedAgents` **in production**. An internal
conference talk is not production. If this demo ever becomes a shipped product,
that conversation is owed — the absence of a technical gate is not permission,
and CopilotKit has deliberately chosen trust over DRM here. Worth saying out
loud in the talk if `selfManagedAgents` appears on a slide.

### The fallback, for the record

Not needed for viability, but it is still the right production shape: put MAF
behind the Node `CopilotRuntime` and let the browser talk to `runtimeUrl`
instead of directly to the agent. That removes the Enterprise question
entirely (`CopilotRuntime` is MIT with no `licenseChecker` at all), and it
independently fixes the security concern flagged in
[maf-over-agui.md](./maf-over-agui.md) — Microsoft's own AG-UI guidance says not
to expose an AG-UI server directly to a browser, which is exactly what
`selfManagedAgents` does. Phase 2 can ship as designed; this stays the stretch
goal it already was on the map.

## Sources

All package claims come from tarballs pulled with `npm pack` and read directly:
`@copilotkit/angular@0.3.1`, `@copilotkit/core@1.66.0`,
`@copilotkit/shared@1.66.0`, `@copilotkit/runtime@1.66.0`,
`@copilotkit/license-verifier@0.5.0`.

- [CopilotKit repo `LICENSE`](https://github.com/CopilotKit/CopilotKit/blob/main/LICENSE)
- [`packages/react-core/src/v2/providers/CopilotKitProvider.tsx`](https://github.com/CopilotKit/CopilotKit/blob/main/packages/react-core/src/v2/providers/CopilotKitProvider.tsx) — the "advisory and client-side only (not enforced)" comment
- [`showcase/shell-docs/.../backend/self-managed-agents.mdx`](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/backend/self-managed-agents.mdx) — the Enterprise callout
- [docs.copilotkit.ai/premium/overview](https://docs.copilotkit.ai/premium/overview)
- [docs.copilotkit.ai/backend/copilot-runtime](https://docs.copilotkit.ai/backend/copilot-runtime)
- [copilotkit.ai/pricing](https://www.copilotkit.ai/pricing)
