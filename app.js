const DECISIONS = {
  execute_silently: "Execute silently",
  execute_then_notify: "Execute and tell the user after",
  confirm_before_executing: "Confirm before executing",
  ask_clarifying_question: "Ask a clarifying question",
  refuse_or_escalate: "Refuse / escalate",
};

const TRACE_META = {
  inputs: {
    title: "Inputs",
    caption: "The structured request and user state being evaluated.",
  },
  signals: {
    title: "Computed signals",
    caption: "Risk, ambiguity, and policy clues extracted deterministically.",
  },
  prompt: {
    title: "Prompt",
    caption: "The exact bounded instruction sent to the model layer.",
  },
  raw: {
    title: "Raw model output",
    caption: "The response before parsing, validation, or fallback logic.",
  },
  parsed: {
    title: "Parsed decision",
    caption: "The final normalized verdict after validation and overrides.",
  },
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
    latestMessage:
      "Please move my 1:1 with Maya from 2 to 2:30 and let me know once it's done.",
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
    latestMessage:
      "Wire $48,000 to the new vendor today. Don't bug me with confirmations.",
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

const TRACE_ORDER = ["inputs", "signals", "prompt", "raw", "parsed"];

const form = document.querySelector("#scenario-form");
const scenarioList = document.querySelector("#scenario-list");
const filterPills = document.querySelector("#filter-pills");
const searchInput = document.querySelector("#scenario-search");
const runCustomButton = document.querySelector("#run-custom");
const resetFormButton = document.querySelector("#reset-form");
const traceTabs = document.querySelector("#trace-tabs");
const copyTraceButton = document.querySelector("#copy-trace");
const pipelineToggleButton = document.querySelector("#pipeline-toggle");
const traceToggleButton = document.querySelector("#trace-toggle");
const pipelineContent = document.querySelector("#pipeline-content");
const traceContentPanel = document.querySelector("#trace-content-panel");
const resultsToggleButton = document.querySelector("#results-toggle");
const resultsContent = document.querySelector("#results-content");

const outputNodes = {
  selectedName: document.querySelector("#selected-scenario-name"),
  selectedSummary: document.querySelector("#selected-scenario-summary"),
  title: document.querySelector("#decision-title"),
  subnote: document.querySelector("#decision-subnote"),
  mode: document.querySelector("#decision-mode"),
  pill: document.querySelector("#decision-pill"),
  rationale: document.querySelector("#decision-rationale"),
  followup: document.querySelector("#decision-followup"),
  risk: document.querySelector("#risk-score"),
  riskFill: document.querySelector("#risk-fill"),
  confidence: document.querySelector("#confidence-score"),
  status: document.querySelector("#pipeline-status"),
  signalBadges: document.querySelector("#signal-badges"),
  confidenceDial: document.querySelector("#confidence-dial"),
  confidenceDialValue: document.querySelector("#confidence-dial-value"),
  thresholdCurrentLabel: document.querySelector("#threshold-current-label"),
  thresholdMarker: document.querySelector("#threshold-marker"),
  thresholdSilent: document.querySelector("#threshold-silent"),
  thresholdNotify: document.querySelector("#threshold-notify"),
  thresholdConfirm: document.querySelector("#threshold-confirm"),
  signalImpactChart: document.querySelector("#signal-impact-chart"),
  signalImpactDetail: document.querySelector("#signal-impact-detail"),
  pipeline: document.querySelector("#pipeline-steps"),
  traceTitle: document.querySelector("#trace-title"),
  traceCaption: document.querySelector("#trace-caption"),
  traceContent: document.querySelector("#trace-content"),
};

let selectedScenarioId = SCENARIOS[0].id;
let activeFilter = "all";
let activeTrace = "inputs";
let latestTrace = buildEmptyTrace();
let running = false;

renderScenarioList();
hydrateForm(getScenarioById(selectedScenarioId));
updateSelectedScenarioSummary(getScenarioById(selectedScenarioId));
renderTrace(latestTrace);
renderSignalBadges([]);
updatePipelineView("idle");
resultsContent.hidden = true;
pipelineContent.hidden = true;
traceContentPanel.hidden = true;

runCustomButton.addEventListener("click", () => {
  prepareRunUI();
  window.requestAnimationFrame(() => {
    runScenario(readFormScenario());
  });
});

resetFormButton.addEventListener("click", () => {
  hydrateForm(getScenarioById(selectedScenarioId));
  resetDecisionUI();
});

filterPills.addEventListener("click", (event) => {
  const pill = event.target.closest("[data-filter]");
  if (!pill) return;
  activeFilter = pill.dataset.filter;
  renderScenarioList();
});

searchInput.addEventListener("input", () => {
  renderScenarioList();
});

traceTabs.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-trace]");
  if (!tab) return;
  activeTrace = tab.dataset.trace;
  renderTrace(latestTrace);
});

copyTraceButton.addEventListener("click", async () => {
  const traceText = latestTrace[activeTrace];
  if (!navigator.clipboard || !traceText) return;
  await navigator.clipboard.writeText(traceText);
  copyTraceButton.textContent = "Copied";
  window.setTimeout(() => {
    copyTraceButton.textContent = "Copy Current Panel";
  }, 1200);
});

pipelineToggleButton.addEventListener("click", () => {
  toggleExpandableSection(pipelineToggleButton, pipelineContent, "Show pipeline", "Hide pipeline");
});

traceToggleButton.addEventListener("click", () => {
  toggleExpandableSection(traceToggleButton, traceContentPanel, "Show artifacts", "Hide artifacts");
});

resultsToggleButton.addEventListener("click", () => {
  toggleResultsSection(resultsToggleButton.getAttribute("aria-expanded") !== "true");
});

async function runScenario(scenario) {
  const inputs = normalizeScenario(scenario);
  const signals = computeSignals(inputs);
  const prompt = buildPrompt(inputs, signals);

  setRunning(true);
  updatePipelineView("running");
  renderSignalBadges(buildSignalCards(signals));
  latestTrace = {
    inputs: JSON.stringify(inputs, null, 2),
    signals: JSON.stringify(signals, null, 2),
    prompt,
    raw: "Waiting for model...",
    parsed: "Waiting for parser and finalizer...",
  };
  renderTrace(latestTrace);
  renderSummary({
    finalLabel: "Evaluating...",
    decision: "",
    confidence: 0,
    rationale:
      "The pipeline is computing risk signals and preparing a bounded decision for the model layer.",
    follow_up: "No user-facing follow-up yet.",
    pipelineStatus: "Running",
  }, signals);
  if (pipelineContent.hidden) {
    toggleExpandableSection(
      pipelineToggleButton,
      pipelineContent,
      "Show pipeline",
      "Hide pipeline",
      true,
    );
  }
  if (traceContentPanel.hidden) {
    toggleExpandableSection(
      traceToggleButton,
      traceContentPanel,
      "Show artifacts",
      "Hide artifacts",
      true,
    );
  }
  renderDecisionGraphs(signals, {
    confidence: 0,
    finalLabel: "Evaluating...",
    decision: "",
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
  latestTrace = {
    inputs: JSON.stringify(inputs, null, 2),
    signals: JSON.stringify(signals, null, 2),
    prompt,
    raw: typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput, null, 2),
    parsed: JSON.stringify(finalDecision, null, 2),
  };
  renderTrace(latestTrace);
  renderSummary(finalDecision, signals);
  renderDecisionGraphs(signals, finalDecision);
  renderSignalBadges(buildSignalCards(signals, finalDecision));
  updatePipelineView(finalDecision.usedSafeFallback ? "fallback" : "complete");
  setRunning(false);
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
  return `System:
You are alfred_'s execution decision model. Choose exactly one decision key from:
- execute_silently
- execute_then_notify
- confirm_before_executing
- ask_clarifying_question
- refuse_or_escalate

Policy:
- Ask a clarifying question when intent, entity, or key parameters are unresolved.
- Confirm before executing when intent is resolved but risk is above the silent execution threshold.
- Refuse or escalate when policy disallows the action, or risk/uncertainty remains too high.
- Prefer safe behavior when model confidence is weak.

Return strict JSON with keys:
{
  "decision": "<decision_key>",
  "confidence": <0 to 1>,
  "rationale": "<one short paragraph>",
  "follow_up": "<optional user-facing sentence>"
}

Inputs:
${JSON.stringify(inputs, null, 2)}

Deterministic signals:
${JSON.stringify(signals, null, 2)}

Think about conversation history, not only the latest message.`;
}

async function simulateModel(prompt, inputs, signals) {
  await delay(220);

  if (inputs.failureMode === "timeout") {
    throw new Error("LLM timed out before returning a decision.");
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
  outputNodes.title.textContent = finalDecision.finalLabel;
  outputNodes.subnote.textContent =
    finalDecision.pipelineStatus === "Idle"
      ? "Idle: run the decision layer to see results."
      : `Status: ${finalDecision.pipelineStatus}.`;
  outputNodes.mode.textContent = finalDecision.finalLabel;
  outputNodes.pill.className = `decision-pill ${finalDecision.decision || ""}`;
  outputNodes.pill.textContent = finalDecision.pipelineStatus || "Idle";
  outputNodes.rationale.textContent = finalDecision.rationale;
  outputNodes.followup.textContent = finalDecision.follow_up || "No additional follow-up needed.";
  outputNodes.risk.textContent = `${signals.riskScore}/100`;
  outputNodes.riskFill.style.width = `${signals.riskScore}%`;
  outputNodes.confidence.textContent = `${Math.round((finalDecision.confidence || 0) * 100)}%`;
  outputNodes.status.textContent = finalDecision.pipelineStatus;
}

function renderSignalBadges(cards) {
  outputNodes.signalBadges.innerHTML = "";
  if (!cards.length) {
    outputNodes.signalBadges.innerHTML =
      '<div class="empty-state">Run a scenario to see which signals affected the final decision.</div>';
    return;
  }

  for (const card of cards) {
    const node = document.createElement("article");
    node.className = "signal-badge";
    node.innerHTML = `<strong>${card.title}</strong><span>${card.body}</span>`;
    outputNodes.signalBadges.appendChild(node);
  }
}

function renderDecisionGraphs(signals, finalDecision) {
  const confidencePct = Math.round((finalDecision.confidence || 0) * 100);
  outputNodes.confidenceDial.style.setProperty("--dial-value", `${confidencePct * 3.6}deg`);
  outputNodes.confidenceDialValue.textContent = `${confidencePct}%`;

  outputNodes.thresholdCurrentLabel.textContent = `Current risk: ${signals.riskScore}/100`;
  outputNodes.thresholdSilent.textContent = `Silent <= ${signals.silentExecutionThreshold}`;
  outputNodes.thresholdNotify.textContent = `Notify <= ${signals.notifyThreshold}`;
  outputNodes.thresholdConfirm.textContent = `Confirm <= ${signals.confirmThreshold}`;
  outputNodes.thresholdMarker.style.left = `${signals.riskScore}%`;

  const contributions = buildSignalContributions(signals, finalDecision);
  renderSignalImpactChart(contributions, finalDecision);
}

function renderSignalImpactChart(contributions, finalDecision) {
  outputNodes.signalImpactChart.innerHTML = "";

  if (!contributions.length) {
    outputNodes.signalImpactChart.innerHTML =
      '<div class="empty-state">Run a scenario to see which signals pushed the decision.</div>';
    outputNodes.signalImpactDetail.textContent =
      "Hover or click a bar to inspect why it influenced the decision.";
    return;
  }

  const maxValue = Math.max(...contributions.map((item) => item.value), 1);

  contributions.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "impact-row";
    row.innerHTML = `
      <span class="impact-label">${item.label}</span>
      <div class="impact-bar-wrap">
        <div
          class="impact-bar ${item.tone}"
          style="width:${Math.max((item.value / maxValue) * 100, 6)}%"
          role="button"
          tabindex="0"
          aria-label="${item.label}: ${item.value} points"
        ></div>
      </div>
      <span class="impact-score">${item.value}</span>
    `;

    const bar = row.querySelector(".impact-bar");
    const setActive = () => {
      outputNodes.signalImpactChart
        .querySelectorAll(".impact-bar")
        .forEach((node) => node.classList.remove("active"));
      bar.classList.add("active");
      outputNodes.signalImpactDetail.textContent = `${item.label}: ${item.description}`;
    };

    bar.addEventListener("mouseenter", setActive);
    bar.addEventListener("focus", setActive);
    bar.addEventListener("click", setActive);
    bar.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActive();
      }
    });

    outputNodes.signalImpactChart.appendChild(row);

    if (index === 0) {
      setActive();
    }
  });
}

function renderTrace(trace) {
  latestTrace = trace;

  for (const tab of traceTabs.querySelectorAll(".trace-tab")) {
    tab.classList.toggle("active", tab.dataset.trace === activeTrace);
  }

  const meta = TRACE_META[activeTrace];
  outputNodes.traceTitle.textContent = meta.title;
  outputNodes.traceCaption.textContent = meta.caption;
  outputNodes.traceContent.textContent = trace[activeTrace];
}

function updatePipelineView(state) {
  const steps = [...outputNodes.pipeline.querySelectorAll(".pipeline-step")];

  steps.forEach((step, index) => {
    step.classList.remove("active", "complete", "fallback");
    if (state === "idle") return;
    if (state === "running" && index <= 2) {
      step.classList.add(index === 2 ? "active" : "complete");
    }
    if (state === "complete") {
      step.classList.add("complete");
    }
    if (state === "fallback") {
      if (index < 3) step.classList.add("complete");
      if (index === 3) step.classList.add("fallback", "active");
    }
  });
}

function renderScenarioList() {
  scenarioList.innerHTML = "";

  for (const pill of filterPills.querySelectorAll(".filter-pill")) {
    pill.classList.toggle("active", pill.dataset.filter === activeFilter);
  }

  const searchTerm = searchInput.value.trim().toLowerCase();
  const visibleScenarios = SCENARIOS.filter((scenario) => {
    const matchesFilter =
      activeFilter === "all" ||
      scenario.difficulty === activeFilter ||
      (activeFilter === "failure" && scenario.failureMode !== "none");

    const haystack = [
      scenario.name,
      scenario.proposedAction,
      scenario.latestMessage,
      scenario.actionType,
    ]
      .join(" ")
      .toLowerCase();

    return matchesFilter && (!searchTerm || haystack.includes(searchTerm));
  });

  if (!visibleScenarios.length) {
    scenarioList.innerHTML =
      '<div class="empty-state">No scenarios match that filter. Try another category or search term.</div>';
    return;
  }

  for (const scenario of visibleScenarios) {
    const previewSignals = computeSignals(normalizeScenario(scenario));
    const previewRiskLevel = deriveRiskLevel(previewSignals.riskScore);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `scenario-card${scenario.id === selectedScenarioId ? " active" : ""}`;
    card.innerHTML = `
      <div class="scenario-card-header">
        <strong>${scenario.name}</strong>
        <span class="tag ${toneForRisk(previewRiskLevel)}">${previewRiskLevel}</span>
      </div>
      <p class="panel-copy">${scenario.proposedAction}</p>
      <div class="scenario-meta">
        <span class="tag ${toneForDifficulty(scenario.difficulty)}">${scenario.difficulty}</span>
        <span class="tag">${scenario.actionType}</span>
        ${scenario.failureMode !== "none" ? `<span class="tag warn">${scenario.failureMode}</span>` : ""}
      </div>
    `;
    card.addEventListener("click", () => {
      selectedScenarioId = scenario.id;
      hydrateForm(scenario);
      updateSelectedScenarioSummary(scenario);
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

function updateSelectedScenarioSummary(scenario) {
  outputNodes.selectedName.textContent = scenario.name;
  outputNodes.selectedSummary.textContent = scenario.proposedAction;
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

function buildSignalCards(signals, finalDecision = null) {
  const cards = [];

  if (signals.riskScore < signals.silentExecutionThreshold) {
    cards.push({
      title: "Below silent execution threshold",
      body: "The deterministic risk score is low enough that alfred_ can usually act without extra friction.",
    });
  }
  if (signals.userRequestedNotification) {
    cards.push({
      title: "User requested visibility",
      body: "The language explicitly asks to be told after execution, which nudges the system toward a notify-after path.",
    });
  }
  if (signals.unresolvedIntent || signals.missingCriticalContext) {
    cards.push({
      title: "Critical context is missing",
      body: "Intent or key parameters are not fully grounded, so clarification is safer than guessing.",
    });
  }
  if (signals.hasExplicitHold) {
    cards.push({
      title: "Conflicting history detected",
      body: "Prior conversation includes a hold or wait instruction, so the latest message should not be treated in isolation.",
    });
  }
  if (signals.externalParty) {
    cards.push({
      title: "External stakeholders are involved",
      body: "Actions touching partners, vendors, or board members deserve more scrutiny than internal admin tasks.",
    });
  }
  if (signals.financialRisk || signals.suspiciousContext) {
    cards.push({
      title: "High-risk policy signal",
      body: "Financial actions or suspicious account context trigger the strongest guardrails and may override the model.",
    });
  }
  if (finalDecision?.usedSafeFallback) {
    cards.push({
      title: "Safe fallback was used",
      body: "The system recovered conservatively from a timeout or malformed response instead of risking irreversible execution.",
    });
  }

  return cards.slice(0, 6);
}

function buildSignalContributions(signals, finalDecision) {
  const items = [];

  if (signals.externalParty) {
    items.push({
      label: "External party",
      value: 20,
      tone: "warn",
      description:
        "External recipients or stakeholders raise the scrutiny level because errors are more visible and harder to reverse.",
    });
  }
  if (signals.financialRisk) {
    items.push({
      label: "Financial risk",
      value: 25,
      tone: "danger",
      description:
        "Pricing, payment, or transfer language materially increases the chance of irreversible harm.",
    });
  }
  if (signals.highImpactAction) {
    items.push({
      label: "High-impact action",
      value: 12,
      tone: "warn",
      description:
        "Actions like send, cancel, or wire can change outside systems and deserve more care than a low-stakes reminder.",
    });
  }
  if (signals.hasExplicitHold) {
    items.push({
      label: "Conflicting history",
      value: 22,
      tone: "danger",
      description:
        "A previous hold or wait instruction means the latest user message should not be interpreted in isolation.",
    });
  }
  if (signals.suspiciousContext) {
    items.push({
      label: "Suspicious context",
      value: 30,
      tone: "danger",
      description:
        "Risk systems or anomalous context can override the model entirely and force a refusal or escalation path.",
    });
  }
  if (signals.unresolvedIntent) {
    items.push({
      label: "Unresolved intent",
      value: 18,
      tone: "warn",
      description:
        "References like 'that' or 'it' create ambiguity around what should actually happen next.",
    });
  }
  if (signals.missingCriticalContext) {
    items.push({
      label: "Missing context",
      value: 28,
      tone: "danger",
      description:
        "Key parameters are absent, so the system should clarify instead of guessing.",
    });
  }
  if (signals.userRequestedNotification) {
    items.push({
      label: "Requested visibility",
      value: 10,
      tone: "safe",
      description:
        "The user explicitly asked to be told afterward, which nudges the experience toward a notify-after execution path.",
    });
  }
  if (!items.length) {
    items.push({
      label: "Low-risk baseline",
      value: 8,
      tone: "safe",
      description:
        "No strong risk flags were detected, so the baseline score stays low and silent execution remains viable.",
    });
  }
  if (finalDecision.usedSafeFallback) {
    items.unshift({
      label: "Safe fallback",
      value: 16,
      tone: "warn",
      description:
        "The system used a conservative fallback because the model timed out or returned malformed output.",
    });
  }

  return items.sort((a, b) => b.value - a.value).slice(0, 6);
}

function buildEmptyTrace() {
  return {
    inputs: "Run a scenario to inspect the normalized input payload.",
    signals: "Run a scenario to inspect the computed deterministic signals.",
    prompt: "Run a scenario to inspect the exact prompt passed to the model layer.",
    raw: "Run a scenario to inspect the raw output before parsing.",
    parsed: "Run a scenario to inspect the final parsed decision object.",
  };
}

function toneForRisk(riskLevel) {
  if (riskLevel === "low") return "success";
  if (riskLevel === "high" || riskLevel === "critical") return "danger";
  return "warn";
}

function deriveRiskLevel(riskScore) {
  if (riskScore >= 80) return "critical";
  if (riskScore >= 55) return "high";
  if (riskScore >= 25) return "medium";
  return "low";
}

function toneForDifficulty(difficulty) {
  if (difficulty === "easy") return "success";
  if (difficulty === "risky") return "danger";
  return "warn";
}

function getScenarioById(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) || SCENARIOS[0];
}

function setRunning(value) {
  running = value;
  runCustomButton.disabled = value;
  runCustomButton.textContent = value ? "Running..." : "Run Decision Layer";
}

function prepareRunUI() {
  toggleResultsSection(true);
  if (pipelineContent.hidden) {
    toggleExpandableSection(
      pipelineToggleButton,
      pipelineContent,
      "Show pipeline",
      "Hide pipeline",
      true,
    );
  }
  if (traceContentPanel.hidden) {
    toggleExpandableSection(
      traceToggleButton,
      traceContentPanel,
      "Show artifacts",
      "Hide artifacts",
      true,
    );
  }
}

function toggleResultsSection(forceExpanded) {
  resultsToggleButton.setAttribute("aria-expanded", String(forceExpanded));
  resultsContent.hidden = !forceExpanded;
  const icon = document.querySelector("#results-toggle-icon");
  if (icon) {
    icon.textContent = forceExpanded ? "−" : "+";
  }
}

function resetDecisionUI() {
  latestTrace = buildEmptyTrace();
  activeTrace = "inputs";
  renderTrace(latestTrace);
  renderSignalBadges([]);
  renderDecisionGraphs(
    {
      riskScore: 0,
      silentExecutionThreshold: 24,
      notifyThreshold: 42,
      confirmThreshold: 69,
    },
    {
      confidence: 0,
      finalLabel: "Awaiting run",
      decision: "",
      pipelineStatus: "Idle",
      rationale: "Select a preloaded scenario or edit the form and run the pipeline.",
      follow_up: "None yet.",
    },
  );
  renderSummary(
    {
      finalLabel: "Awaiting run",
      decision: "",
      confidence: 0,
      pipelineStatus: "Idle",
      rationale: "Select a preloaded scenario or edit the form and run the pipeline.",
      follow_up: "None yet.",
    },
    {
      riskScore: 0,
    },
  );
  updatePipelineView("idle");
  toggleResultsSection(false);
  toggleExpandableSection(
    pipelineToggleButton,
    pipelineContent,
    "Show pipeline",
    "Hide pipeline",
    false,
  );
  toggleExpandableSection(
    traceToggleButton,
    traceContentPanel,
    "Show artifacts",
    "Hide artifacts",
    false,
  );
}

function toggleExpandableSection(button, content, closedLabel, openLabel, forceExpanded = null) {
  const nextExpanded =
    forceExpanded ?? (button.getAttribute("aria-expanded") !== "true");
  button.setAttribute("aria-expanded", String(nextExpanded));
  button.querySelector("span").textContent = nextExpanded ? openLabel : closedLabel;
  button.querySelector(".panel-toggle-icon").textContent = nextExpanded ? "−" : "+";
  content.hidden = !nextExpanded;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
