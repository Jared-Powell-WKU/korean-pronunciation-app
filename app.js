// Main UI: Listen, Quiz, Cards, Words and Settings tabs.
// Shared by the Chrome extension popup and the standalone web app; all
// browser-specific calls go through `Platform` (platform.js).

const DEFAULT_WORDS = [
  "가다", "그리다", "버리다", "미루다",
  "오다", "크다", "다리다", "타다",
  "보다", "차다", "고르다", "두다",
  "자다", "마시다", "가리다", "나누다",
];

let words = [];
let rate = 0.8;
let voiceName = "";
let splitMode = "words"; // "words" or "phrases" (see extract.js)
let current = null;
let answered = false;
const score = { right: 0, total: 0 };

const $ = (id) => document.getElementById(id);

function speak(text, r = rate) {
  Platform.speak(text, { rate: r, voiceName });
}

function parseWords(s) {
  if (splitMode === "phrases") return Extract.items(s, "phrases").map((i) => i.text);
  return [...new Set(s.split(/[\s,]+/).map((w) => w.trim()).filter(Boolean))];
}

// Words / Phrases switches (Words tab and Cards → Add) share one setting.
const SPLIT_HINTS = {
  words: "Words: 책을 펴세요 → two items, 책을 and 펴세요.",
  phrases: "Phrases: each line is one item, 책을 펴세요 → one card. English under a Korean line becomes its translation.",
};

function setSplitMode(mode, save = true) {
  splitMode = mode === "phrases" ? "phrases" : "words";
  document.querySelectorAll(".split-seg button").forEach((b) => b.classList.toggle("active", b.dataset.split === splitMode));
  document.querySelectorAll(".split-hint").forEach((h) => { h.textContent = SPLIT_HINTS[splitMode]; });
  if (save) Platform.setSettings({ splitMode });
  if (lastOcrText) renderFound();
}

function openYouGlish(text) {
  Platform.openUrl(`https://youglish.com/pronounce/${encodeURIComponent(text)}/korean`);
}

function showTab(name) {
  document.querySelector(`nav [data-tab="${name}"]`).click();
}

// Rows of [form] [🔊] [🎬 Videos] for a word and its conjugations.
function renderForms(container, word) {
  container.innerHTML = "";
  for (const f of KoreanConjugator.forms(word)) {
    const row = document.createElement("div");
    row.className = "form-row";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = f.label;
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = f.text;
    const say = document.createElement("button");
    say.textContent = "🔊";
    say.title = "Hear it";
    say.onclick = () => speak(f.text);
    const vid = document.createElement("button");
    vid.textContent = "🎬 Videos";
    vid.title = "Find YouTube clips on YouGlish";
    vid.onclick = () => openYouGlish(f.text);
    row.append(label, text, say, vid);
    container.appendChild(row);
  }
}

// Longer phrases take 2 or 4 grid columns so they stay readable.
function sizeClass(text) {
  return text.length > 10 ? "span4" : text.length > 5 ? "span2" : "";
}

function renderGrid() {
  const grid = $("grid");
  grid.innerHTML = "";
  $("detail").hidden = true;
  for (const w of words) {
    const b = document.createElement("button");
    b.textContent = w;
    b.className = sizeClass(w);
    b.onclick = () => {
      speak(w);
      grid.querySelectorAll(".selected").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      $("detailWord").textContent = w;
      renderForms($("forms"), w);
      $("detail").hidden = false;
    };
    grid.appendChild(b);
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextQuestion() {
  if (words.length < 2) {
    $("feedback").textContent = "Add at least 2 words in the Words tab.";
    return;
  }
  let pick;
  do { pick = words[Math.floor(Math.random() * words.length)]; }
  while (pick === current);
  current = pick;
  answered = false;
  $("quizForms").hidden = true;

  const showAll = $("allChoices").checked;
  const options = showAll
    ? words.slice()
    : shuffle([current, ...shuffle(words.filter((w) => w !== current)).slice(0, 3)]);

  const box = $("choices");
  box.className = "grid" + (showAll ? " all" : "");
  box.innerHTML = "";
  for (const w of options) {
    const b = document.createElement("button");
    b.textContent = w;
    if (showAll) b.className = sizeClass(w);
    b.onclick = () => answer(w, b);
    box.appendChild(b);
  }
  $("feedback").textContent = "Listen, then pick the word you heard.";
  speak(current);
}

function answer(w, b) {
  // After answering, clicking a choice just plays it so you can compare sounds.
  if (answered) { speak(w); return; }
  answered = true;
  score.total++;
  if (w === current) {
    score.right++;
    b.classList.add("correct");
    $("feedback").textContent = "✅ Correct!";
  } else {
    b.classList.add("wrong");
    [...$("choices").children].find((x) => x.textContent === current)?.classList.add("correct");
    $("feedback").textContent = `❌ It was ${current}. Click words to compare how they sound.`;
  }
  $("score").textContent = `${score.right} / ${score.total}`;
  renderForms($("quizForms"), current);
  $("quizForms").hidden = false;
}

// ---- Screenshot → words (OCR, runs locally with Tesseract) ----

let ocrWorker = null;
let lastOcrText = "";

async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = Tesseract.createWorker("kor", 1, {
      workerPath: Platform.assetUrl("lib/worker.min.js"),
      corePath: Platform.assetUrl("lib/core"),
      langPath: Platform.assetUrl("lib/lang"),
      workerBlobURL: false,
      logger: (m) => {
        if (m.status === "recognizing text") {
          $("ocrStatus").textContent = `Reading text… ${Math.round(m.progress * 100)}%`;
        }
      },
    });
  }
  return ocrWorker;
}

async function readImage(blob) {
  if (!$("words").classList.contains("active")) showTab("words");
  $("ocr").hidden = false;
  $("ocrActions").hidden = true;
  $("found").innerHTML = "";
  lastOcrText = "";
  $("preview").src = URL.createObjectURL(blob);
  $("ocrStatus").textContent = "Loading Korean text reader…";
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(blob);
    lastOcrText = data.text;
    renderFound();
  } catch (err) {
    console.error(err);
    ocrWorker = null;
    $("ocrStatus").textContent = "Couldn't read that image: " + (err?.message || err);
  }
}

// Found words/phrases as editable chips: uncheck misreads, or fix them in place
// (e.g. OCR read 덮으세요 as 덮으세와).
function renderFound() {
  const found = Extract.items(lastOcrText, splitMode);
  const box = $("found");
  box.innerHTML = "";
  box.classList.toggle("phrases", splitMode === "phrases");
  if (!found.length) {
    $("ocrStatus").textContent = "No Korean text found. Try a sharper or larger screenshot.";
    $("ocrActions").hidden = true;
    return;
  }
  const noun = splitMode === "phrases" ? "phrase" : "word";
  $("ocrStatus").textContent = `Found ${found.length} ${noun}${found.length === 1 ? "" : "s"}. `
    + "Uncheck mistakes, tap one to fix its spelling, 🔊 to hear it.";
  for (const item of found) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    // In phrase mode a lone syllable is almost always OCR noise.
    box.checked = splitMode === "words" || item.text.length > 1;
    const text = document.createElement("input");
    text.className = "chip-text";
    text.value = item.text;
    text.size = Math.max(2, item.text.length * 2);
    text.dataset.translation = item.translation;
    const say = document.createElement("button");
    say.type = "button";
    say.textContent = "🔊";
    say.onclick = (e) => { e.preventDefault(); speak(text.value); };
    label.append(box, text, say);
    label.title = item.translation;
    box.addEventListener("change", () => label.classList.toggle("off", !box.checked));
    label.classList.toggle("off", !box.checked);
    $("found").appendChild(label);
  }
  $("ocrActions").hidden = false;
}

function checkedItems() {
  return [...$("found").querySelectorAll("label")]
    .filter((l) => l.querySelector("input[type=checkbox]").checked)
    .map((l) => l.querySelector(".chip-text"))
    .map((t) => ({ text: t.value.trim(), translation: t.dataset.translation || "" }))
    .filter((i) => i.text);
}

function checkedFound() {
  return checkedItems().map((i) => i.text);
}

async function saveWords(list) {
  words = [...new Set(list)];
  await Platform.setSettings({ words });
  $("wordList").value = words.join("\n");
  renderGrid();
  current = null;
  $("saved").textContent = `Saved ${words.length} words`;
}

function imageFromItems(items) {
  for (const item of items || []) {
    if (item.type?.startsWith("image/")) return item.getAsFile ? item.getAsFile() : item;
  }
  return null;
}

function setupOcr() {
  document.addEventListener("paste", (e) => {
    const img = imageFromItems(e.clipboardData?.items);
    if (img) { e.preventDefault(); readImage(img); }
  });
  const drop = $("drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const img = imageFromItems(e.dataTransfer?.files);
    if (img) readImage(img);
  });
  $("pick").onclick = (e) => { e.preventDefault(); $("file").click(); };
  $("file").onchange = (e) => { if (e.target.files[0]) readImage(e.target.files[0]); };
  $("ocrReplace").onclick = () => saveWords(checkedFound());
  $("ocrAdd").onclick = () => saveWords([...words, ...checkedFound()]);
  $("ocrCards").onclick = () => Cards.startAdding(checkedItems());
  if (Platform.openFullPage) {
    $("openTab").onclick = (e) => { e.preventDefault(); Platform.openFullPage(); };
  } else {
    $("openTab").hidden = true;
  }
}

async function loadVoices() {
  const ko = await Platform.koreanVoices();
  const sel = $("voice");
  sel.innerHTML = '<option value="">Auto (any Korean voice)</option>';
  for (const v of ko) {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = v.name;
    sel.appendChild(o);
  }
  if (!ko.length) {
    sel.innerHTML += "<option disabled>No Korean voice found (see README)</option>";
  }
  sel.value = voiceName;
}

async function init() {
  const data = await Platform.getSettings(["words", "rate", "voiceName", "allChoices", "splitMode"]);
  words = data.words?.length ? data.words : DEFAULT_WORDS.slice();
  rate = data.rate ?? 0.8;
  voiceName = data.voiceName ?? "";
  $("allChoices").checked = !!data.allChoices;
  setSplitMode(data.splitMode, false);
  document.querySelectorAll(".split-seg button").forEach((b) => { b.onclick = () => setSplitMode(b.dataset.split); });

  $("wordList").value = words.join("\n");
  $("rate").value = rate;
  $("rateVal").textContent = `${rate}×`;
  renderGrid();
  loadVoices();

  document.querySelectorAll("nav button").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("nav button, .tab").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.tab).classList.add("active");
      if (btn.dataset.tab === "quiz" && !current) nextQuestion();
      if (btn.dataset.tab === "cards") Cards.onShow();
    };
  });

  $("replay").onclick = () => (current ? speak(current) : nextQuestion());
  $("replaySlow").onclick = () => current && speak(current, Math.max(0.4, rate - 0.3));
  $("next").onclick = nextQuestion;
  $("allChoices").onchange = (e) => {
    Platform.setSettings({ allChoices: e.target.checked });
    nextQuestion();
  };

  $("save").onclick = () => saveWords(parseWords($("wordList").value));
  setupOcr();
  $("reset").onclick = () => { $("wordList").value = DEFAULT_WORDS.join("\n"); };

  $("rate").oninput = (e) => {
    rate = parseFloat(e.target.value);
    $("rateVal").textContent = `${rate}×`;
    Platform.setSettings({ rate });
  };
  $("voice").onchange = (e) => {
    voiceName = e.target.value;
    Platform.setSettings({ voiceName });
    speak("안녕하세요");
  };

  await Cards.init({ speak, renderForms, getWords: () => words, showTab, getSplitMode: () => splitMode });
  // Words captured from a page (or shared to the app) are waiting: go straight to adding them as cards.
  const pending = await Platform.takePendingWords();
  if (pending.length) Cards.startAdding(pending);
}

init();
