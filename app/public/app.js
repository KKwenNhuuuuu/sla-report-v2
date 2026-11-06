const form = document.getElementById("report-form");
const statusEl = document.getElementById("report-status");
const generateButton = document.getElementById("generate-button");
const summarySection = document.getElementById("summary-section");
const detailsSection = document.getElementById("details-section");
const kpiGrid = document.getElementById("kpi-grid");
const responderGrid = document.getElementById("responder-grid");
const reportPeriod = document.getElementById("report-period");
const requestCount = document.getElementById("request-count");
const detailsBody = document.getElementById("details-body");
const lastUpdated = document.getElementById("last-updated");
const slaTab = document.getElementById("sla-tab");
const requestsTab = document.getElementById("requests-tab");
const slaPanel = document.getElementById("sla-panel");
const requestsPanel = document.getElementById("requests-panel");
const requestsForm = document.getElementById("requests-form");
const requestsStatus = document.getElementById("requests-status");
const requestsSubmit = document.getElementById("requests-submit");
const requestsResults = document.getElementById("requests-results");
const requestsCount = document.getElementById("requests-count");
const requestsBody = document.getElementById("requests-body");
let isLoadingRequests = false;

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function addKpi(label, value, footnote, accent = "") {
  const card = createElement("article", `kpi-card${accent ? ` accent-${accent}` : ""}`);
  card.append(
    createElement("p", "kpi-label", label),
    createElement("p", "kpi-value", value),
    createElement("p", "kpi-footnote", footnote)
  );
  kpiGrid.appendChild(card);
}

function addResponder(responder) {
  const card = createElement("article", "responder-card");
  card.appendChild(createElement("h4", "responder-name", responder.name ?? `Responder ${responder.id}`));

  const stats = createElement("div", "responder-stats");
  stats.append(
    createStat("Requests", responder.requests),
    createStat("Within target", responder.within_target),
    createStat("Late completions", responder.completed_late)
  );
  card.appendChild(stats);
  responderGrid.appendChild(card);
}

function createStat(label, value) {
  const stat = createElement("div", "responder-stat");
  stat.append(
    createElement("strong", "", String(value)),
    createElement("span", "", label)
  );
  return stat;
}

function addPill(value, trueLabel, falseLabel) {
  const isUnknown = value === null || value === undefined;
  const className = isUnknown ? "status-neutral" : value ? "status-good" : "status-bad";
  const label = isUnknown ? "—" : value ? trueLabel : falseLabel;
  return createElement("span", `status-pill ${className}`, label);
}

function renderReport(data) {
  if (!data || !Array.isArray(data.requests) || !Array.isArray(data.responders)) {
    throw new Error("The server returned an invalid report.");
  }

  const requests = data.requests;
  const responded = requests.filter((request) => request.responder_id !== null).length;
  const withTargetResult = requests.filter((request) => request.within_target !== null);
  const withinTarget = withTargetResult.filter((request) => request.within_target === true).length;
  const lateCompletions = requests.filter((request) => request.completed_late === true).length;
  const targetRate = withTargetResult.length
    ? `${Math.round((withinTarget / withTargetResult.length) * 100)}%`
    : "—";

  kpiGrid.replaceChildren();
  responderGrid.replaceChildren();
  detailsBody.replaceChildren();

  addKpi("Total requests", requests.length, "In the selected reporting period");
  addKpi("Requests responded to", responded, "At least one recorded staff response");
  addKpi("Within target", targetRate, `${withinTarget} of ${withTargetResult.length} with a response`);
  addKpi("Late completions", lateCompletions, "Completed after the latest deadline", lateCompletions ? "red" : "green");

  if (data.responders.length) {
    data.responders.forEach(addResponder);
  } else {
    responderGrid.appendChild(createElement("p", "empty-summary", "No responders in this reporting period."));
  }

  if (requests.length) {
    for (const request of requests) {
      const row = document.createElement("tr");
      const idCell = createElement("td", "request-id", String(request.id));
      const responderCell = createElement("td", "responder-cell", request.responder ?? "—");
      const responseCell = createElement(
        "td",
        "",
        request.response_business_minutes === null
          ? "—"
          : `${request.response_business_minutes} min`
      );
      const targetCell = document.createElement("td");
      targetCell.appendChild(addPill(request.within_target, "Yes", "No"));
      const lateCell = document.createElement("td");
      lateCell.appendChild(addPill(request.completed_late, "Late", "On time"));
      row.append(idCell, responderCell, responseCell, targetCell, lateCell);
      detailsBody.appendChild(row);
    }
  } else {
    const row = document.createElement("tr");
    const cell = createElement("td", "empty-summary", "No requests found for this period.");
    cell.colSpan = 5;
    row.appendChild(cell);
    detailsBody.appendChild(row);
  }

  reportPeriod.textContent = `${data.from} to ${data.to}`;
  requestCount.textContent = `${requests.length} requests`;
  summarySection.hidden = false;
  detailsSection.hidden = false;
  lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

function setActiveTab(activeTab) {
  const isSlaTab = activeTab === slaTab;
  slaTab.setAttribute("aria-selected", String(isSlaTab));
  slaTab.tabIndex = isSlaTab ? 0 : -1;
  requestsTab.setAttribute("aria-selected", String(!isSlaTab));
  requestsTab.tabIndex = isSlaTab ? -1 : 0;
  slaPanel.hidden = !isSlaTab;
  requestsPanel.hidden = isSlaTab;
}

function renderRequestRows(requests) {
  requestsBody.replaceChildren();

  if (!requests.length) {
    const row = document.createElement("tr");
    const cell = createElement("td", "empty-summary", "No requests match these filters.");
    cell.colSpan = 7;
    row.appendChild(cell);
    requestsBody.appendChild(row);
    return;
  }

  for (const request of requests) {
    const row = document.createElement("tr");
    const targetCell = document.createElement("td");
    targetCell.appendChild(addPill(request.within_target, "Yes", "No"));
    const lateCell = document.createElement("td");
    lateCell.appendChild(addPill(request.completed_late, "Late", "On time"));
    row.append(
      createElement("td", "request-id", String(request.id)),
      createElement("td", "", String(request.site_id)),
      createElement("td", "responder-cell", request.responder ?? "—"),
      createElement("td", "", request.responder_id === null ? "—" : String(request.responder_id)),
      createElement(
        "td",
        "",
        request.response_business_minutes === null
          ? "—"
          : `${request.response_business_minutes} min`
      ),
      targetCell,
      lateCell
    );
    requestsBody.appendChild(row);
  }
}

async function loadRequests() {
  if (isLoadingRequests) return;
  isLoadingRequests = true;
  requestsStatus.className = "report-status is-loading";
  requestsStatus.textContent = "Loading requests...";
  requestsSubmit.disabled = true;

  try {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(requestsForm)) {
      if (value) params.set(key, value);
    }

    const response = await fetch(`/api/requests?${params}`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status}).`);
    }
    if (!result || !Array.isArray(result.data)) {
      throw new Error("The server returned an invalid request list.");
    }

    renderRequestRows(result.data);
    requestsCount.textContent = `${result.data.length} requests shown`;
    requestsResults.hidden = false;
    requestsStatus.className = "report-status is-success";
    requestsStatus.textContent = "Requests loaded.";
  } catch (error) {
    console.error("Error fetching requests:", error);
    requestsStatus.className = "report-status is-error";
    requestsStatus.textContent = error instanceof Error
      ? error.message
      : "Unable to load requests. Please try again.";
  } finally {
    isLoadingRequests = false;
    requestsSubmit.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.className = "report-status is-loading";
  statusEl.textContent = "Generating report...";
  generateButton.disabled = true;

  try {
    const params = new URLSearchParams(new FormData(form));
    const response = await fetch(`/api/sla-report?${params}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status}).`);
    }

    renderReport(data);
    statusEl.className = "report-status is-success";
    statusEl.textContent = "Report generated successfully.";
  } catch (error) {
    console.error("Error generating SLA report:", error);
    statusEl.className = "report-status is-error";
    statusEl.textContent = error instanceof Error
      ? error.message
      : "Unable to generate the report. Please try again.";
  } finally {
    generateButton.disabled = false;
  }
});

slaTab.addEventListener("click", () => setActiveTab(slaTab));
requestsTab.addEventListener("click", () => setActiveTab(requestsTab));

for (const tab of [slaTab, requestsTab]) {
  tab.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const nextTab = tab === slaTab ? requestsTab : slaTab;
      setActiveTab(nextTab);
      nextTab.focus();
    }
  });
}

requestsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadRequests();
});
