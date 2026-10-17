// Down-ballot tabs: Senate and Governor races, each as a "single race" tab and an "all races" tab.
// Every Senate class (2026, 2028, 2030) and every gubernatorial year (2026-2030) is editable; pick the class at the
// top of the tab. Uses the globals from script.js (STATES, issueScore, TYPICAL_R/D, ...) and RACES from races.js.
(function () {
  "use strict";
  const root = typeof globalThis !== "undefined" ? globalThis : window;

  // ---------- Model ----------
  // margin (R minus D, points) =
  //     national environment shift                       (slider, 0 = where the forecasters have it now)
  //   + 2 x state PVI                                    (presidential lean, editable per race)
  //   + 3 per incumbent (+ for Republican, - for Democrat)
  //   + incumbent president effect                       (party + approval of the sitting president, see presidentEffect())
  //   + race adjustment                                  (default calibrated to the Cook rating, see calibrate())
  //   + 0.5 x issue fit vs. a typical R / typical D      (same issue scoring as the presidential game)
  //   + 0.25 x approval gap                              (Republican minus Democrat candidate)
  const INCUMBENT_BONUS = 3;
  const TOSSUP_EDGE = 0.5;                                  // a Tossup starts half a point toward the party holding the seat
  const BANDS = { Solid: [12, Infinity], Likely: [7, 12], Lean: [3, 7] };   // |margin| range of each Cook rating
  const ENV_MIN = -15, ENV_MAX = 15, ADJ_MIN = -60, ADJ_MAX = 60;
  // Margin points per point of presidential approval away from 50: a president under 50% hurts their own party's
  // candidates, a president over 50% helps them. Governor races are less nationalized than Senate races.
  const PRES_COEF = { senate: 0.4, governor: 0.3 };
  // Default: Trump, 36% approval (polling averages on Oct 8, 2026: Silver Bulletin 36.6, RCP 37.6, Economist 35, NYT 37).
  const DEFAULT_PRESIDENT = { party: "R", approval: 36 };

  const OFFICES = {
    senate: { key: "senate", name: "Senate", noun: "seat", data: RACES.senate },
    governor: { key: "governor", name: "Governor", noun: "governorship", data: RACES.governor },
  };
  for (const off of Object.values(OFFICES)) {
    off.classOrder = Object.keys(off.data.classes);
    off.classes = {};
    for (const [ck, c] of Object.entries(off.data.classes)) {
      off.classes[ck] = {
        key: ck, label: c.label, year: c.year, note: c.note || "", notUp: c.notUp,
        defs: c.races.map((a) => ({
          state: a[0], heldBy: a[1], rating: a[2], special: !!a[8],
          r: { name: a[3], incumbent: !!a[4] },
          d: { name: a[5], incumbent: !!a[6], party: a[7] },
        })),
      };
    }
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const h = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  function parseRating(text) {
    if (/tossup/i.test(text)) return { label: "Tossup", side: 0 };
    if (/not rated/i.test(text)) return { label: "Not rated", side: 0, unrated: true };
    const [label, party] = text.split(" ");
    return { label, side: party === "R" ? 1 : -1 };
  }

  // Margin shift from the incumbent president: + toward the Republican, - toward the Democrat.
  const presidentEffect = (office, pres) => (pres.party === "R" ? 1 : -1) * PRES_COEF[office] * (pres.approval - 50);

  // Margin with typical candidates, equal approval, no adjustment, no president effect and a 0 environment shift.
  const baseMargin = (def, pvi) =>
    PVI_TO_MARGIN * pvi + INCUMBENT_BONUS * ((def.r.incumbent ? 1 : 0) - (def.d.incumbent ? 1 : 0));

  // The default "race adjustment" moves the default margin into the band of the race's Cook rating, and nothing
  // more: a race already inside its band keeps its margin. Tossups start half a point toward the party holding the
  // seat. The adjustment also cancels the default president's effect, so the rated (2026) races start exactly where
  // the Cook rating has them and moving the president's approval shows the change from there.
  // Races with no Cook rating (the future classes) get 0, so they start at 2 x PVI + incumbency + the president effect.
  function calibrate(def, pvi, office) {
    const rt = parseRating(def.rating);
    if (rt.unrated) return 0;
    const m0 = baseMargin(def, pvi);
    let target;
    if (rt.side === 0) {
      target = TOSSUP_EDGE * (def.heldBy === "R" ? 1 : -1);
    } else {
      const [lo, hi] = BANDS[rt.label];
      target = clamp(m0 * rt.side, lo, hi) * rt.side;
    }
    return roundM(target - m0 - presidentEffect(office || "senate", DEFAULT_PRESIDENT));
  }

  const typicalCandidate = (typical, extra) => Object.assign({}, typical, { approval: 50 }, extra);

  function newRace(def, office) {
    const pvi = STATES[def.state].pvi;
    return {
      pvi,
      adj: calibrate(def, pvi, office),
      heldBy: def.heldBy,
      r: typicalCandidate(TYPICAL_R, { name: def.r.name, incumbent: def.r.incumbent }),
      d: typicalCandidate(TYPICAL_D, { name: def.d.name, incumbent: def.d.incumbent, party: def.d.party }),
    };
  }

  // Per-office state: { cls: selected class, byClass: { classKey: { env, selected, pres, races: { stateName: race } } } }.
  // Every class keeps its own edits, so you can switch classes without losing anything.
  const S = {};
  function newClassState(key, ck) {
    const cls = OFFICES[key].classes[ck];
    const st = { env: 0, selected: cls.defs[0].state, pres: Object.assign({}, DEFAULT_PRESIDENT), races: {} };
    for (const def of cls.defs) st.races[def.state] = newRace(def, key);
    return st;
  }
  function resetClass(key, ck) { S[key].byClass[ck] = newClassState(key, ck); }
  function resetOffice(key) {
    S[key] = { cls: OFFICES[key].data.defaultClass, byClass: {} };
    for (const ck of OFFICES[key].classOrder) resetClass(key, ck);
  }
  Object.keys(OFFICES).forEach(resetOffice);

  // The selected class of an office: its definition and its editable state.
  function cur(key) {
    const s = S[key];
    return { off: OFFICES[key], cls: OFFICES[key].classes[s.cls], st: s.byClass[s.cls] };
  }

  function raceMargin(def, rs, env, office, pres) {
    const base = STATES[def.state];
    const fit = issueScore(base, rs.r) - issueScore(base, rs.d);
    const ref = issueScore(base, TYPICAL_R) - issueScore(base, TYPICAL_D);
    const parts = {
      environment: env,
      lean: PVI_TO_MARGIN * rs.pvi,
      incumbency: INCUMBENT_BONUS * ((rs.r.incumbent ? 1 : 0) - (rs.d.incumbent ? 1 : 0)),
      president: presidentEffect(office, pres),
      adjustment: rs.adj,
      issues: POINTS_TO_MARGIN * (fit - ref),
      approval: approvalSwing(rs.r.approval, rs.d.approval),
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    return { margin: roundM(clamp(total, -100, 100)), parts };
  }

  // Ties (exactly 0.000) go to the party holding the seat, so live updates don't flicker; tests can pass an rng.
  function simulateOffice(key, rng) {
    const { cls, st } = cur(key);
    const rows = [], flips = [];
    let winsD = 0, winsR = 0, indep = 0;
    for (const def of cls.defs) {
      const rs = st.races[def.state];
      const { margin, parts } = raceMargin(def, rs, st.env, key, st.pres);
      let winner = margin > 0 ? "R" : margin < 0 ? "D" : null;
      const tie = winner === null;
      if (tie) winner = rng ? (rng() < 0.5 ? "R" : "D") : rs.heldBy;
      const cand = winner === "R" ? rs.r : rs.d;
      const flipped = winner !== rs.heldBy;
      if (winner === "R") winsR++; else { winsD++; if (rs.d.party === "I") indep++; }
      if (flipped) flips.push({ state: def.state, from: rs.heldBy, to: winner });
      rows.push({ def, rs, margin, parts, winner, tie, flipped, winnerName: cand.name });
    }
    const seatsD = cls.notUp.D + winsD, seatsR = cls.notUp.R + winsR;
    let control;
    if (key === "senate") control = seatsD > seatsR ? "D" : seatsR > seatsD ? "R" : st.pres.party;   // 50-50: the Vice President's party (the president's)
    else control = seatsD > seatsR ? "D" : seatsR > seatsD ? "R" : "tie";
    return { rows, flips, winsD, winsR, indep, seatsD, seatsR, control, year: cls.year };
  }

  // ---------- UI helpers ----------
  const ratingOf = (m) => {
    const a = Math.abs(m);
    const label = a >= 12 ? "Solid" : a >= 7 ? "Likely" : a >= 3 ? "Lean" : "Toss-up";
    return label === "Toss-up" ? "Toss-up" : `${label} ${m > 0 ? "R" : "D"}`;
  };
  const partyLabel = (p) => (p === "R" ? "Republican" : p === "D" ? "Democratic" : "Independent");
  const signed = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1);

  function mk(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // A labelled range slider. Returns the wrapper; onInput receives the numeric value.
  function addSlider(parent, o) {
    const f = mk("div", "field");
    f.innerHTML = `<label><span>${o.label}</span><span class="val wide">${o.fmt ? o.fmt(o.value) : o.value}</span></label>
      <input type="range" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${o.value}" />`;
    const input = f.querySelector("input"), val = f.querySelector(".val");
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      val.textContent = o.fmt ? o.fmt(v) : v;
      o.onInput(v);
    });
    parent.appendChild(f);
    return f;
  }

  // Name, incumbent checkbox, five stance sliders and approval for one candidate.
  function buildCandidateEditor(parent, def, rs, side, onChange) {
    const c = rs[side];
    const defs = side === "r" ? CAND1_SLIDERS : CAND2_SLIDERS;
    const indep = side === "d" && c.party === "I";
    const card = mk("article", "card " + (side === "r" ? "red" : "blue"));
    card.appendChild(mk("h3", "", side === "r" ? "Republican" : indep ? "Independent (Democratic-side slot)" : "Democrat"));
    const nameField = mk("div", "field", `<label>Name</label><input type="text" autocomplete="off" />`);
    const nameInput = nameField.querySelector("input");
    nameInput.value = c.name;
    nameInput.addEventListener("input", () => { c.name = nameInput.value; onChange("name"); });
    card.appendChild(nameField);
    const incField = mk("div", "field check", `<label><input type="checkbox" /> Incumbent (+${INCUMBENT_BONUS} points)</label>`);
    const inc = incField.querySelector("input");
    inc.checked = c.incumbent;
    inc.addEventListener("change", () => { c.incumbent = inc.checked; onChange("incumbent"); });
    card.appendChild(incField);
    for (const d of defs) {
      addSlider(card, { label: d.prompt, min: d.min, max: d.max, value: c[d.key], onInput: (v) => { c[d.key] = v; onChange(d.key); } });
    }
    parent.appendChild(card);
  }

  // Party holding the seat, PVI and race adjustment for one race.
  function buildRaceSettings(parent, def, rs, onChange, onReset) {
    const hf = mk("div", "field", `<label>Party holding the seat (decides what counts as a flip and who wins a dead-even race)</label>
      <select><option value="R">Republican</option><option value="D">Democratic</option></select>`);
    const hs = hf.querySelector("select");
    hs.value = rs.heldBy;
    hs.addEventListener("change", () => { rs.heldBy = hs.value; onChange("heldBy"); });
    parent.appendChild(hf);
    addSlider(parent, {
      label: "State PVI (presidential lean)", min: PVI_MIN, max: PVI_MAX, step: 0.1, value: rs.pvi, fmt: fmtPvi,
      onInput: (v) => { rs.pvi = v; onChange("pvi"); },
    });
    addSlider(parent, {
      label: "Race adjustment (default calibrated to the Cook rating, 0 if unrated)", min: ADJ_MIN, max: ADJ_MAX, step: 0.5, value: rs.adj,
      fmt: (v) => signed(v) + " pts",
      onInput: (v) => { rs.adj = v; onChange("adj"); },
    });
    const b = mk("button", "btn ghost", "Reset this race");
    b.type = "button";
    b.addEventListener("click", onReset);
    parent.appendChild(b);
  }

  function addEnvSlider(parent, key, onChange) {
    const rated = cur(key).cls.defs.some((d) => !/not rated/i.test(d.rating));
    addSlider(parent, {
      label: `National environment shift (${rated ? "0 = where forecasters have it now" : "0 = no shift; this class has no Cook ratings"}; D+ helps Democrats, R+ helps Republicans)`,
      min: ENV_MIN, max: ENV_MAX, step: 0.5, value: cur(key).st.env, fmt: (v) => fmtMargin(v),
      onInput: (v) => { cur(key).st.env = v; onChange(); },
    });
  }

  // Class picker plus the incumbent president's party and approval. Shared by the single and all-races tabs.
  function buildClassPanel(key, onClassChange, onPresChange) {
    const { off, cls, st } = cur(key);
    const box = mk("section", "panel");
    box.innerHTML = `<h3>${off.name}: election class</h3>
      <div class="field"><label>Class</label><select class="cls-select">${off.classOrder.map((ck) => `<option value="${ck}">${h(off.classes[ck].label)} — ${off.classes[ck].defs.length} ${off.classes[ck].defs.length === 1 ? off.noun : off.noun + "s"}</option>`).join("")}</select></div>
      <p class="note">${h(cls.note)}</p>`;
    const sel = box.querySelector(".cls-select");
    sel.value = S[key].cls;
    sel.addEventListener("change", () => { S[key].cls = sel.value; onClassChange(); });
    const pf = mk("div", "field", `<label>Party of the incumbent president</label>
      <select class="pres-party"><option value="R">Republican</option><option value="D">Democratic</option></select>`);
    const ps = pf.querySelector("select");
    ps.value = st.pres.party;
    ps.addEventListener("change", () => { st.pres.party = ps.value; onPresChange(); });
    box.appendChild(pf);
    addSlider(box, {
      label: "Approval of the incumbent president (50 = neutral; below 50 hurts the president's party)",
      min: 0, max: 100, step: 1, value: st.pres.approval, fmt: (v) => v + "%",
      onInput: (v) => { st.pres.approval = v; onPresChange(); },
    });
    box.appendChild(mk("p", "note", `Each point away from 50 moves every race ${PRES_COEF[key]} points toward the president's party (above 50) or away from it (below 50). Default: Trump at ${DEFAULT_PRESIDENT.approval}% (October 2026 polling averages). In the 2026 class the default race adjustments already absorb that, so moving it shows the change from where the forecasters have things now.`));
    return box;
  }

  const holdText = (rs) => (rs.heldBy === "R" ? "Republican" : "Democratic");
  const classNoteLine = (def, rs, noun) =>
    `${holdText(rs)}-held ${noun}${def.special ? " (special election)" : ""} · Cook rating: ${/not rated/i.test(def.rating) ? "none yet" : def.rating}`;

  // ---------- Single race tab ----------
  function renderSingle(key) {
    const panel = document.getElementById(`tab-${key}-single`);
    panel.innerHTML = "";
    let result = null, refresh = () => {};
    panel.appendChild(buildClassPanel(key, () => renderSingle(key), () => refresh()));
    const { off, cls, st } = cur(key);
    const top = mk("section", "panel");
    top.innerHTML = `<h3>${off.name}: single race (${h(cls.label)})</h3>
      <div class="field"><label>Race</label><select></select></div><p class="note info"></p>`;
    const sel = top.querySelector("select"), info = top.querySelector(".info");
    const fillOptions = () => {
      sel.innerHTML = "";
      for (const d of cls.defs) {
        const o = mk("option", "", h(d.state + (d.special ? " (special)" : "")) + ` — ${st.races[d.state].heldBy}-held`);
        o.value = d.state;
        sel.appendChild(o);
      }
      sel.value = st.selected;
    };
    if (!cls.defs.some((d) => d.state === st.selected)) st.selected = cls.defs[0].state;
    fillOptions();
    panel.appendChild(top);
    const candBox = mk("section", "cards");
    const settings = mk("section", "panel");
    result = mk("section", "panel result");
    panel.append(candBox, settings, result);

    const draw = () => {
      const def = cls.defs.find((d) => d.state === st.selected), rs = st.races[def.state];
      info.textContent = classNoteLine(def, rs, off.noun);
      candBox.innerHTML = ""; settings.innerHTML = "";
      const update = (what) => {
        if (what === "heldBy") { fillOptions(); info.textContent = classNoteLine(def, rs, off.noun); }
        showResult(result, def, rs, st.env, key, st.pres);
      };
      refresh = () => update();
      buildCandidateEditor(candBox, def, rs, "r", update);
      buildCandidateEditor(candBox, def, rs, "d", update);
      settings.appendChild(mk("h3", "", "Race settings"));
      buildRaceSettings(settings, def, rs, update, () => { st.races[def.state] = newRace(def, key); fillOptions(); draw(); });
      addEnvSlider(settings, key, () => update());
      update();
    };
    sel.addEventListener("change", () => { st.selected = sel.value; draw(); });
    draw();
  }

  function showResult(box, def, rs, env, key, pres) {
    const { margin, parts } = raceMargin(def, rs, env, key, pres);
    const winner = margin > 0 ? "R" : margin < 0 ? "D" : rs.heldBy;
    const cand = winner === "R" ? rs.r : rs.d;
    const flip = winner !== rs.heldBy;
    const shareR = 50 + margin / 2;
    const row = (label, v) => `<tr><td>${label}</td><td class="num">${signed(v)}</td></tr>`;
    box.innerHTML = `<h3>Result</h3>
      <div class="verdict ${margin === 0 ? "tie" : "win"}">${margin === 0 ? "Dead even; goes to the party holding the seat: " : "🎉 "}${h(cand.name)}${cand.party === "I" ? " (I)" : ""} wins${flip ? " (flip from " + holdText(rs) + ")" : ""}, margin ${fmtMargin(margin)} (${ratingOf(margin)})</div>
      <p class="note">Two-party share roughly R ${shareR.toFixed(1)}% to D ${(100 - shareR).toFixed(1)}%.</p>
      <table class="breakdown"><tbody>
        ${row("National environment shift", parts.environment)}
        ${row("Presidential lean (2 × state PVI " + fmtPvi(rs.pvi) + ")", parts.lean)}
        ${row("Incumbency", parts.incumbency)}
        ${row(`Incumbent president (${pres.party}, ${pres.approval}% approval)`, parts.president)}
        ${row("Race adjustment", parts.adjustment)}
        ${row("Issue fit vs. typical candidates", parts.issues)}
        ${row("Candidate approval gap", parts.approval)}
        <tr class="total"><td>Total margin (+ = Republican, − = Democrat)</td><td class="num">${fmtMargin(margin)}</td></tr>
      </tbody></table>`;
  }

  // ---------- All races tab ----------
  function renderAll(key) {
    const panel = document.getElementById(`tab-${key}-all`);
    panel.innerHTML = "";
    let refresh = () => {};
    panel.appendChild(buildClassPanel(key, () => renderAll(key), () => refresh()));
    const { off, cls, st } = cur(key);
    const specials = cls.defs.filter((d) => d.special).length;
    const top = mk("section", "panel");
    top.innerHTML = `<h3>${off.name}: all races (${h(cls.label)})</h3>
      <p class="note">All ${cls.defs.length} ${off.noun}${cls.defs.length === 1 ? "" : "s"} up in ${cls.year}${specials ? ` (including ${specials} special election${specials > 1 ? "s" : ""})` : ""}.
        ${off.key === "senate" ? "Seats not up" : "Governorships not up"}: ${cls.notUp.D} Democratic${off.key === "senate" ? " caucus" : ""}, ${cls.notUp.R} Republican.
        Edit any candidate's name or the party holding the seat in the table, or press Edit for stances, approval, incumbency and the race's PVI and adjustment. Results update as you type.</p>`;
    const controls = mk("div", "all-controls");
    addEnvSlider(controls, key, () => refresh());
    const reset = mk("button", "btn ghost", `Reset all ${cls.year} ${off.name.toLowerCase()} races`);
    reset.type = "button";
    reset.addEventListener("click", () => { resetClass(key, S[key].cls); renderAll(key); });
    controls.appendChild(reset);
    top.appendChild(controls);
    const summary = mk("section", "panel summary");
    const wrap = mk("div", "table-wrap");
    const table = mk("table", "race-table");
    table.innerHTML = `<thead><tr><th>State</th><th>Held by</th><th>Cook</th><th>Republican</th><th>Democratic side</th><th></th><th>Result</th></tr></thead>`;
    const tbody = mk("tbody");
    table.appendChild(tbody);
    wrap.appendChild(table);
    panel.append(top, summary, wrap);

    const cells = {};
    for (const def of cls.defs) {
      const rs = st.races[def.state];
      const tr = mk("tr");
      tr.innerHTML = `<td><b>${h(def.state)}</b>${def.special ? " <small>(special)</small>" : ""}</td>
        <td><select class="held" aria-label="${h(def.state)} party holding the seat"><option value="R">R</option><option value="D">D</option></select></td>
        <td>${/not rated/i.test(def.rating) ? "<small>—</small>" : h(def.rating)}</td><td class="name r"></td><td class="name d"></td>
        <td><button type="button" class="btn ghost small">Edit</button></td><td class="res"></td>`;
      const held = tr.querySelector(".held");
      held.value = rs.heldBy;
      held.addEventListener("change", () => { rs.heldBy = held.value; refresh(); });
      for (const side of ["r", "d"]) {
        const input = mk("input");
        input.type = "text"; input.value = rs[side].name; input.setAttribute("aria-label", `${def.state} ${side === "r" ? "Republican" : "Democratic-side"} candidate`);
        input.addEventListener("input", () => { rs[side].name = input.value; refresh(); });
        tr.querySelector(`.name.${side}`).appendChild(input);
        if (side === "d" && rs.d.party === "I") tr.querySelector(".name.d").appendChild(mk("small", "ind", " (I)"));
      }
      cells[def.state] = tr.querySelector(".res");
      tbody.appendChild(tr);
      const detail = mk("tr", "detail");
      detail.hidden = true;
      const td = mk("td"); td.colSpan = 7; detail.appendChild(td);
      tbody.appendChild(detail);
      let built = false;
      tr.querySelector("button").addEventListener("click", () => {
        detail.hidden = !detail.hidden;
        if (!detail.hidden && !built) {
          built = true;
          const grid = mk("div", "cards"); td.appendChild(grid);
          buildCandidateEditor(grid, def, rs, "r", () => refresh());
          buildCandidateEditor(grid, def, rs, "d", () => refresh());
          const set = mk("div", "panel"); td.appendChild(set);
          buildRaceSettings(set, def, rs, (what) => { if (what === "heldBy") held.value = rs.heldBy; refresh(); }, () => { st.races[def.state] = newRace(def, key); renderAll(key); });
        }
      });
    }

    refresh = function () {
      const sim = simulateOffice(key);
      for (const r of sim.rows) {
        const c = cells[r.def.state];
        c.className = "res " + (r.winner === "R" ? "r" : "b");
        c.innerHTML = `${r.flipped ? '<span class="flip">FLIP</span> ' : ""}<b>${h(r.winnerName)}</b> <small>${fmtMargin(r.margin)}</small>`;
      }
      const dTotal = sim.seatsD, rTotal = sim.seatsR;
      let verdict;
      if (key === "senate") {
        verdict = sim.control === "D" ? "Democrats control the Senate" : "Republicans control the Senate";
        if (dTotal === rTotal) verdict += ` (50-50, the ${sim.control === "R" ? "Republican" : "Democratic"} Vice President breaks ties)`;
      } else {
        verdict = sim.control === "D" ? "Democrats hold more governorships" : sim.control === "R" ? "Republicans hold more governorships" : "Governorships split evenly";
      }
      const flipText = sim.flips.length
        ? sim.flips.map((f) => `${h(f.state)} (${f.from}→${f.to})`).join(", ")
        : "none";
      const dLabel = key === "senate" ? "Democratic caucus" : "Democrats";
      const indepNote = key === "senate" && sim.indep
        ? `<p class="note">${sim.indep} independent winner${sim.indep > 1 ? "s are" : " is"} counted with the Democrats (assumed to caucus with them).</p>` : "";
      summary.innerHTML = `<h3>${h(verdict)}</h3>
        <div class="tally"><div class="t b"><span>${dLabel}</span><b>${dTotal}</b></div><div class="t r"><span>Republicans</span><b>${rTotal}</b></div></div>
        <p class="note">Races won in ${sim.year}: Democratic side ${sim.winsD}, Republican ${sim.winsR}. Held over (not up): D ${cls.notUp.D}, R ${cls.notUp.R}.</p>
        <p class="note"><b>Flips (${sim.flips.length}):</b> ${flipText}</p>${indepNote}`;
    };
    refresh();
  }

  // ---------- Tabs ----------
  function renderTab(name) {
    const m = /^(senate|governor)-(single|all)$/.exec(name);
    if (!m) return;
    (m[2] === "single" ? renderSingle : renderAll)(m[1]);
  }

  function initTabs() {
    const buttons = document.querySelectorAll("#tabs .tab");
    const show = (name) => {
      buttons.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
      document.querySelectorAll(".tabpanel").forEach((p) => { p.hidden = p.id !== "tab-" + name; });
      renderTab(name);
      window.scrollTo({ top: 0 });
    };
    buttons.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
  }

  root.DownBallot = { OFFICES, S, cur, parseRating, calibrate, baseMargin, presidentEffect, newRace, resetOffice, resetClass, raceMargin, simulateOffice,
    ratingOf, BANDS, INCUMBENT_BONUS, PRES_COEF, DEFAULT_PRESIDENT };
  if (typeof document !== "undefined" && document.getElementById("tabs")) initTabs();
})();
