"use strict";

const STAGE_LABELS = {
  cache_check: "Cache check",
  scrape: "Scrape",
  link_discovery: "Link discovery",
  club_detection: "Community detection",
  club_research: "Community research",
  image_analysis: "Image analysis",
  text_analysis: "Text analysis",
  synthesis: "Profile synthesis",
  gift_recommendation: "Gift recommendations",
  outreach_draft: "Outreach draft",
  cache_write: "Saving results",
  complete: "Complete",
  error: "Error",
};

const form = document.getElementById("research-form");
const formSection = document.getElementById("form-section");
const progressSection = document.getElementById("progress-section");
const progressLog = document.getElementById("progress-log");
const resultsSection = document.getElementById("results-section");
const errorSection = document.getElementById("error-section");
const errorBody = document.getElementById("error-body");
const submitBtn = document.getElementById("submit-btn");
const resetBtn = document.getElementById("reset-btn");
const copyBtn = document.getElementById("copy-outreach");

let activeStages = new Map();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const input = {
    prospectUrl: String(data.get("prospectUrl") || "").trim(),
    prospectName: String(data.get("prospectName") || "").trim() || undefined,
    sender: {
      name: String(data.get("senderName") || "").trim(),
      role: String(data.get("senderRole") || "").trim() || undefined,
      company: String(data.get("senderCompany") || "").trim() || undefined,
      reasonForConnecting: String(data.get("reasonForConnecting") || "").trim(),
      discussionTopic: String(data.get("discussionTopic") || "").trim(),
    },
    forceRefresh: data.get("forceRefresh") === "on",
  };

  formSection.hidden = true;
  progressSection.hidden = false;
  resultsSection.hidden = true;
  errorSection.hidden = true;
  progressLog.innerHTML = "";
  activeStages = new Map();

  try {
    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    await consumeSse(response);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    submitBtn.disabled = false;
  }
});

resetBtn.addEventListener("click", () => {
  resultsSection.hidden = true;
  progressSection.hidden = true;
  errorSection.hidden = true;
  formSection.hidden = false;
  form.reset();
});

copyBtn.addEventListener("click", async () => {
  const body = copyBtn.dataset.body || "";
  await navigator.clipboard.writeText(body);
  const original = copyBtn.textContent;
  copyBtn.textContent = "Copied!";
  setTimeout(() => { copyBtn.textContent = original; }, 1500);
});

async function consumeSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      handleEvent(parseSseBlock(raw));
    }
  }
}

function parseSseBlock(block) {
  let eventName = "message";
  let dataLines = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  const dataText = dataLines.join("\n");
  let data = null;
  if (dataText) {
    try { data = JSON.parse(dataText); } catch { data = dataText; }
  }
  return { event: eventName, data };
}

function handleEvent({ event, data }) {
  if (!data || typeof data !== "object") return;
  if (event === "complete" && data.data) {
    appendStage({ stage: "complete", status: "completed" });
    renderResults(data.data);
    return;
  }
  if (event === "error") {
    appendStage({ stage: "error", status: "failed", message: data.message });
    showError(data.message || "pipeline error");
    return;
  }
  appendStage(data);
}

function appendStage(ev) {
  const key = `${ev.stage}::${detailKey(ev)}`;
  const label = STAGE_LABELS[ev.stage] || ev.stage;
  const detail = describeDetail(ev);
  const duration = ev.durationMs != null ? `${(ev.durationMs / 1000).toFixed(1)}s` : "";

  const existing = activeStages.get(key);
  if (existing && ev.status !== "started") {
    existing.classList.remove("pending");
    existing.querySelector(".status-icon").className = `status-icon status-${ev.status}`;
    if (detail) existing.querySelector(".stage-detail").textContent = detail;
    if (duration) existing.querySelector(".stage-duration").textContent = duration;
    return;
  }

  const li = document.createElement("li");
  li.innerHTML = `
    <span class="status-icon status-${ev.status}"></span>
    <span class="stage-name">${escapeHtml(label)}</span>
    <span class="stage-detail">${escapeHtml(detail)}</span>
    <span class="stage-duration">${escapeHtml(duration)}</span>
  `;
  progressLog.appendChild(li);
  activeStages.set(key, li);
}

function detailKey(ev) {
  const d = ev.data;
  if (d && typeof d === "object") {
    if (d.platform && d.url) return `${d.platform}:${d.url}`;
    if (d.platform) return String(d.platform);
  }
  return "";
}

function describeDetail(ev) {
  if (ev.message) return ev.message;
  if (!ev.data || typeof ev.data !== "object") return "";
  const d = ev.data;
  if (d.platform && d.posts != null) return `${d.platform} · ${d.posts} posts`;
  if (d.platform) return String(d.platform);
  if (d.count != null) return `count: ${d.count}`;
  if (d.analyzed != null) return `${d.analyzed} analyzed, ${d.skipped ?? 0} skipped`;
  if (d.interests != null) return `${d.interests} interests, ${d.hooks ?? 0} hooks`;
  if (d.redactions != null) return `${d.redactions} redactions`;
  if (d.chars != null) return `${d.chars} chars`;
  if (d.hit === true) return `cache hit (age ${Math.round((d.ageMs || 0) / 1000)}s)`;
  if (d.hit === false) return "no cache";
  return "";
}

function renderResults(output) {
  resultsSection.hidden = false;
  renderProfile(output);
  renderGifts(output.gifts || []);
  renderOutreach(output.outreach);
}

function renderProfile(output) {
  const container = document.getElementById("profile-body");
  const profile = output.personProfile;

  if (!profile) {
    container.innerHTML = `<p class="profile-row-label">No profile generated. Failures: ${escapeHtml(JSON.stringify((output.failures || []).map(f => f.stage)))}</p>`;
    return;
  }

  const platforms = (output.profiles || []).map(p => p.platform).filter(Boolean);
  const uniquePlatforms = [...new Set(platforms)];

  const summary = profile.summary || "";
  const interestsHtml = (profile.mergedInterests || []).slice(0, 12).map(i => `
    <span class="interest-tag" title="${escapeHtml(JSON.stringify(i.evidence || []))}">
      <span class="depth-dot depth-${i.confidence > 0.7 ? "passionate" : i.confidence > 0.4 ? "moderate" : "passing"}"></span>
      ${escapeHtml(i.topic)}
    </span>
  `).join("");

  const achievementsHtml = (profile.achievements || []).slice(0, 5).map(a => `
    <li>${escapeHtml(a.title)} <span class="optional">${escapeHtml(a.date || "")}</span></li>
  `).join("");

  const hooksHtml = (profile.recentHooks || []).slice(0, 5).map(h => `
    <li>${escapeHtml(h.summary)} <span class="optional">(potential ${Math.round((h.conversationPotential || 0) * 100)}%)</span></li>
  `).join("");

  const communitiesHtml = (profile.communities || []).slice(0, 6).map(c => `
    <li><strong>${escapeHtml(c.name)}</strong> — ${escapeHtml(c.role)}, ${escapeHtml(c.activityLevel)}</li>
  `).join("");

  const angle = profile.bestGiftAngle || { interest: "", hook: "", rationale: "" };

  container.innerHTML = `
    <div class="profile-row">
      <div class="profile-row-label">Platforms</div>
      <div>${uniquePlatforms.map(p => `<span class="citation">${escapeHtml(p)}</span>`).join(" ")}</div>
    </div>
    <div class="profile-row">
      <div class="profile-row-label">Summary</div>
      <div>${escapeHtml(summary)}</div>
    </div>
    ${profile.careerNarrative ? `<div class="profile-row"><div class="profile-row-label">Career</div><div>${escapeHtml(profile.careerNarrative)}</div></div>` : ""}
    ${interestsHtml ? `<div class="profile-row"><div class="profile-row-label">Interests</div><div>${interestsHtml}</div></div>` : ""}
    ${achievementsHtml ? `<div class="profile-row"><div class="profile-row-label">Recent achievements</div><ul>${achievementsHtml}</ul></div>` : ""}
    ${hooksHtml ? `<div class="profile-row"><div class="profile-row-label">Timely hooks</div><ul>${hooksHtml}</ul></div>` : ""}
    ${communitiesHtml ? `<div class="profile-row"><div class="profile-row-label">Communities</div><ul>${communitiesHtml}</ul></div>` : ""}
    ${(profile.personality && profile.personality.communicationStyle) ? `<div class="profile-row"><div class="profile-row-label">Communication style</div><div>${escapeHtml(profile.personality.communicationStyle)}</div></div>` : ""}
    ${angle.interest || angle.hook ? `<div class="gift-angle"><strong>Gift angle:</strong> ${escapeHtml(angle.interest)} × ${escapeHtml(angle.hook)}. ${escapeHtml(angle.rationale || "")}</div>` : ""}
  `;
}

function renderGifts(gifts) {
  const container = document.getElementById("gifts-body");
  if (gifts.length === 0) {
    container.innerHTML = `<p class="optional">No gifts produced.</p>`;
    return;
  }
  container.innerHTML = gifts.map(g => `
    <div class="gift ${g.rank === 1 ? "top" : ""}">
      <div class="gift-rank">Rank #${g.rank} · creepiness ${g.creepinessScore}/5</div>
      <div class="gift-name">${escapeHtml(g.name)}</div>
      <div class="gift-meta">
        <span>$${Number(g.estimatedPriceUsd || 0).toFixed(0)}</span>
        <span>${escapeHtml(g.whereToBuy || "")}</span>
      </div>
      <div class="gift-description">${escapeHtml(g.description || "")}</div>
      <div class="gift-opener">"${escapeHtml(g.conversationOpener || "")}"</div>
      ${(g.citations || []).length > 0 ? `<div class="citations">${g.citations.map(c => `<span class="citation" title="${escapeHtml(c.excerpt || "")}">${escapeHtml(c.type)}${c.sourceUrl ? " · " + escapeHtml(shortUrl(c.sourceUrl)) : ""}</span>`).join("")}</div>` : ""}
    </div>
  `).join("");
}

function renderOutreach(note) {
  const container = document.getElementById("outreach-body");
  if (!note) {
    container.innerHTML = `<p class="optional">No outreach note generated.</p>`;
    copyBtn.hidden = true;
    return;
  }
  copyBtn.hidden = false;
  copyBtn.dataset.body = (note.subject ? `Subject: ${note.subject}\n\n` : "") + (note.body || "");
  container.innerHTML = `
    ${note.subject ? `<div class="profile-row"><div class="profile-row-label">Subject</div><div>${escapeHtml(note.subject)}</div></div>` : ""}
    <div class="outreach-body">${escapeHtml(note.body || "")}</div>
    <div class="outreach-meta">
      Tone: ${escapeHtml(note.toneMatched || "")} · CTA: ${escapeHtml(note.cta || "")} · ${note.characterCount || 0} chars
    </div>
  `;
}

function showError(message) {
  errorSection.hidden = false;
  errorBody.textContent = message;
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname;
  } catch {
    return url;
  }
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
