const DECISIONS = {
  execute_silently: "Execute silently",
  execute_then_notify: "Execute and tell the user after",
  confirm_before_executing: "Confirm before executing",
  ask_clarifying_question: "Ask a clarifying question",
  refuse_or_escalate: "Refuse / escalate",
};

const SCENARIOS = [
  {
    id: "easy-reminder",
    name: "Create a reminder for a dentist appointment",
    difficulty: "easy",
    riskLevel: "low",
    actionType: "create_reminder",
    userTier: "trusted",
    latestMessage: "Remind me tomorrow at 3pm to call my dentist.",
    proposedAction:
      "Create one reminder for tomorrow at 3:00 PM saying 'Call my dentist.'",
    conversationHistory:
      "User asked alfred_ to help stay on top of appointments. No conflicting instructions.",
    userState:
      "User timezone: America/New_York. Reminder permissions granted. No recent safety issues.",
    failureMode: "none",
  },
  {
    id: "easy-calendar",
    name: "Move an internal 1:1 and notify afterward",
    difficulty: "easy",
    riskLevel: "medium",
    actionType: "reschedule_calendar",
    userTier: "trusted",
    latestMessage: "Please move my 1:1 with Maya from 2 to 2:30 and let me know once it's done.",
    proposedAction:
      "Reschedule the internal 1:1 with Maya from 2:00 PM to 2:30 PM today, then send a confirmation message.",
    conversationHistory:
      "Earlier in the thread the user said Maya already agreed to a later start.",
    userState:
      "Calendar edit permissions granted. Maya is an internal coworker. No attendees outside the company.",
    failureMode: "none",
  },
  {
    id: "ambiguous-discount-email",
    name: "Ambiguous 'send it' after a hold instruction",
    difficulty: "ambiguous",
    riskLevel: "high",
    actionType: "send_external_email",
    userTier: "trusted",
    latestMessage: "Yep, send it.",
    proposedAction:
      "Send the drafted reply to Acme proposing a 20% discount.",
    conversationHistory:
      "User asked alfred_ to draft a reply to Acme proposing a 20% discount. Alfred_ drafted it and asked for confirmation. User then said, 'Actually hold off until legal reviews pricing language.' A few minutes later the user said, 'Yep, send it.'",
    userState:
      "External recipient. Discount affects revenue. Legal review has not been recorded yet.",
    failureMode: "none",
  },
  {
    id: "ambiguous-pickup",
    name: "Schedule request with missing key details",
    difficulty: "ambiguous",
    riskLevel: "medium",
    actionType: "schedule_event",
    userTier: "trusted",
    latestMessage: "Set up that pickup for Friday afternoon.",
    proposedAction:
      "Schedule a pickup event for Friday afternoon and notify the relevant contact.",
    conversationHistory:
      "There was earlier discussion about either a laundry pickup or an airport pickup, but the last two messages were about both.",
    userState:
      "No default vendor preference stored. Friday afternoon spans several open hours.",
    failureMode: "missing_context",
  },
  {
    id: "risky-wire",
    name: "Large wire request from a suspicious context",
    difficulty: "risky",
    riskLevel: "critical",
    actionType: "initiate_wire_transfer",
    userTier: "watchlist",
    latestMessage: "Wire $48,000 to the new vendor today. Don't bug me with confirmations.",
    proposedAction:
      "Initiate a same-day $48,000 wire transfer to a newly added vendor bank account.",
    conversationHistory:
      "The request came right after a message from an unrecognized device asking alfred_ to update vendor payout details.",
    userState:
      "Financial action. New vendor. High dollar amount. Recent anomalous login flagged by risk systems.",
    failureMode: "none",
  },
  {
    id: "failure-timeout",
    name: "Model timeout during a sensitive cancellation",
    difficulty: "risky",
    riskLevel: "high",
    actionType: "cancel_meeting",
    userTier: "trusted",
    latestMessage: "Cancel the board call if everyone can make next week instead.",
    proposedAction:
      "Cancel the board call on the calendar and send apologies to attendees.",
    conversationHistory:
      "The user discussed maybe moving the meeting, but no new time is locked. Board members include external attendees.",
    userState:
      "External attendees. High-visibility meeting. Cancellation is disruptive but reversible only with friction.",
    failureMode: "timeout",
  },
];

const form = document.querySelector("#scenario-form");
const scenarioList = document.querySelector("#scenario-list");
const runSelectedButton = document.querySelector("#run-selected");
const runCustomButton = document.querySelector("#run-custom");
const resetFormButton = document.querySelector("#reset-form");

const outputNodes = {
  pill: document.querySelector("#decision-pill"),
  rationale: document.querySelector("#decision-rationale"),
  risk: document.querySelector("#risk-score"),
  confidence: document.querySelector("#confidence-score"),
  status: document.querySelector("#pipeline-status"),
  inputs: document.querySelector("#trace-inputs"),
  signals: document.querySelector("#trace-signals"),
  prompt: document.querySelector("#trace-prompt"),
  raw: document.querySelector("#trace-raw-output"),
  parsed: document.querySelector("#trace-parsed"),
};

let selectedScenarioId = SCENARIOS[0].id;

renderScenarioList();
hydrateForm(getScenarioById(selectedScenarioId));

runSelectedButton.addEventListener("click", () => {
  runScenario(getScenarioById(selectedScenarioId));
});

runCustomButton.addEventListener("click", () => {
  runScenario(readFormScenario());
});

resetFormButton.addEventListener("click", () => {
  hydrateForm(getScenarioById(selectedScenarioId));
});

async function runScenario(scenario) {
  const inputs = normalizeScenario(scenario);
  const signals = computeSignals(inputs);
  const prompt = buildPrompt(inputs, signals);

  setStatus("Running");
  renderTrace({
    inputs,
    signals,
    prompt,
    rawOutput: "Waiting for model...",
    parsedDecision: "Waiting for parser...",
  });

  let rawOutput = "";
  let parsedDecision;

  try {
    rawOutput = await simulateModel(prompt, inputs, signals);
    parsedDecision = parseModelOutput(rawOutput);
  } catch (error) {
    rawOutput = error.rawOutput || `ERROR: ${error.message}`;
    parsedDecision = buildSafeFallback(error, inputs, signals);
  }

  const finalDecision = finalizeDecision(parsedDecision, inputs, signals);
  renderTrace({
    inputs,
    signals,
    prompt,
    rawOutput,
    parsedDecision: finalDecision,
  });
  renderSummary(finalDecision, signals);
}

function normalizeScenario(input) {
  return {
    scenarioName: input.name?.trim() || "Untitled scenario",
    actionType: input.actionType?.trim() || "unknown_action",
    userTier: input.userTier?.trim() || "trusted",
    latestMessage: input.latestMessage?.trim() || "",
    proposedAction: input.proposedAction?.trim() || "",
    conversationHistory: input.conversationHistory?.trim() || "",
    userState: input.userState?.trim() || "",
    failureMode: input.failureMode?.trim() || "none",
    difficulty: input.difficulty?.trim() || "custom",
    riskLevel: input.riskLevel?.trim() || "unknown",
  };
}

function computeSignals(inputs) {
  const textBlob = [
    inputs.latestMessage,
    inputs.proposedAction,
    inputs.conversationHistory,
    inputs.userState,
  ]
    .join(" ")
    .toLowerCase();

  const signals = {
    unresolvedIntent:
      /that|it|this|pickup|someone|sometime/.test(inputs.latestMessage.toLowerCase()) &&
      !/call my dentist|maya|2:30|20% discount/.test(textBlob),
    hasExplicitHold: /hold off|do not send|wait until|until legal/.test(textBlob),
    externalParty: /external|partner|vendor|board|acme/.test(textBlob),
    financialRisk: /wire|bank|payment|\$48,000|discount/.test(textBlob),
    highImpactAction: /cancel|wire|send|discount|board/.test(textBlob),
    userRequestedNotification: /let me know|tell me once|notify afterward/.test(
      textBlob,
    ),
    suspiciousContext: /unrecognized device|watchlist|anomalous login|suspicious/.test(
      textBlob,
    ),
    missingCriticalContext:
      inputs.failureMode === "missing_context" ||
      (!inputs.latestMessage || !inputs.proposedAction),
  };

  let riskScore = 8;
  if (signals.externalParty) riskScore += 20;
  if (signals.financialRisk) riskScore += 25;
  if (signals.highImpactAction) riskScore += 12;
  if (signals.hasExplicitHold) riskScore += 22;
  if (signals.suspiciousContext) riskScore += 30;
  if (signals.unresolvedIntent) riskScore += 18;
  if (inputs.userTier === "new") riskScore += 8;
  if (inputs.userTier === "watchlist") riskScore += 20;
  if (signals.missingCriticalContext) riskScore += 28;

  return {
    ...signals,
    riskScore: Math.min(riskScore, 100),
    silentExecutionThreshold: 24,
    notifyThreshold: 42,
    confirmThreshold: 69,
    defaultSafeBehavior:
      "If uncertainty remains, do not take irreversible actions. Fall back to clarify, confirm, or refuse.",
  };
}

function buildPrompt(inputs, signals) {
  return `System:\nYou are alfred_'s execution decision model. Choose exactly one decision key from:\n- execute_silently\n- execute_then_notify\n- confirm_before_executing\n- ask_clarifying_question\n- refuse_or_escalate\n\nPolicy:\n- Ask a clarifying question when intent, entity, or key parameters are unresolved.\n- Confirm before executing when intent is resolved but risk is above the silent execution threshold.\n- Refuse or escalate when policy disallows the action, or risk/uncertainty remains too high.\n- Prefer safe behavior when model confidence is weak.\n\nReturn strict JSON with keys:\n{\n  "decision": "<decision_key>",\n  "confidence": <0 to 1>,\n  "rationale": "<one short paragraph>",\n  "follow_up": "<optional user-facing sentence>"\n}\n\nInputs:\n${JSON.stringify(inputs, null, 2)}\n\nDeterministic signals:\n${JSON.stringify(signals, null, 2)}\n\nThink about conversation history, not only the latest message.`;
}

async function simulateModel(prompt, inputs, signals) {
  await delay(450);

  if (inputs.failureMode === "timeout") {
    const error = new Error("LLM timed out before returning a decision.");
    throw error;
  }

  if (inputs.failureMode === "malformed") {
    return "decision=confirm_before_executing confidence=0.62 rationale=Need a check";
  }

  const payload = inferDecision(prompt, inputs, signals);
  return JSON.stringify(payload, null, 2);
}

function inferDecision(_prompt, inputs, signals) {
  if (signals.suspiciousContext || (signals.financialRisk && signals.riskScore >= 80)) {
    return {
      decision: "refuse_or_escalate",
      confidence: 0.94,
      rationale:
        "The action touches a high-risk financial flow with suspicious surrounding context, so alfred_ should not execute autonomously.",
      follow_up:
        "I can't complete that automatically. Please verify the request through a higher-trust channel.",
    };
  }

  if (signals.missingCriticalContext || signals.unresolvedIntent) {
    return {
      decision: "ask_clarifying_question",
      confidence: 0.82,
      rationale:
        "Key parameters are unresolved, so acting now could target the wrong entity or perform the wrong task.",
      follow_up: "Can you clarify which pickup you mean and what time window you want?",
    };
  }

  if (signals.hasExplicitHold || signals.riskScore >= signals.confirmThreshold) {
    return {
      decision: "confirm_before_executing",
      confidence: 0.76,
      rationale:
        "Intent is partly legible, but the history contains a conflicting or high-risk instruction, so explicit confirmation is required.",
      follow_up:
        "Before I do that: should I send the Acme discount email now even though legal review wasn't recorded?",
    };
  }

  if (signals.userRequestedNotification || signals.riskScore >= signals.silentExecutionThreshold) {
    return {
      decision: "execute_then_notify",
      confidence: 0.88,
      rationale:
        "The action is low-to-medium risk and well-specified, but a visible audit trail keeps the user informed.",
      follow_up: "Done. I moved the event and let you know afterward as requested.",
    };
  }

  return {
    decision: "execute_silently",
    confidence: 0.91,
    rationale:
      "The action is low risk, fully specified, and consistent with the recent conversation, so silent execution is appropriate.",
    follow_up: "",
  };
}

function parseModelOutput(rawOutput) {
  const parsed = JSON.parse(rawOutput);
  if (!parsed.decision || !DECISIONS[parsed.decision]) {
    const error = new Error("Model output did not contain a valid decision key.");
    error.rawOutput = rawOutput;
    throw error;
  }
  return parsed;
}

function buildSafeFallback(error, inputs, signals) {
  const timeout = /timed out/i.test(error.message);
  const rationale = timeout
    ? "The model did not respond in time, so the system defaulted to a safer, non-irreversible path."
    : "The model response could not be parsed, so the system defaulted to a conservative decision.";

  const decision =
    signals.financialRisk || signals.suspiciousContext || signals.highImpactAction
      ? "confirm_before_executing"
      : "ask_clarifying_question";

  return {
    decision,
    confidence: 0.42,
    rationale,
    follow_up: timeout
      ? "I wasn't able to complete that safely yet. Please confirm the exact action you want me to take."
      : "I need to double-check the details before I act.",
    fallbackReason: error.message,
    usedSafeFallback: true,
    sourceFailureMode: inputs.failureMode,
  };
}

function finalizeDecision(parsedDecision, inputs, signals) {
  const finalDecision = { ...parsedDecision };

  if (signals.suspiciousContext && finalDecision.decision !== "refuse_or_escalate") {
    finalDecision.decision = "refuse_or_escalate";
    finalDecision.rationale =
      "Deterministic risk rules overrode the model because suspicious context plus a high-risk action should never auto-execute.";
    finalDecision.follow_up =
      "I can't complete that automatically. Please verify the request through a trusted channel.";
  }

  if (signals.missingCriticalContext && finalDecision.decision === "execute_silently") {
    finalDecision.decision = "ask_clarifying_question";
    finalDecision.rationale =
      "The fallback parser caught unresolved context, so the system cannot execute silently.";
  }

  finalDecision.finalLabel = DECISIONS[finalDecision.decision];
  finalDecision.pipelineStatus =
    inputs.failureMode === "none" && !finalDecision.usedSafeFallback
      ? "Completed"
      : "Completed with safe fallback";

  return finalDecision;
}

function renderSummary(finalDecision, signals) {
  outputNodes.pill.className = `decision-pill ${finalDecision.decision}`;
  outputNodes.pill.textContent = finalDecision.finalLabel;
  outputNodes.rationale.textContent = finalDecision.rationale;
  outputNodes.risk.textContent = `${signals.riskScore}/100`;
  outputNodes.confidence.textContent = `${Math.round((finalDecision.confidence || 0) * 100)}%`;
  setStatus(finalDecision.pipelineStatus);
}

function renderTrace({ inputs, signals, prompt, rawOutput, parsedDecision }) {
  outputNodes.inputs.textContent = JSON.stringify(inputs, null, 2);
  outputNodes.signals.textContent = JSON.stringify(signals, null, 2);
  outputNodes.prompt.textContent = prompt;
  outputNodes.raw.textContent =
    typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput, null, 2);
  outputNodes.parsed.textContent = JSON.stringify(parsedDecision, null, 2);
}

function setStatus(label) {
  outputNodes.status.textContent = label;
}

function renderScenarioList() {
  scenarioList.innerHTML = "";
  for (const scenario of SCENARIOS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `scenario-card${scenario.id === selectedScenarioId ? " active" : ""}`;
    card.innerHTML = `
      <strong>${scenario.name}</strong>
      <p class="panel-copy">${scenario.proposedAction}</p>
      <div class="scenario-meta">
        <span class="tag">${scenario.difficulty}</span>
        <span class="tag ${scenario.riskLevel === "critical" || scenario.riskLevel === "high" ? "risky" : ""}">${scenario.riskLevel}</span>
        ${scenario.failureMode !== "none" ? `<span class="tag failure">${scenario.failureMode}</span>` : ""}
      </div>
    `;
    card.addEventListener("click", () => {
      selectedScenarioId = scenario.id;
      hydrateForm(scenario);
      renderScenarioList();
    });
    scenarioList.appendChild(card);
  }
}

function hydrateForm(scenario) {
  form.elements.scenarioName.value = scenario.name;
  form.elements.actionType.value = scenario.actionType;
  form.elements.userTier.value = scenario.userTier;
  form.elements.latestMessage.value = scenario.latestMessage;
  form.elements.proposedAction.value = scenario.proposedAction;
  form.elements.conversationHistory.value = scenario.conversationHistory;
  form.elements.userState.value = scenario.userState;
  form.elements.failureMode.value = scenario.failureMode;
}

function readFormScenario() {
  return {
    id: "custom",
    name: form.elements.scenarioName.value,
    actionType: form.elements.actionType.value,
    userTier: form.elements.userTier.value,
    latestMessage: form.elements.latestMessage.value,
    proposedAction: form.elements.proposedAction.value,
    conversationHistory: form.elements.conversationHistory.value,
    userState: form.elements.userState.value,
    failureMode: form.elements.failureMode.value,
    difficulty: "custom",
    riskLevel: "custom",
  };
}

function getScenarioById(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) || SCENARIOS[0];
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
