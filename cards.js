// Flashcards with spaced repetition (Cards tab).
// Front: Hangul, so you practice decoding it first. You can hear it (🔊) and say
// it into the microphone (🎤) for a pronunciation check before flipping.
// Back: translation, the word's spoken forms with YouGlish links (the same panel
// as the Listen tab), and Again / Hard / Good / Easy buttons that schedule the
// next review (srs.js).

const Cards = (() => {
  let deck = {}; // word → card
  let day = { key: "", newDone: 0 };
  let opts = { newPerDay: 16, speakOnReveal: true };
  let current = null;
  let lastWord = null;
  let ui = null; // { speak, renderForms, getWords, showTab }
  let pendingRows = []; // [{ word, translation, alts, source }]

  const $ = (id) => document.getElementById(id);
  const list = () => Object.values(deck);
  const HANGUL_RUN = /[가-힣]+/g;

  async function save() {
    await Platform.setData({ deck, cardsDay: day });
  }

  function newAllowed() {
    const key = SRS.todayKey();
    if (day.key !== key) day = { key, newDone: 0 };
    return opts.newPerDay - day.newDone;
  }

  function el(tag, props = {}, ...children) {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
  }

  // ---- views ----

  function showView(name) {
    document.querySelectorAll("#cards .seg button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    document.querySelectorAll("#cards .cview").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    if (name === "study") nextCard();
    if (name === "deck") renderDeck();
  }

  function renderStats() {
    const s = SRS.stats(list());
    const fresh = Math.min(s.fresh, Math.max(0, newAllowed()));
    $("cardStats").textContent = s.total
      ? `${s.due} due · ${fresh} new · ${s.total} cards`
      : "No cards yet";
  }

  // ---- study ----

  function nextCard() {
    renderStats();
    current = SRS.next(list(), newAllowed(), Date.now(), lastWord);
    $("sayResult").textContent = "";
    $("cardBack").hidden = true;
    $("cardFlip").hidden = false;
    if (!current) {
      $("studyCard").hidden = true;
      $("studyEmpty").hidden = false;
      const s = SRS.stats(list());
      $("studyEmpty").textContent = !s.total
        ? "Your deck is empty. Use Add to turn your word list into cards."
        : "🎉 All done for now. Come back tomorrow: words return just before you'd forget them."
          + (s.fresh ? ` ${s.fresh} new card${s.fresh === 1 ? "" : "s"} will start then (daily limit: ${opts.newPerDay}, change it in ⚙).` : "");
      return;
    }
    $("studyEmpty").hidden = true;
    $("studyCard").hidden = false;
    $("cardFront").textContent = current.word;
    $("cardTag").textContent = current.seen ? SRS.dueLabel(current) === "due now" ? "review" : "learning" : "new";
  }

  function flip() {
    if (!current) return;
    $("cardFlip").hidden = true;
    $("cardBack").hidden = false;
    $("cardTranslation").textContent = current.translation;
    ui.renderForms($("cardForms"), current.word);
    document.querySelectorAll("#cardBack .grades button").forEach((b) => {
      b.querySelector("small").textContent = SRS.preview(current, +b.dataset.grade);
    });
    if (opts.speakOnReveal) ui.speak(current.word);
  }

  async function grade(g) {
    if (!current) return;
    if (!current.seen) day.newDone++;
    deck[current.word] = SRS.schedule(current, g);
    lastWord = current.word;
    await save();
    nextCard();
  }

  // ---- pronunciation check (speech recognition) ----

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Hangul syllables → jamo, so "close" can be judged letter by letter.
  function jamo(s) {
    let out = "";
    for (const ch of s) {
      const c = ch.charCodeAt(0) - 0xac00;
      if (c < 0 || c > 11171) continue;
      out += String.fromCharCode(0x1100 + Math.floor(c / 588), 0x1161 + Math.floor((c % 588) / 28));
      if (c % 28) out += String.fromCharCode(0x11a7 + (c % 28));
    }
    return out;
  }

  function similarity(a, b) {
    a = jamo(a); b = jamo(b);
    if (!a.length || !b.length) return 0;
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0];
      d[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = d[j];
        d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return 1 - d[b.length] / Math.max(a.length, b.length);
  }

  function judge(heardList, word) {
    const targets = KoreanConjugator.forms(word).map((f) => f.text.replace(/\s/g, ""));
    let best = { heard: heardList[0] || "", score: 0 };
    for (const raw of heardList) {
      const heard = (raw.match(HANGUL_RUN) || []).join("");
      for (const t of targets) {
        const score = heard === t || heard.includes(t) ? 1 : similarity(heard, t);
        if (score > best.score) best = { heard: raw.trim(), score };
      }
    }
    return best;
  }

  function sayIt() {
    if (!current) return;
    const word = current.word;
    const out = $("sayResult");
    const rec = new Recognition();
    rec.lang = "ko-KR";
    rec.maxAlternatives = 5;
    rec.interimResults = false;
    out.textContent = "🎙️ Listening… say the word.";
    $("cardSay").disabled = true;
    rec.onresult = (e) => {
      const heard = [...e.results[0]].map((a) => a.transcript);
      const { heard: best, score } = judge(heard, word);
      out.innerHTML = "";
      const verdict = score >= 1 ? "✅ Clear! Heard " : score >= 0.7 ? "🟡 Close. Heard " : "❌ Heard ";
      const hearBtn = el("button", { className: "inline", textContent: "🔊", title: "Hear what it heard", onclick: () => ui.speak(best) });
      out.append(verdict, el("b", { textContent: best || "nothing" }), " ", hearBtn);
      if (score < 1) out.append(" · ", el("button", { className: "inline", textContent: "🔊 correct", onclick: () => ui.speak(word) }));
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        out.textContent = "Microphone is blocked. ";
        if (Platform.kind === "extension") {
          out.append(el("a", { href: "#", textContent: "Open in a tab to allow it", onclick: (ev) => { ev.preventDefault(); Platform.openFullPage(); } }));
        } else {
          out.append("Allow microphone access for this site in your browser settings.");
        }
      } else if (e.error === "no-speech") {
        out.textContent = "Didn't hear anything. Tap 🎤 and try again.";
      } else {
        out.textContent = "Speech check unavailable: " + e.error;
      }
    };
    rec.onend = () => { $("cardSay").disabled = false; if (out.textContent.startsWith("🎙️")) out.textContent = ""; };
    rec.start();
  }

  // ---- adding cards ----

  function startAdding(words) {
    ui.showTab("cards");
    showView("add");
    $("addInput").value = words.join("\n");
    translateInput();
  }

  // Lines may be "word" or "word, translation" / "word<TAB>translation".
  function parseInput(text) {
    const rows = [];
    for (const line of text.split(/\n/)) {
      const m = line.match(/^\s*([가-힣]+)\s*[\t,;:=]\s*(.+?)\s*$/);
      if (m) { rows.push({ word: m[1], translation: m[2] }); continue; }
      for (const w of line.match(HANGUL_RUN) || []) rows.push({ word: w, translation: "" });
    }
    const seen = new Set();
    return rows.filter((r) => !seen.has(r.word) && seen.add(r.word));
  }

  async function translateInput() {
    const parsed = parseInput($("addInput").value);
    const already = parsed.filter((r) => deck[r.word]);
    pendingRows = parsed.filter((r) => !deck[r.word]).map((r) => ({ ...r, alts: [], source: r.translation ? "yours" : "" }));
    $("addReview").hidden = false;
    const skipped = already.length ? ` ${already.length} already in your deck (skipped).` : "";
    if (!pendingRows.length) {
      $("addRows").innerHTML = "";
      $("addConfirm").hidden = true;
      $("addStatus").textContent = parsed.length ? "All of these are already in your deck." : "No Korean words found.";
      return;
    }
    $("addConfirm").hidden = false;
    renderAddRows();
    const todo = pendingRows.filter((r) => !r.translation);
    let done = 0;
    $("addStatus").textContent = todo.length ? `Translating ${todo.length} words…` : "Check the translations, then add.";
    await Translator.translateAll(todo.map((r) => r.word), (word, res) => {
      const row = pendingRows.find((r) => r.word === word);
      if (!row) return;
      if (res) Object.assign(row, { translation: res.text, alts: res.alts, source: res.source });
      else row.source = "not found";
      done++;
      $("addStatus").textContent = `Translating… ${done} / ${todo.length}`;
      renderAddRows();
    });
    const missing = pendingRows.filter((r) => !r.translation).length;
    $("addStatus").textContent = "Check each translation (machine translation can miss context), then add."
      + (missing ? ` ${missing} need a translation typed in.` : "") + skipped;
  }

  function renderAddRows() {
    const box = $("addRows");
    box.innerHTML = "";
    pendingRows.forEach((r, i) => {
      const input = el("input", { value: r.translation, placeholder: r.source === "not found" ? "type a translation" : "translating…" });
      input.oninput = () => { r.translation = input.value; row.classList.toggle("missing", !input.value.trim()); };
      if (r.alts.length) {
        const dl = el("datalist", { id: "alts" + i });
        for (const a of r.alts) dl.append(el("option", { value: a }));
        input.setAttribute("list", dl.id);
        box.append(dl);
      }
      const row = el("div", { className: "add-row" + (r.source === "not found" ? " missing" : "") },
        el("button", { className: "word", textContent: r.word, title: "Hear it", onclick: () => ui.speak(r.word) }),
        input,
        el("span", { className: "src", textContent: r.source, title: r.alts.length ? "Click the box for other meanings: " + r.alts.join(", ") : "" }),
        el("button", { className: "x", textContent: "✕", title: "Don't add this word", onclick: () => { pendingRows.splice(i, 1); renderAddRows(); } }),
      );
      box.append(row);
    });
    $("addConfirm").textContent = `Add ${pendingRows.length} card${pendingRows.length === 1 ? "" : "s"}`;
  }

  async function confirmAdd() {
    const missing = pendingRows.filter((r) => !r.translation.trim());
    if (missing.length) {
      $("addStatus").textContent = `Type a translation for: ${missing.map((r) => r.word).join(", ")} (or ✕ to skip).`;
      return;
    }
    const now = Date.now();
    pendingRows.forEach((r, i) => { deck[r.word] = SRS.newCard(r.word, r.translation.trim(), now + i); });
    pendingRows = [];
    await save();
    $("addInput").value = "";
    $("addReview").hidden = true;
    renderStats();
    $("addStatus").textContent = "";
    showView("study");
  }

  // ---- deck: browse, fix translations, delete, import / export ----

  function renderDeck() {
    const q = $("deckFilter").value.trim().toLowerCase();
    const box = $("deckRows");
    box.innerHTML = "";
    const cards = list()
      .filter((c) => !q || c.word.includes(q) || c.translation.toLowerCase().includes(q))
      .sort((a, b) => a.created - b.created);
    if (!cards.length) box.append(el("p", { className: "hint", textContent: q ? "No matches." : "No cards yet." }));
    for (const c of cards) {
      const input = el("input", { value: c.translation, title: "Edit translation" });
      input.onchange = async () => { deck[c.word].translation = input.value.trim() || c.translation; await save(); };
      box.append(el("div", { className: "add-row" },
        el("button", { className: "word", textContent: c.word, onclick: () => ui.speak(c.word) }),
        input,
        el("span", { className: "src", textContent: SRS.dueLabel(c) }),
        el("button", {
          className: "x", textContent: "🗑", title: "Delete card",
          onclick: async () => { if (confirm(`Delete the card for ${c.word}?`)) { delete deck[c.word]; await save(); renderDeck(); renderStats(); } },
        }),
      ));
    }
  }

  function exportDeck() {
    const blob = new Blob([JSON.stringify({ app: "korean-pronunciation", version: 1, deck }, null, 1)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `korean-flashcards-${SRS.todayKey()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
  }

  // A .json deck merges in (keeping whichever copy of a card was studied more recently);
  // a .txt / .csv word list goes to the Add view for translation and review.
  async function importFile(file) {
    const text = await file.text();
    if (/\.json$/i.test(file.name) || text.trim().startsWith("{")) {
      try {
        const incoming = JSON.parse(text).deck || {};
        let added = 0;
        for (const [w, c] of Object.entries(incoming)) {
          if (!c?.word || !c.translation) continue;
          if (!deck[w] || (c.last || 0) > (deck[w].last || 0)) { deck[w] = c; added++; }
        }
        await save();
        renderDeck();
        renderStats();
        alert(`Imported ${added} cards.`);
      } catch (err) {
        alert("That file isn't a flashcard deck: " + err.message);
      }
      return;
    }
    showView("add");
    $("addInput").value = text;
    translateInput();
  }

  // ---- setup ----

  async function init(callbacks) {
    ui = callbacks;
    const data = await Platform.getData(["deck", "cardsDay"]);
    deck = data.deck || {};
    day = data.cardsDay || day;
    const s = await Platform.getSettings(["newPerDay", "speakOnReveal"]);
    opts.newPerDay = s.newPerDay ?? 16;
    opts.speakOnReveal = s.speakOnReveal ?? true;

    document.querySelectorAll("#cards .seg button").forEach((b) => { b.onclick = () => showView(b.dataset.view); });
    $("cardFlip").onclick = flip;
    $("cardFront").onclick = flip;
    $("cardHear").onclick = () => current && ui.speak(current.word);
    $("cardSlow").onclick = () => current && ui.speak(current.word, 0.5);
    if (Recognition) $("cardSay").onclick = sayIt;
    else $("cardSay").hidden = true;
    document.querySelectorAll("#cardBack .grades button").forEach((b) => { b.onclick = () => grade(+b.dataset.grade); });

    $("addTranslate").onclick = translateInput;
    $("addFromList").onclick = () => { $("addInput").value = ui.getWords().join("\n"); translateInput(); };
    $("addConfirm").onclick = confirmAdd;
    $("deckFilter").oninput = renderDeck;
    $("deckExport").onclick = exportDeck;
    for (const id of ["importLink", "deckImport"]) {
      $(id).onclick = (e) => { e.preventDefault(); $("importFile").click(); };
    }
    $("importFile").onchange = (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ""; };

    $("newPerDay").value = opts.newPerDay;
    $("newPerDay").onchange = (e) => {
      opts.newPerDay = Math.max(1, parseInt(e.target.value, 10) || 16);
      Platform.setSettings({ newPerDay: opts.newPerDay });
      renderStats();
    };
    $("speakOnReveal").checked = opts.speakOnReveal;
    $("speakOnReveal").onchange = (e) => {
      opts.speakOnReveal = e.target.checked;
      Platform.setSettings({ speakOnReveal: opts.speakOnReveal });
    };

    // Keyboard: Space/Enter flips, 1–4 grade (handy in a full tab or on desktop).
    document.addEventListener("keydown", (e) => {
      if (!$("cards").classList.contains("active") || !$("view-study").classList.contains("active")) return;
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ((e.key === " " || e.key === "Enter") && !$("cardFlip").hidden) { e.preventDefault(); flip(); }
      else if (/^[1-4]$/.test(e.key) && !$("cardBack").hidden) grade(+e.key - 1);
    });
    renderStats();
  }

  function onShow() {
    if ($("view-study").classList.contains("active")) nextCard();
    else renderStats();
  }

  return { init, onShow, startAdding };
})();
