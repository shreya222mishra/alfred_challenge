# alfred_challenge

Prototype of an AI execution decision layer that determines when to act, confirm, ask clarifying questions, or refuse based on user intent, context, and risk.

## Overview

A minimal, static prototype for the alfred_ application challenge. It focuses on the core product judgment problem: deciding when alfred_ should act silently, notify after action, confirm, clarify, or refuse.

Note: the current "LLM" step is intentionally simulated in the browser for this static prototype. The pipeline, prompt, raw output, parsing, and fallback behavior are all exposed, but there is no live model API call in this version.

## What this prototype does

- Runs a full decision pipeline for a proposed action plus context.
- Shows the final decision and a concise rationale.
- Includes 6 preloaded scenarios:
  - 2 easy
  - 2 ambiguous
  - 2 risky, including visible failure handling
- Exposes the full trace:
  - inputs
  - deterministic signals computed in code
  - exact prompt sent to the model layer
  - raw model output
  - final parsed decision
- Demonstrates safe fallback behavior for:
  - LLM timeout
  - malformed model output
  - missing critical context

## Run locally

Because the prototype is static, you can run it with any file server.

```bash
cd /Users/shreyamishra/Downloads/alfred
python3 -m http.server 4173
```

Then open [http://localhost:4173](http://localhost:4173).

## Signals used, and why

The code computes a small set of deterministic signals before the model step:

- `unresolvedIntent`: catches vague references like "that" or "it" when the target action is not clearly grounded.
- `hasExplicitHold`: catches contradictory history such as "hold off" or "wait until legal reviews."
- `externalParty`: increases scrutiny for actions that touch partners, vendors, or board members.
- `financialRisk`: marks payment- or pricing-related actions as materially riskier.
- `highImpactAction`: flags actions like canceling, sending, discounting, or wiring money.
- `userRequestedNotification`: preserves UX when the user explicitly asked to be told after action.
- `suspiciousContext`: handles account compromise or social engineering hints.
- `missingCriticalContext`: detects absent or deliberately incomplete inputs.

These signals exist because some risk checks should not depend on model interpretation alone. They are simple, legible, and easy to extend.

## LLM vs. regular code

I split responsibilities this way:

- Regular code computes deterministic risk signals, assigns a coarse risk score, simulates failure modes, validates output, and enforces hard safety overrides.
- The model layer decides the conversational action inside a bounded decision set and writes a short rationale / follow-up message.

This keeps the model responsible for contextual judgment while preserving explicit guardrails in code.

## What is deterministic vs. model-decided

Deterministic:

- signal extraction
- risk score
- safety thresholds
- suspicious-context override
- fallback behavior on timeout or malformed output
- final validation that the decision is one of the allowed values

Model-decided:

- which conversational action best fits the context when multiple safe options are plausible
- the short rationale
- the optional user-facing follow-up sentence

## Prompt design

The prompt is intentionally narrow:

- it gives the model only 5 allowed decisions
- it restates the challenge boundary for clarify vs. confirm vs. refuse
- it includes conversation history and user state
- it asks for strict JSON so the output can be validated

This is not meant to be a chain-of-thought-heavy design. It is closer to a bounded decision service.

## Expected failure modes

- Timeout: the system defaults to a safer non-irreversible path instead of executing.
- Malformed output: the parser rejects it and falls back conservatively.
- Missing context: the system pushes toward clarification rather than guessing.
- Heuristic blind spots: pattern-based signals can miss nuanced context.
- Distribution shift: new tool types or adversarial phrasing could reduce reliability.

## How I'd evolve this for riskier tools

- Separate reversible from irreversible actions with stricter policy rails for the latter.
- Add richer user-specific trust state and past-confirmation behavior.
- Introduce tool-specific policies instead of one shared risk score.
- Log outcomes so thresholds can be calibrated against real user satisfaction and incident data.
- Add human-review / escalation queues for payment, legal, security, and identity-sensitive actions.

## What I'd build over the next 6 months

- A policy engine with tool-class-specific risk frameworks.
- Better memory and state tracking for pending confirmations, holds, and prior user intent.
- Offline evaluation sets with false-positive / false-negative review.
- Real LLM integration with structured output contracts and retry strategies.
- Per-user trust tuning so alfred_ gets more efficient without becoming reckless.
- Auditing and explanation tooling for internal review.

## Scope choices

I intentionally kept this prototype static and dependency-light so the challenge can be reviewed quickly. In a production version, I would move the model call and policy enforcement to a backend service, add telemetry, and deploy behind authenticated APIs.
