// Scenario sheet: export the president's candidates, all 100 senators, all 50 governors and the Senate / governor race
// candidates as one table you can paste into Google Sheets, import an edited table back, and save named scenario presets.
// Uses the globals from script.js, the DownBallot module (downballot.js) and its roster.
(function () {
  "use strict";
  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const DB = () => root.DownBallot;

  const COLUMNS = ["Office", "Role", "State", "Class", "Party", "Name", "Incumbent", "Trade", "Immigration", "Partisanship", "Abortion",
    "Foreign policy", "Approval", "Home state", "Right-lean index", "PVI", "Adjustment", "Vote share", "Voters to R", "Value"];
  const keyOf = (s) => String(s).toLowerCase().replace(/[^a-z]/g, "");
  const COLKEY = Object.fromEntries(COLUMNS.map((c) => [keyOf(c), c]));
  const STATS = [["Trade", "trade"], ["Immigration", "immigration"], ["Partisanship", "partisanship"], ["Abortion", "abortion"], ["Foreign policy", "foreign_policy"]];

  const ABBR = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
    DC: "Washington DC", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
    KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
    SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
  const stateName = (s) => {
    const t = String(s || "").trim();
    if (!t) return null;
    if (ABBR[t.toUpperCase()]) return ABBR[t.toUpperCase()];
    return Object.keys(STATES).find((n) => n.toLowerCase() === t.toLowerCase()) || null;
  };

  // How far right a candidate's positions sit, 0 (most left) to 100 (most right), from the five stances. Display only: the
  // import ignores it. Immigration, trade (protectionist) and foreign policy (hawkish) count higher as the number goes up;
  // abortion (pro-life) and partisanship (1 = extreme Republican) count higher as it goes down.
  function rightIndex(c) {
    const parts = [(c.trade - 1) / 9, (c.immigration - 1) / 9, (10 - c.partisanship) / 9, (10 - c.abortion) / 9, (c.foreign_policy - 1) / 9];
    return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 100);
  }

  // ---------- delimited text ----------
  function parseDelimited(text) {
    text = String(text).replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").trim();
    if (!text) return [];
    const delim = text.split("\n")[0].includes("\t") ? "\t" : ",";
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
      } else if (ch === '"' && cell === "") quoted = true;
      else if (ch === delim) { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    row.push(cell); rows.push(row);
    return rows;
  }
  const quote = (v, delim) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /["\n\r]/.test(s) || s.includes(delim) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const toText = (rows, delim) => [COLUMNS, ...rows.map((r) => COLUMNS.map((c) => r[c]))].map((r) => r.map((v) => quote(v, delim)).join(delim)).join("\n");

  // ---------- export ----------
  const num = (x, d = 0) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : "");
  function candRow(base, c) {
    const row = Object.assign({}, base, { Name: c.name, Trade: c.trade, Immigration: c.immigration, Partisanship: c.partisanship,
      Abortion: c.abortion, "Foreign policy": c.foreign_policy, Approval: c.approval });
    row["Right-lean index"] = rightIndex(c);
    return row;
  }
  const yn = (b) => (b ? "Y" : "N");

  function presidentRows() {
    const rows = [];
    const p = currentPresetData;
    rows.push({ Office: "President", Role: "Setting: preset", Value: currentPreset });
    rows.push({ Office: "President", Role: "Setting: environment", Value: envValue() });
    const c1 = readCandidate("c1", CAND1_SLIDERS, ""), c2 = readCandidate("c2", CAND2_SLIDERS, "");
    rows.push(candRow({ Office: "President", Role: "Candidate R", Party: p.cands.r.party, "Home state": c1.home }, c1));
    rows.push(candRow({ Office: "President", Role: "Candidate D", Party: p.cands.d.party, "Home state": c2.home }, c2));
    ["t1", "t2"].forEach((k, i) => {
      if (!document.getElementById(`${k}-share`)) return;
      const t = readThird(k, p), flow = document.getElementById(`${k}-flow`);
      rows.push({ Office: "President", Role: `Third candidate ${i + 1}`, Party: p.cands[k] ? p.cands[k].party : "Independent", Name: document.getElementById(`${k}-name`).value,
        "Vote share": num(t.share, 2), "Voters to R": flow.dataset.touched === "1" ? flow.value : "" });
    });
    return rows;
  }

  function officeRows(key, allViews) {
    const d = DB(), off = d.OFFICES[key], st = d.S[key], label = off.name;
    const rows = [];
    rows.push({ Office: label, Role: "Setting: class", Value: st.classId });
    rows.push({ Office: label, Role: "Setting: environment", Value: st.env });
    const list = key === "senate" ? d.roster.senators : d.roster.governors;
    for (const e of list) {
      rows.push(candRow({ Office: label, Role: "Holder", State: e.state, Class: key === "senate" ? e.cls : e.year, Party: e.party, "Home state": e.state }, e));
    }
    for (const c of off.classes) {
      if (!allViews && c.id !== st.classId) continue;
      for (const def of c.defs) {
        const rs = st.viewRaces[c.id][def.state];
        for (const side of ["r", "d"]) {
          const cand = rs[side];
          rows.push(candRow({ Office: label, Role: side === "r" ? "Race R" : "Race D", State: def.state, Class: c.id,
            Party: side === "r" ? "R" : (cand.party === "I" ? "I" : "D"), Incumbent: yn(cand.incumbent), PVI: num(rs.pvi, 2), Adjustment: num(rs.adj, 1) }, cand));
        }
      }
    }
    return rows;
  }

  // opts: { president, senate, governor, races (the selected class), allViews (every class: a full snapshot) }
  function buildRows(opts) {
    const rows = [];
    if (opts.president && typeof document !== "undefined") rows.push(...presidentRows());
    for (const key of ["senate", "governor"]) {
      if (!opts[key]) continue;
      let r = officeRows(key, !!opts.allViews);
      if (!opts.races && !opts.allViews) r = r.filter((x) => !/^Race/.test(x.Role));
      rows.push(...r);
    }
    return rows;
  }

  // ---------- import ----------
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const isYes = (v) => /^(y|yes|true|1|x)$/i.test(String(v).trim());
  const blank = (v) => v === undefined || v === null || String(v).trim() === "";

  function readStats(row, side, where, report) {
    const out = {};
    for (const [col, key] of STATS) {
      if (blank(row[col])) continue;
      const v = parseFloat(row[col]);
      if (!Number.isFinite(v)) { report.warn(`${where}: ${col} "${row[col]}" is not a number, skipped`); continue; }
      const [lo, hi] = key === "partisanship" ? (side === "R" ? [1, 5] : [6, 10]) : [1, 10];
      const c = clamp(Math.round(v), lo, hi);
      if (c !== v) report.warn(`${where}: ${col} ${row[col]} moved to ${c} (allowed ${lo} to ${hi})`);
      out[key] = c;
    }
    if (!blank(row["Approval"])) {
      const v = parseFloat(row["Approval"]);
      if (Number.isFinite(v)) { out.approval = clamp(Math.round(v), 0, 100); if (out.approval !== v) report.warn(`${where}: Approval ${row["Approval"]} moved to ${out.approval}`); }
      else report.warn(`${where}: Approval "${row["Approval"]}" is not a number, skipped`);
    }
    return out;
  }

  function setField(id, value) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function applyPresident(rows, report) {
    if (typeof document === "undefined") { report.warn("President rows skipped: no page"); return; }
    const preset = rows.find((r) => /^setting: ?preset$/i.test(r.Role));
    if (preset && !blank(preset.Value)) {
      const v = String(preset.Value).trim();
      if (v === "current" || ELECTION_KEYS.includes(v)) {
        document.getElementById("preset-select").value = v;
        applyPreset(v);
        report.did("president preset " + v);
      } else report.warn(`President preset "${v}" doesn't exist, kept the current one`);
    }
    for (const r of rows) {
      const role = String(r.Role).trim().toLowerCase();
      if (role === "setting: environment") {
        const v = parseFloat(r.Value);
        if (Number.isFinite(v)) { setField("env", clamp(Math.round(v * 2), -70, 70)); report.did("president environment"); }
      } else if (role === "candidate r" || role === "candidate d") {
        const side = role === "candidate r" ? "R" : "D", pre = side === "R" ? "c1" : "c2";
        if (!blank(r.Name)) setField(`${pre}-name`, r.Name);
        const stats = readStats(r, side, `President ${side}`, report);
        for (const [, key] of STATS) if (key in stats) setField(`${pre}-${key}`, stats[key]);
        if ("approval" in stats) setField(`${pre}-approval`, stats.approval);
        if (!blank(r["Home state"])) {
          const hs = stateName(r["Home state"]);
          const sel = document.getElementById(`${pre}-home`);
          if (hs && sel && [...sel.options].some((o) => o.value === hs)) setField(`${pre}-home`, hs);
          else report.warn(`President ${side}: home state "${r["Home state"]}" isn't available in this election, skipped`);
        } else setField(`${pre}-home`, "");
        report.did(`president candidate ${side}`);
      } else if (/^third candidate [12]$/.test(role)) {
        const k = role.endsWith("1") ? "t1" : "t2";
        if (!document.getElementById(`${k}-share`)) { report.warn(`${r.Role}: this election has no such third-party card, skipped`); continue; }
        if (!blank(r.Name)) setField(`${k}-name`, r.Name);
        if (!blank(r["Vote share"])) { const v = parseFloat(r["Vote share"]); if (Number.isFinite(v)) setField(`${k}-share`, clamp(v, 0, 45)); }
        if (!blank(r["Voters to R"])) { const v = parseFloat(r["Voters to R"]); if (Number.isFinite(v)) setField(`${k}-flow`, clamp(Math.round(v), 0, 100)); }
        report.did(`president ${role}`);
      }
    }
  }

  function applyOffice(key, rows, report) {
    const d = DB(), off = d.OFFICES[key], st = d.S[key], label = off.name;
    const sets = rows.filter((r) => /^setting/i.test(r.Role));
    const cls = sets.find((r) => /class/i.test(r.Role));
    if (cls && !blank(cls.Value)) {
      const id = String(cls.Value).trim();
      if (off.classes.some((c) => c.id === id)) { d.setClass(key, id); report.did(`${label} class ${id}`); }
      else report.warn(`${label}: class "${id}" doesn't exist, kept the current one`);
    }
    const env = sets.find((r) => /environment/i.test(r.Role));
    if (env && !blank(env.Value)) { const v = parseFloat(env.Value); if (Number.isFinite(v)) { st.env = clamp(v, -15, 15); report.did(`${label} environment`); } }

    // 1) holders (who holds each seat, with their ideology)
    for (const r of rows.filter((x) => String(x.Role).trim().toLowerCase() === "holder")) {
      const where = `${label} holder ${r.State || "?"}`;
      const state = stateName(r.State);
      if (!state) { report.warn(`${where}: unknown state, skipped`); continue; }
      const party = String(r.Party || "").trim().toUpperCase();
      if (!["R", "D", "I"].includes(party)) { report.warn(`${where}: party must be R, D or I, skipped`); continue; }
      const list = key === "senate" ? d.roster.senators : d.roster.governors;
      let cls = key === "senate" ? parseInt(r.Class, 10) : null;
      const entry = list.find((e) => e.state === state && (key !== "senate" || e.cls === cls));
      if (!entry) { report.warn(`${where}: no ${key === "senate" ? "class " + r.Class + " seat" : "governorship"} there, skipped`); continue; }
      const patch = Object.assign({ party }, readStats(r, party === "R" ? "R" : "D", where, report));
      if (!blank(r.Name)) patch.name = String(r.Name).trim();
      d.setHolder(key, state, cls, patch);
      report.did(`${label} holder`);
    }
    // 2) race candidates
    for (const r of rows.filter((x) => /^race [rd]$/i.test(String(x.Role).trim()))) {
      const side = String(r.Role).trim().toLowerCase().endsWith("r") ? "r" : "d";
      const where = `${label} race ${r.State || "?"} (${r.Role})`;
      const state = stateName(r.State), id = String(r.Class || "").trim();
      const c = off.classes.find((x) => x.id === id);
      if (!state || !c || !c.defs.some((x) => x.state === state)) { report.warn(`${where}: no such race in class "${id}", skipped`); continue; }
      const rs = st.viewRaces[c.id][state], cand = rs[side];
      if (!blank(r.Name)) cand.name = String(r.Name).trim();
      if (!blank(r.Incumbent)) cand.incumbent = isYes(r.Incumbent);
      Object.assign(cand, readStats(r, side === "r" ? "R" : "D", where, report));
      if (side === "d" && !blank(r.Party)) cand.party = String(r.Party).trim().toUpperCase() === "I" ? "I" : "D";
      if (!blank(r.PVI) && Number.isFinite(parseFloat(r.PVI))) rs.pvi = clamp(parseFloat(r.PVI), PVI_MIN, PVI_MAX);
      if (!blank(r.Adjustment) && Number.isFinite(parseFloat(r.Adjustment))) rs.adj = clamp(parseFloat(r.Adjustment), -60, 60);
      report.did(`${label} race candidate`);
    }
  }

  // Parse text (tab- or comma-separated, header row required) and apply it. Returns { applied, warnings }.
  function importText(text) {
    const report = { counts: {}, warnings: [], did(k) { this.counts[k] = (this.counts[k] || 0) + 1; }, warn(m) { this.warnings.push(m); } };
    const table = parseDelimited(text);
    if (table.length < 2) { report.warn("Nothing to import: paste the table including its header row."); return finish(report, 0); }
    const header = table[0].map((h) => COLKEY[keyOf(h)] || null);
    if (!header.includes("Office") || !header.includes("Role")) { report.warn("The first row must be the header, with at least the Office and Role columns."); return finish(report, 0); }
    const rows = table.slice(1).filter((r) => r.some((c) => String(c).trim() !== "")).map((cells) => {
      const o = {};
      header.forEach((h, i) => { if (h) o[h] = cells[i] === undefined ? "" : String(cells[i]).trim(); });
      return o;
    });
    const by = (office) => rows.filter((r) => String(r.Office).trim().toLowerCase() === office);
    const known = new Set(["president", "senate", "governor"]);
    rows.forEach((r, i) => { if (!known.has(String(r.Office).trim().toLowerCase())) report.warn(`Row ${i + 2}: unknown office "${r.Office}", skipped`); });
    const pres = by("president");
    if (pres.length) applyPresident(pres, report);
    if (by("senate").length) applyOffice("senate", by("senate"), report);
    if (by("governor").length) applyOffice("governor", by("governor"), report);
    return finish(report, rows.length);
  }
  function finish(report, rowCount) {
    const applied = Object.values(report.counts).reduce((a, b) => a + b, 0);
    return { rows: rowCount, applied, counts: report.counts, warnings: report.warnings };
  }

  // ---------- presets (saved in this browser) ----------
  const STORE = "electionGameScenarioPresets";
  const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { return {}; } };
  const writeStore = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); return true; } catch (e) { return false; } };
  const ALL = { president: true, senate: true, governor: true, races: true, allViews: true };
  function savePreset(name) {
    const s = readStore();
    s[name] = { savedAt: new Date().toISOString(), text: toText(buildRows(ALL), "\t") };
    return writeStore(s);
  }
  function loadPreset(name) { const p = readStore()[name]; return p ? importText(p.text) : null; }
  function deletePreset(name) { const s = readStore(); delete s[name]; return writeStore(s); }
  function resetAll() {
    DB().resetScenario();
    if (typeof document !== "undefined") { document.getElementById("preset-select").value = "current"; applyPreset("current"); }
  }
  let undoText = null;

  // ---------- UI ----------
  function render() {
    const U = DB().ui, mk = U.mk, h = U.h;
    const panel = document.getElementById("tab-sheet");
    panel.innerHTML = "";
    const opts = { president: true, senate: true, governor: true, races: true, allViews: false };

    // --- export ---
    const ex = mk("section", "panel");
    ex.innerHTML = `<h3>Export to Google Sheets</h3>
      <p class="note">One table with the president's candidates, all 100 senators and all 50 governors (with their ideology, approval and the settings),
        and optionally the candidates in the races of the classes currently selected on the Senate and governor tabs. Copy it, click cell A1 in a
        Google Sheet and paste. Edit anything, then copy the whole sheet (header row included) and paste it into Import below.</p>
      <div class="radios" id="ex-opts"></div>
      <div class="btn-row"></div>
      <p class="note info" id="ex-info"></p>
      <textarea class="sheet" id="ex-text" readonly spellcheck="false"></textarea>
      <details class="legend"><summary>What the columns mean</summary>
        <p class="note"><b>Role</b>: Setting rows (preset, class, environment), Candidate R / D and Third candidate (president), Holder (the sitting senator or governor
        in each seat) and Race R / Race D (the two candidates in a race). <b>Class</b>: a senator's class (1, 2, 3) or a governor's next election year; for race rows
        the class view the race belongs to. <b>Party</b>: R, D or I (I = independent, counted with the Democrats). The five stances use the same scales as the sliders
        (partisanship 1 to 5 for Republicans, 6 to 10 for Democrats); Approval is 0 to 100. <b>Right-lean index</b> (0 = most left, 100 = most right) is worked out from
        the stances for display and is ignored on import. <b>PVI</b> and <b>Adjustment</b> belong to race rows. <b>Vote share</b> and <b>Voters to R</b> belong to
        third candidates. <b>Value</b> is for Setting rows.</p></details>`;
    panel.appendChild(ex);
    const optBox = ex.querySelector("#ex-opts");
    [["president", "President (the candidates on the president tab)"], ["senate", "Senate: all 100 senators"], ["governor", "Governors: all 50"],
      ["races", "Race candidates for the classes selected on the Senate and governor tabs"], ["allViews", "Every class (a full snapshot, used by presets)"]].forEach(([k, text]) => {
      const lab = mk("label", "radio", `<input type="checkbox" /> <span>${h(text)}</span>`);
      const cb = lab.querySelector("input");
      cb.checked = !!opts[k];
      cb.addEventListener("change", () => { opts[k] = cb.checked; refreshExport(); });
      optBox.appendChild(lab);
    });
    const area = ex.querySelector("#ex-text"), info = ex.querySelector("#ex-info");
    function refreshExport() {
      const rows = buildRows(opts);
      area.value = toText(rows, "\t");
      info.textContent = `${rows.length} rows, ${COLUMNS.length} columns.`;
    }
    const btns = ex.querySelector(".btn-row");
    const bCopy = mk("button", "btn", "Copy for Google Sheets"); bCopy.type = "button";
    bCopy.addEventListener("click", async () => {
      refreshExport();
      try { await navigator.clipboard.writeText(area.value); info.textContent += " Copied."; }
      catch (e) { area.select(); document.execCommand("copy"); info.textContent += " Copied."; }
    });
    const bCsv = mk("button", "btn ghost", "Download CSV"); bCsv.type = "button";
    bCsv.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([toText(buildRows(opts), ",")], { type: "text/csv" }));
      a.download = "election-game-scenario.csv"; a.click(); URL.revokeObjectURL(a.href);
    });
    const bRef = mk("button", "btn ghost", "Refresh"); bRef.type = "button"; bRef.addEventListener("click", refreshExport);
    btns.append(bCopy, bCsv, bRef);
    refreshExport();

    // --- import ---
    const im = mk("section", "panel");
    im.innerHTML = `<h3>Import from Google Sheets</h3>
      <p class="note">Paste the sheet here (tab- or comma-separated, header row included) or choose a CSV file. Only the rows and cells you include are changed; blank cells are left alone.
        Out-of-range numbers are moved to the nearest allowed value and listed below.</p>
      <textarea class="sheet" id="im-text" spellcheck="false" placeholder="Paste the sheet here"></textarea>
      <div class="btn-row"><input type="file" id="im-file" accept=".csv,.tsv,.txt" /></div>
      <div class="btn-row"></div><div id="im-report" class="note"></div>`;
    panel.appendChild(im);
    const imArea = im.querySelector("#im-text"), rep = im.querySelector("#im-report");
    im.querySelector("#im-file").addEventListener("change", async (e) => { const f = e.target.files[0]; if (f) imArea.value = await f.text(); });
    const showReport = (res, title) => {
      const counts = Object.entries(res.counts).map(([k, v]) => `${v} × ${k}`).join(", ");
      rep.innerHTML = `<b>${h(title)}</b> ${res.applied} changes applied from ${res.rows} rows${counts ? ` (${h(counts)})` : ""}.` +
        (res.warnings.length ? `<ul>${res.warnings.slice(0, 40).map((w) => `<li>${h(w)}</li>`).join("")}${res.warnings.length > 40 ? `<li>…and ${res.warnings.length - 40} more</li>` : ""}</ul>` : " No problems.");
    };
    const ib = im.querySelectorAll(".btn-row")[1];
    const bApply = mk("button", "btn primary", "Import"); bApply.type = "button";
    bApply.addEventListener("click", () => {
      undoText = toText(buildRows(ALL), "\t");
      showReport(importText(imArea.value), "Imported.");
      refreshExport(); refreshPresets();
    });
    const bUndo = mk("button", "btn ghost", "Undo last import"); bUndo.type = "button";
    bUndo.addEventListener("click", () => {
      if (!undoText) { rep.textContent = "Nothing to undo."; return; }
      showReport(importText(undoText), "Undone."); undoText = null; refreshExport();
    });
    ib.append(bApply, bUndo);

    // --- presets ---
    const pr = mk("section", "panel");
    pr.innerHTML = `<h3>Scenario presets</h3>
      <p class="note">Save everything (the president tab's candidates and settings, every Senate and governor class, the roster of senators and governors) under a name in
        this browser and load it later: build a scenario start, save it, come back to it. To share one or move it to another computer, export it above and send the sheet.</p>
      <div class="grid3"><div class="field"><label>Name</label><input type="text" id="pr-name" autocomplete="off" placeholder="e.g. 2000 start" /></div>
        <div class="field"><label>Saved presets</label><select id="pr-sel"></select></div></div>
      <div class="btn-row"></div><p class="note info" id="pr-info"></p>`;
    panel.appendChild(pr);
    const sel = pr.querySelector("#pr-sel"), nameIn = pr.querySelector("#pr-name"), prInfo = pr.querySelector("#pr-info");
    function refreshPresets() {
      const names = Object.keys(readStore()).sort();
      sel.innerHTML = names.length ? "" : `<option value="">(none saved yet)</option>`;
      for (const n of names) { const o = mk("option", "", h(n)); o.value = n; sel.appendChild(o); }
    }
    const pb = pr.querySelector(".btn-row");
    const bSave = mk("button", "btn primary", "Save current scenario"); bSave.type = "button";
    bSave.addEventListener("click", () => {
      const n = nameIn.value.trim();
      if (!n) { prInfo.textContent = "Type a name first."; return; }
      prInfo.textContent = savePreset(n) ? `Saved "${n}".` : "Couldn't save (the browser blocked storage).";
      refreshPresets(); sel.value = n;
    });
    const bLoad = mk("button", "btn", "Load"); bLoad.type = "button";
    bLoad.addEventListener("click", () => {
      if (!sel.value) return;
      undoText = toText(buildRows(ALL), "\t");
      const res = loadPreset(sel.value);
      prInfo.textContent = res ? `Loaded "${sel.value}": ${res.applied} changes${res.warnings.length ? `, ${res.warnings.length} warnings` : ""}.` : "That preset is gone.";
      refreshExport();
    });
    const bDel = mk("button", "btn ghost", "Delete"); bDel.type = "button";
    bDel.addEventListener("click", () => { if (sel.value && deletePreset(sel.value)) { prInfo.textContent = `Deleted "${sel.value}".`; refreshPresets(); } });
    const bReset = mk("button", "btn ghost", "Reset everything to the real current roster"); bReset.type = "button";
    bReset.addEventListener("click", () => { undoText = toText(buildRows(ALL), "\t"); resetAll(); prInfo.textContent = "Everything is back to the default scenario."; refreshExport(); });
    pb.append(bSave, bLoad, bDel, bReset);
    refreshPresets();
  }

  root.Scenario = { COLUMNS, buildRows, toText, parseDelimited, importText, rightIndex, savePreset, loadPreset, deletePreset, resetAll, stateName, render };
})();
