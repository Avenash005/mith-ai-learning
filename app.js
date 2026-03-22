// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
const S = {
  phase:        "input",
  tab:          "paste",
  luText:       "",
  fileData:     null,
  fileName:     "",
  studentName:  "",
  apiKey:       localStorage.getItem("kv_key") || "",
  isTechnical:  false,
  topicName:    "",
  notes:        [],
  exam:         null,
  answers:      {},
  results:      null,
  error:        "",
  timeLeft:     3600,
  timer:        null
};

const set = patch => { Object.assign(S, patch); render(); };
const mk  = (tag, cls) => { const d = document.createElement(tag); if (cls) d.className = cls; return d; };
const $   = id => document.getElementById(id);

const ready = () =>
  S.apiKey.trim().startsWith("sk-") &&
  S.studentName.trim().length > 1 &&
  (S.tab === "paste" ? S.luText.trim().length > 30 : !!S.fileData);

const GRADE_COL = g => ({
  "A+": { t: "#3ecf8e", b: "#2db87e" },
  "A":  { t: "#3ecf8e", b: "#2db87e" },
  "B+": { t: "#4f8fff", b: "#3a7aee" },
  "B":  { t: "#4f8fff", b: "#3a7aee" },
  "C":  { t: "#f0bc40", b: "#d4a62e" },
  "D":  { t: "#f09040", b: "#d47a2e" },
  "F":  { t: "#f26868", b: "#d84a4a" }
}[g] || { t: "#f26868", b: "#d84a4a" });

// ─────────────────────────────────────────
// API
// ─────────────────────────────────────────
async function callClaude(sys, msgs, tok = 4096) {
  if (!S.apiKey) throw new Error("No API key — save your key first.");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-api-key": S.apiKey
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: tok,
      system: sys,
      messages: msgs
    })
  });
  if (r.status === 401) throw new Error("Invalid API key (401) — check your key at console.anthropic.com/settings/keys");
  if (!r.ok) throw new Error("API error " + r.status);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content.map(b => b.text || "").join("");
}

const parse = raw => JSON.parse(raw.replace(/```json|```/g, "").trim());

// ─────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────
function render() {
  const app = $("app");
  app.innerHTML = "";

  const ph = S.phase;
  if      (ph === "input")                              app.appendChild(rInput());
  else if (ph === "generating" || ph === "evaluating")  app.appendChild(rLoad());
  else if (ph === "notes")                              app.appendChild(rNotes());
  else if (ph === "exam")                               app.appendChild(rExam());
  else if (ph === "results")                            app.appendChild(rResults());

  if (S.error) {
    const t = mk("div", "toast");
    t.textContent = "⚠ " + S.error;
    app.appendChild(t);
    setTimeout(() => set({ error: "" }), 5000);
  }

  attach();
}

// ═══════════════════════════════════════════
// INPUT SCREEN
// ═══════════════════════════════════════════
function rInput() {
  const keyOk = S.apiKey.trim().startsWith("sk-");
  const p = mk("div", "page fade");
  p.innerHTML = `
    <div class="logo-row">
      <div class="logo-icon">🎓</div>
      <div>
        <div class="logo-name">Text Compraseer AI</div>
        <div class="logo-ver">Assessment Portal</div>
      </div>
    </div>

    <h1 class="hero-title">Your <span>Assessment</span><br>starts here.</h1>
    <p class="hero-sub">Paste your LU — we'll generate quick notes, then put you through a full 40-mark assessment. Auto-graded by AI.</p>

    <!-- API KEY -->
    <div class="key-section">
      <div class="key-header">
        <span style="font-size:16px">🔑</span>
        <span class="key-title">Anthropic API Key</span>
        ${keyOk
          ? '<span class="chip green" style="margin-left:auto">Connected</span>'
          : '<span class="chip red"   style="margin-left:auto">Not set</span>'
        }
      </div>
      ${keyOk
        ? `<div class="key-ok">
             <span class="key-status">✓ Key saved in browser</span>
             <button class="key-clear" id="key-clear">Remove</button>
           </div>`
        : `<div class="key-row">
             <input class="key-input" id="key-in" type="password" placeholder="sk-ant-api03-..." value="${S.apiKey}">
             <button class="key-save" id="key-save">Save Key</button>
           </div>`
      }
      <div class="key-hint">
        Get your free key at
        <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com/settings/keys</a>
        — stored locally in your browser, never sent anywhere else.
      </div>
    </div>

    <!-- LU CONTENT -->
    <div class="card">
      <div class="card-body">
        <div class="tab-row">
          <button class="tab-btn ${S.tab === 'paste' ? 'on' : ''}" id="tp">📋 Paste LU</button>
          <button class="tab-btn ${S.tab === 'upload' ? 'on' : ''}" id="tu">📁 Upload File</button>
        </div>
        ${S.tab === "paste"
          ? `<textarea class="lu-area" id="lta" placeholder="Paste your Learning Unit content here...&#10;&#10;Topics, concepts, code, explanations — more detail = better notes &amp; questions.">${S.luText}</textarea>`
          : `<div class="dropzone ${S.fileData ? 'on' : ''}" id="dz">
               <div class="dropzone-icon">${S.fileData ? "✅" : "📄"}</div>
               <div class="dropzone-label">${S.fileData ? S.fileName : "Click to upload file"}</div>
               <div class="dropzone-sub">${S.fileData ? "Ready" : "PDF, TXT, JS, PY, MD..."}</div>
             </div>
             <input type="file" id="fi" accept=".pdf,.txt,.md,.js,.py,.java">`
        }
        <input class="name-input" id="ni" placeholder="Your full name..." value="${S.studentName}">
        <button class="btn-primary block" id="gb" style="margin-top:14px" ${ready() ? "" : "disabled"}>
          Start Assessment &nbsp;→
        </button>
      </div>
    </div>

    <div class="scheme-chips">
      <div class="scheme-chip">Technical: 20 MCQ (1m) + 10 Jasmine (2m) = 40</div>
      <div class="scheme-chip">Non-Tech: 30 MCQ (1m) + 2 Essay (5m) = 40</div>
    </div>`;
  return p;
}

// ═══════════════════════════════════════════
// LOADING SCREEN
// ═══════════════════════════════════════════
function rLoad() {
  const w = mk("div", "load-screen fade");
  w.innerHTML = `
    <div class="load-ring spin"></div>
    <div style="text-align:center">
      <div class="load-title">${S.phase === "generating" ? "Preparing your session" : "Evaluating answers"}</div>
      <div class="load-sub pulse" style="margin-top:6px">
        ${S.phase === "generating" ? "Reading LU · Building notes · Setting exam..." : "Reading answers · Computing marks · Generating feedback..."}
      </div>
    </div>`;
  return w;
}

// ═══════════════════════════════════════════
// NOTES SCREEN
// ═══════════════════════════════════════════
function rNotes() {
  const isT = S.isTechnical;
  const p = mk("div", "page fade");
  p.innerHTML = `
    <div class="notes-topbar">
      <div>
        <div class="notes-title">${S.topicName}</div>
        <div class="notes-meta">Study notes · Read before entering the exam</div>
      </div>
      <div class="chip ${isT ? 'blue' : 'green'}">${isT ? "⚙ Technical" : "📖 Non-Technical"}</div>
    </div>

    <div class="marks-banner">
      <div class="marks-pill">
        <div class="marks-pill-icon">📝</div>
        <div>
          <div class="marks-pill-label">Section A — MCQ</div>
          <div class="marks-pill-val">${isT ? "20" : "30"} questions · 1 mark each</div>
        </div>
      </div>
      <div class="marks-pill">
        <div class="marks-pill-icon">${isT ? "💻" : "✍️"}</div>
        <div>
          <div class="marks-pill-label">Section B — ${isT ? "Jasmine" : "Essay"}</div>
          <div class="marks-pill-val">${isT ? "10 test cases · 2 marks each" : "2 questions · 5 marks each"}</div>
        </div>
      </div>
    </div>

    <div class="notes-label">Quick Notes</div>
    ${S.notes.map(n => `
      <div class="note-item">
        <div class="note-head">${n.heading}</div>
        <div class="note-pts">${n.points.map(pt => `<div class="note-pt">${pt}</div>`).join("")}</div>
      </div>`).join("")}

    <div style="text-align:center;margin-top:28px">
      <button class="btn-primary" id="bx" style="padding:14px 48px;font-size:15px">
        Enter Exam Hall &nbsp;→
      </button>
    </div>`;
  return p;
}

// ═══════════════════════════════════════════
// EXAM SCREEN
// ═══════════════════════════════════════════
function rExam() {
  const exam = S.exam;
  const tl = S.timeLeft;
  const mm = String(Math.floor(tl / 60)).padStart(2, "0");
  const ss = String(tl % 60).padStart(2, "0");
  const mcqs = exam.questions.filter(q => q.type === "mcq");
  const secB = exam.questions.filter(q => q.type !== "mcq");

  const w = mk("div", "exam-wrap fade");
  w.innerHTML = `
    <div class="exam-topbar">
      <div>
        <div class="exam-student">${S.studentName}</div>
        <div class="exam-topic">${S.topicName} · ${exam.totalMarks} marks</div>
      </div>
      <div class="timer-box ${tl < 600 ? 'red' : ''}" id="tv">${mm}:${ss}</div>
    </div>

    <div class="exam-title">${exam.examTitle}</div>
    <div class="exam-sub">All questions compulsory · ${S.isTechnical ? "Technical" : "Non-Technical"} Module</div>

    <!-- SECTION A -->
    <div class="section-hdr">
      <div class="sec-name">Section A — Multiple Choice Questions</div>
      <div class="sec-marks">${S.isTechnical ? "20" : "30"} marks · 1 mark each</div>
    </div>
    ${mcqs.map((q, i) => `
      <div class="q-card">
        <div class="q-row">
          <span class="q-num">${i + 1}.</span>
          <span class="q-text">${q.question}</span>
          <span class="q-mark">[1m]</span>
        </div>
        <div class="opts">
          ${(q.options || []).map((opt, oi) => `
            <label class="opt ${S.answers[q.id] === opt ? 'sel' : ''}">
              <input type="radio" name="q${q.id}" value="${oi}" ${S.answers[q.id] === opt ? 'checked' : ''}>
              <label>${opt}</label>
            </label>`).join("")}
        </div>
      </div>`).join("")}

    <!-- SECTION B -->
    <div class="section-hdr">
      <div class="sec-name">Section B — ${S.isTechnical ? "Jasmine Test Cases" : "Essay Questions"}</div>
      <div class="sec-marks">${S.isTechnical ? "20 marks · 2 each" : "10 marks · 5 each"}</div>
    </div>
    ${secB.map((q, i) => S.isTechnical ? rJasmine(q, i) : rEssay(q, i)).join("")}

    <div class="submit-row">
      <button class="btn-primary" id="sb" style="padding:14px 52px;font-size:15px">Submit Exam</button>
    </div>`;
  return w;
}

function rEssay(q, i) {
  return `
    <div class="q-card">
      <div class="q-row">
        <span class="q-num">${i + 1}.</span>
        <span class="q-text">${q.question}</span>
        <span class="q-mark">[5m]</span>
      </div>
      <textarea class="essay-ans" data-qid="${q.id}" placeholder="Write your detailed answer here...">${S.answers[q.id] || ""}</textarea>
    </div>`;
}

function rJasmine(q, i) {
  return `
    <div class="jasmine-card">
      <div class="jq-row">
        <span class="jq-num">${i + 1}.</span>
        <span class="jq-txt">${q.description}</span>
        <span class="jq-m">[2m]</span>
      </div>
      <div class="io-box">
        ${q.input !== undefined ? `<div class="io-row"><span class="io-k">Input &nbsp;&nbsp;:</span><span class="io-i">${q.input}</span></div>` : ""}
        <div class="io-row"><span class="io-k">Expected:</span><span class="io-e">${q.expectedOutput}</span></div>
      </div>
      <div class="code-wrap">
        <div class="code-card">
          <div class="code-bar">
            <div class="c-dot" style="background:#ff5f57"></div>
            <div class="c-dot" style="background:#ffbd2e"></div>
            <div class="c-dot" style="background:#28c840"></div>
            <span class="c-lang">javascript</span>
            <span class="c-pts">2 marks</span>
          </div>
          <textarea data-qid="${q.id}" data-type="jasmine" placeholder="// write your solution here">${S.answers[q.id] || q.starterCode || ""}</textarea>
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════
// RESULTS SCREEN
// ═══════════════════════════════════════════
function rResults() {
  const r = S.results, exam = S.exam;
  const col = GRADE_COL(r.grade);
  const pct = r.percentage;

  const p = mk("div", "page fade");
  p.innerHTML = `
    <div class="result-hero">
      <div class="rh-top">
        <div>
          <div class="rh-eyebrow">Text Compraseer AI · Assessment Result</div>
          <div class="rh-name">${S.studentName}</div>
          <div class="rh-topic">${S.topicName}</div>
        </div>
        <div>
          <div class="rh-grade" style="color:${col.t}">${r.grade}</div>
          <div class="rh-score">${r.totalScore} / ${r.totalMarks}</div>
        </div>
      </div>
      <div class="rh-bar-bg">
        <div class="rh-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${col.b},${col.t})"></div>
      </div>
      <div class="rh-stats">
        <div class="rh-stat">
          <div class="rh-stat-label">Section A</div>
          <div class="rh-stat-val" style="color:${col.t}">${r.sectionAScore}<span style="font-size:13px;color:var(--muted)">/${S.isTechnical ? 20 : 30}</span></div>
        </div>
        <div class="rh-stat">
          <div class="rh-stat-label">Section B</div>
          <div class="rh-stat-val" style="color:${col.t}">${r.sectionBScore}<span style="font-size:13px;color:var(--muted)">/${S.isTechnical ? 20 : 10}</span></div>
        </div>
        <div class="rh-stat">
          <div class="rh-stat-label">Percentage</div>
          <div class="rh-stat-val" style="color:${col.t}">${pct}%</div>
        </div>
        <div class="rh-stat">
          <div class="rh-stat-label">Status</div>
          <div class="rh-stat-val" style="font-size:14px;color:${col.t}">${pct >= 50 ? "✓ Cleared" : "✗ Not Cleared"}</div>
        </div>
      </div>
      <div class="rh-feedback">${r.feedback}</div>
    </div>

    <div class="review-title">Question Review</div>
    ${(r.questionResults || []).map((qr, i) => {
      const q  = exam.questions.find(x => x.id === qr.id) || exam.questions[i] || {};
      const p2 = qr.maxMarks > 0 ? qr.marksAwarded / qr.maxMarks : 0;
      const c  = p2 >= 1 ? "#3ecf8e" : p2 > 0 ? "#f0bc40" : "#f26868";
      const bg = p2 >= 1 ? "#3ecf8e18" : p2 > 0 ? "#f0bc4018" : "#f2686818";
      const sa = S.answers[q.id] || "(no answer)";
      const ql = (q.type === "jasmine" ? q.description : q.question) || "";
      return `
        <div class="rev-item">
          <div class="rev-stripe" style="background:${c}"></div>
          <div class="rev-body">
            <div class="rev-top">
              <div class="rev-q"><strong>Q${i + 1}.</strong> ${ql.slice(0, 75)}${ql.length > 75 ? "..." : ""}</div>
              <div class="rev-badge" style="background:${bg};color:${c}">${qr.marksAwarded}/${qr.maxMarks}</div>
            </div>
            <div class="rev-fb">${qr.feedback || ""}</div>
            ${qr.correctAnswer ? `<div class="rev-ca">✓ Correct: ${qr.correctAnswer}</div>` : ""}
            <div class="rev-ans">
              <div class="rev-ans-lbl">Your Answer</div>
              <div class="rev-ans-txt" style="font-family:${q.type === 'jasmine' ? "'JetBrains Mono',monospace" : "inherit"}">${sa}</div>
            </div>
          </div>
        </div>`;
    }).join("")}

    <div style="text-align:center;margin-top:32px">
      <button class="btn-ghost" id="nb">↺ &nbsp; New Exam</button>
    </div>`;
  return p;
}

// ─────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────
function attach() {
  // API key
  const ks = $("key-save"), kc = $("key-clear"), ki = $("key-in");
  if (ks) ks.onclick = () => {
    const v = (ki?.value || "").trim();
    if (!v.startsWith("sk-")) { set({ error: "Key must start with sk-" }); return; }
    S.apiKey = v;
    localStorage.setItem("kv_key", v);
    render();
  };
  if (kc) kc.onclick = () => {
    S.apiKey = "";
    localStorage.removeItem("kv_key");
    render();
  };

  // Tabs
  const tp = $("tp"), tu = $("tu");
  if (tp) tp.onclick = () => set({ tab: "paste", error: "" });
  if (tu) tu.onclick = () => set({ tab: "upload", error: "" });

  // LU textarea + name
  const lta = $("lta"), ni = $("ni"), gb = $("gb");
  if (lta) lta.oninput = e => { S.luText = e.target.value; if (gb) gb.disabled = !ready(); };
  if (ni)  ni.oninput  = e => { S.studentName = e.target.value; if (gb) gb.disabled = !ready(); };

  // File upload
  const dz = $("dz"), fi = $("fi");
  if (dz) dz.onclick = () => fi?.click();
  if (fi) fi.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.type === "application/pdf") {
      const rd = new FileReader();
      rd.onload = ev => set({ fileData: { type: "pdf", b64: ev.target.result.split(",")[1] }, fileName: f.name });
      rd.readAsDataURL(f);
    } else {
      const rd = new FileReader();
      rd.onload = ev => set({ fileData: { type: "text", content: ev.target.result }, fileName: f.name });
      rd.readAsText(f);
    }
  };

  // Action buttons
  if (gb) gb.onclick = generate;
  const bx = $("bx"), sb = $("sb"), nb = $("nb");
  if (bx) bx.onclick = startExam;
  if (sb) sb.onclick = submit;
  if (nb) nb.onclick = () => {
    if (S.timer) clearInterval(S.timer);
    Object.assign(S, {
      phase: "input", exam: null, answers: {}, results: null,
      error: "", timeLeft: 3600, timer: null,
      luText: "", fileData: null, fileName: "", notes: []
    });
    render();
  };

  // MCQ radio buttons
  document.querySelectorAll("input[type=radio]").forEach(r => {
    r.onchange = e => {
      const qid = parseInt(e.target.name.replace("q", ""));
      const q   = S.exam.questions.find(q => q.id === qid);
      if (q) S.answers[qid] = q.options[parseInt(e.target.value)];
      document.querySelectorAll(`[name="q${qid}"]`)
        .forEach(inp => inp.closest(".opt").classList.toggle("sel", inp.checked));
    };
  });

  // Textarea answers (essay + jasmine)
  document.querySelectorAll("textarea[data-qid]").forEach(t => {
    t.oninput = e => { S.answers[parseInt(e.target.dataset.qid)] = e.target.value; };
  });
}

// ─────────────────────────────────────────
// GENERATE — notes + exam
// ─────────────────────────────────────────
async function generate() {
  if (!ready()) return;
  if (S.timer) clearInterval(S.timer);
  set({ phase: "generating", error: "" });

  const NOTES_SYS = `You are a study notes generator for a tech education platform.
Analyze the provided LU (Learning Unit) and return ONLY raw JSON (no markdown, no backticks):
{
  "isTechnical": boolean,
  "topicName": "3-5 word topic name",
  "notes": [
    { "heading": "Section heading", "points": ["bullet max 15 words", "bullet", "bullet"] }
  ]
}
Rules:
- isTechnical = true ONLY if content is primarily about coding, algorithms, programming, data structures, or software engineering
- Generate 4-6 note sections
- Each section: 3-4 bullet points, each max 15 words
- Key exam-relevant facts only — no filler`;

  const EXAM_TECH = `You are an exam paper setter for a TECHNICAL module.
Generate a 40-mark exam from the LU content. Return ONLY raw JSON (no markdown, no backticks):
{
  "examTitle": "short descriptive title",
  "totalMarks": 40,
  "questions": []
}
The questions array must have EXACTLY:
- 20 MCQ (ids 1–20): {"id":1,"type":"mcq","question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"marks":1}
- 10 Jasmine (ids 21–30): {"id":21,"type":"jasmine","description":"what the function should do","input":"sample","expectedOutput":"result","starterCode":"function solution(input) {\\n  // write code\\n}","marks":2}
All questions must come directly from the LU content.`;

  const EXAM_NT = `You are an exam paper setter for a NON-TECHNICAL module.
Generate a 40-mark exam from the LU content. Return ONLY raw JSON (no markdown, no backticks):
{
  "examTitle": "short descriptive title",
  "totalMarks": 40,
  "questions": []
}
The questions array must have EXACTLY:
- 30 MCQ (ids 1–30): {"id":1,"type":"mcq","question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"marks":1}
- 2 Essay (ids 31–32): {"id":31,"type":"essay","question":"open-ended question needing a detailed answer","marks":5}
All questions must come directly from the LU content.`;

  try {
    let uc;
    if (S.tab === "upload" && S.fileData?.type === "pdf") {
      uc = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: S.fileData.b64 } },
        { type: "text", text: "Analyze this LU content." }
      ];
    } else {
      const txt = S.tab === "paste" ? S.luText : S.fileData?.content || "";
      uc = `LU Content:\n\n${txt}`;
    }

    // Step 1: notes + detect type
    const nd = parse(await callClaude(NOTES_SYS, [{ role: "user", content: uc }]));
    S.isTechnical = nd.isTechnical;
    S.topicName   = nd.topicName;
    S.notes       = nd.notes;

    // Step 2: exam paper
    const txt2 = S.tab === "paste" ? S.luText : S.fileData?.content || S.topicName;
    const exam = parse(await callClaude(
      S.isTechnical ? EXAM_TECH : EXAM_NT,
      [{ role: "user", content: `Generate the exam from this LU:\n\n${txt2}` }],
      6000
    ));

    const answers = {};
    exam.questions.forEach(q => {
      answers[q.id] = q.type === "jasmine" ? (q.starterCode || "") : "";
    });

    set({ phase: "notes", exam, answers, error: "" });
  } catch (e) {
    set({ phase: "input", error: e.message });
  }
}

// ─────────────────────────────────────────
// START EXAM — timer
// ─────────────────────────────────────────
function startExam() {
  const h = setInterval(() => {
    if (S.phase !== "exam") { clearInterval(h); return; }
    S.timeLeft = Math.max(0, S.timeLeft - 1);
    if (S.timeLeft <= 0) { clearInterval(h); submit(); return; }
    const tv = $("tv");
    if (tv) {
      const tl = S.timeLeft;
      tv.textContent = String(Math.floor(tl / 60)).padStart(2, "0") + ":" + String(tl % 60).padStart(2, "0");
      tv.className = "timer-box" + (tl < 600 ? " red" : "");
    }
  }, 1000);
  set({ phase: "exam", timeLeft: 3600, timer: h, error: "" });
}

// ─────────────────────────────────────────
// SUBMIT & EVALUATE
// ─────────────────────────────────────────
async function submit() {
  if (S.timer) clearInterval(S.timer);
  set({ phase: "evaluating", error: "" });

  const SYS = `You are a strict but fair exam evaluator.
Evaluate all student answers carefully. Return ONLY raw JSON (no markdown, no backticks):
{
  "totalScore": number,
  "totalMarks": 40,
  "sectionAScore": number,
  "sectionBScore": number,
  "percentage": number,
  "grade": "A+|A|B+|B|C|D|F",
  "feedback": "2-3 sentence personalised overall feedback",
  "questionResults": [
    {
      "id": number,
      "marksAwarded": number,
      "maxMarks": number,
      "feedback": "one sentence specific feedback",
      "correctAnswer": "correct answer for MCQ only, empty string otherwise"
    }
  ]
}
Grading: A+≥90, A≥80, B+≥70, B≥60, C≥50, D≥40, F<40.
MCQ: full marks or 0 only.
Essay: 0–5 partial marks based on accuracy, detail, and examples.
Jasmine: 2 if logic correct and output matches, 1 if partial understanding shown, 0 if empty or completely wrong.`;

  try {
    const qa = S.exam.questions.map(q => ({
      id:             q.id,
      type:           q.type,
      question:       q.type === "jasmine" ? q.description : q.question,
      options:        q.options,
      marks:          q.marks,
      expectedOutput: q.expectedOutput,
      input:          q.input,
      studentAnswer:  S.answers[q.id] || "(no answer)"
    }));

    const raw = await callClaude(
      SYS,
      [{ role: "user", content: `Evaluate these answers:\n\n${JSON.stringify(qa, null, 2)}` }],
      4096
    );
    set({ phase: "results", results: parse(raw), error: "" });
  } catch (e) {
    set({ phase: "exam", error: "Evaluation failed: " + e.message });
  }
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
render();
