// Korean → English translation for flashcards.
// Order tried: built-in list (the class's default words) → Google Translate
// (the same engine as translate.google.com, which the class uses; two free
// endpoints, the first also gives alternative meanings) → MyMemory → you type it.
// Machine translation can miss context (다리다 "to iron" vs 다리 "leg"), so the
// Cards tab always shows results for review, with Google's alternatives to pick from.

const Translator = (() => {
  const BUILTIN = {
    가다: "to go", 그리다: "to draw", 버리다: "to throw away", 미루다: "to postpone",
    오다: "to come", 크다: "to be big", 다리다: "to iron", 타다: "to ride",
    보다: "to see", 차다: "to kick", 고르다: "to choose", 두다: "to put",
    자다: "to sleep", 마시다: "to drink", 가리다: "to cover", 나누다: "to share",
  };

  const cache = new Map();
  const blocked = new Set(); // engines that rate-limited us (HTTP 429): skip for this session

  async function fetchJson(url, engine) {
    const res = await fetch(url);
    if (res.status === 429) blocked.add(engine);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // "School" → "school", but leave "Seoul" / "TV" alone.
  const tidy = (t) => (/^[A-Z][a-z]/.test(t) && !/^(I|Seoul|Korea\w*|English)\b/.test(t) ? t[0].toLowerCase() + t.slice(1) : t).trim();

  // Dictionary-form verbs read better as "to go" than "go".
  function verbify(text, pos, word) {
    if (pos === "verb" && word.endsWith("다") && !/^to /i.test(text)) return "to " + text;
    return text;
  }

  async function google(word) {
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=en&dt=t&dt=bd&q="
      + encodeURIComponent(word);
    const data = await fetchJson(url, google);
    const main = tidy((data[0] || []).map((s) => s[0]).join(""));
    if (!main) return null;
    const dict = data[1] || []; // [[partOfSpeech, [words…], …], …]
    const pos = dict[0]?.[0] || "";
    const alts = [];
    for (const entry of dict) {
      for (const w of (entry[1] || []).slice(0, 6)) alts.push(verbify(w, entry[0], word));
    }
    const text = verbify(main, pos, word);
    return { text, alts: [...new Set(alts)].filter((a) => a !== text).slice(0, 10), source: "Google" };
  }

  // Google's endpoint for its own Chrome extension: one translation, no alternatives.
  async function googleDict(word) {
    const data = await fetchJson("https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=ko&tl=en&q="
      + encodeURIComponent(word), googleDict);
    const raw = Array.isArray(data) ? data.flat(2)[0] : data?.sentences?.[0]?.trans;
    return raw ? { text: verbify(tidy(String(raw)), "", word), alts: [], source: "Google" } : null;
  }

  // MyMemory mixes machine/professional translations with anonymous web snippets
  // (often wrong or rude), so only machine ("MT!") and MateCat matches are used.
  async function myMemory(word) {
    const data = await fetchJson("https://api.mymemory.translated.net/get?mt=1&langpair=ko|en&q=" + encodeURIComponent(word), myMemory);
    const good = (data.matches || [])
      .filter((m) => /^(MT!|MateCat)$/.test(m["created-by"]) && m.translation?.trim())
      .sort((a, b) => (b.quality || 0) - (a.quality || 0) || (b.match || 0) - (a.match || 0))
      .map((m) => tidy(m.translation.replace(/[.。]+$/, "")));
    const unique = [...new Set(good)];
    return unique.length ? { text: unique[0], alts: unique.slice(1, 5), source: "MyMemory" } : null;
  }

  // Returns { text, alts, source } or null if nothing could translate it.
  async function translate(word) {
    if (cache.has(word)) return cache.get(word);
    let result = null;
    if (BUILTIN[word]) {
      result = { text: BUILTIN[word], alts: [], source: "built-in" };
      try {
        const g = blocked.has(google) ? null : await google(word);
        if (g) result.alts = [g.text, ...g.alts].filter((a) => a !== result.text);
      } catch { /* offline or rate-limited: built-in is enough */ }
    } else {
      for (const engine of [google, googleDict, myMemory]) {
        if (blocked.has(engine)) continue;
        try {
          result = await engine(word);
          if (result) break;
        } catch (err) {
          console.warn(`${engine.name} translation failed for ${word}:`, err);
        }
      }
    }
    if (result) cache.set(word, result);
    return result;
  }

  // Translates many words, a few at a time, calling onEach(word, result) as each finishes.
  async function translateAll(words, onEach, concurrency = 4) {
    const queue = words.slice();
    const work = async () => {
      while (queue.length) {
        const w = queue.shift();
        onEach(w, await translate(w));
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, words.length) }, work));
  }

  return { translate, translateAll };
})();

if (typeof module !== "undefined") module.exports = Translator;
