// Turns pasted or recognized (OCR) text into study items, in one of two modes:
//   "words":   every run of Hangul is its own item ("책을 펴세요" → 책을, 펴세요)
//   "phrases": each line is one item ("책을 펴세요." → 책을 펴세요). Wide gaps and tabs
//              also separate items, because OCR reads side-by-side columns as one line.
// Translations are picked up when given: "가다, to go" / "가다<TAB>to go", or an English
// line right under a Korean one (as on textbook slides). If the Korean line held several
// items and the English line has the same number of wide-gap columns, they pair up by column.

const Extract = (() => {
  const HANGUL = /[가-힣]/g;
  const COLUMN_GAP = /\t|\s{3,}/;
  const PAIR = /^\s*([^\t,;=]*[가-힣][^\t,;=]*?)\s*(?:\t|,|;|=|\s-\s)\s*([^가-힣]*[A-Za-z][^가-힣]*?)\s*$/;

  // Mostly Hangul? Drops OCR noise such as "15001 (키이니1/," or "‥ “ | ] 삐".
  function koreanEnough(seg) {
    const chars = seg.replace(/\s/g, "");
    const h = (seg.match(HANGUL) || []).length;
    return h > 0 && h / chars.length >= 0.6;
  }

  // "책을 펴세요." → "책을 펴세요"; keeps ? and ! because they change the meaning.
  function cleanPhrase(seg) {
    return seg.replace(/[^가-힣\s?!]/g, " ").replace(/\s+/g, " ").replace(/^[\s?!]+/, "").trim();
  }

  function segments(line, mode) {
    if (mode !== "phrases") return line.match(/[가-힣]+/g) || [];
    const raw = line.split(COLUMN_GAP).filter((s) => s.trim());
    const good = raw.filter(koreanEnough).map(cleanPhrase).filter(Boolean);
    // On a line that's mostly OCR junk, lone syllables are junk too.
    if (good.length < raw.length) return good.filter((s) => s.replace(/[\s?!]/g, "").length > 1);
    return good;
  }

  const isEnglish = (line) => /[A-Za-z]/.test(line) && !/[가-힣]/.test(line);
  const tidyEnglish = (s) => s.replace(/\s+/g, " ").trim();

  // Returns [{ text, translation }] in order, without duplicates.
  function items(text, mode = "words") {
    const out = [];
    const byText = new Map();
    const add = (t, translation = "") => {
      if (!t) return null;
      const existing = byText.get(t);
      if (existing) {
        if (translation && !existing.translation) existing.translation = translation;
        return existing;
      }
      const item = { text: t, translation };
      byText.set(t, item);
      out.push(item);
      return item;
    };

    let prev = []; // items from the last Korean line, waiting for an English line underneath
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue;

      const pair = line.match(PAIR);
      if (pair) {
        const keys = segments(pair[1], mode);
        if (keys.length === 1) { add(keys[0], tidyEnglish(pair[2])); prev = []; continue; }
      }

      if (isEnglish(line)) {
        const cols = line.split(COLUMN_GAP).map(tidyEnglish).filter(Boolean);
        if (prev.length > 1 && cols.length === prev.length) {
          prev.forEach((item, i) => { if (!item.translation) item.translation = cols[i]; });
        } else if (prev.length === 1 && !prev[0].translation) {
          prev[0].translation = tidyEnglish(line);
        }
        prev = [];
        continue;
      }

      prev = segments(line, mode).map((s) => add(s)).filter(Boolean);
    }
    return out;
  }

  return { items };
})();

if (typeof module !== "undefined") module.exports = Extract;
