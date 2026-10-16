// Spaced repetition scheduler (a light SM-2 / Anki-style scheme).
// New card: Good → tomorrow, Easy → in 3 days, Hard → again in 10 minutes.
// After that each Good multiplies the interval by the card's ease (starts at 2.5),
// so a word resurfaces after 1 day, ~3 days, ~1 week, ~2.5 weeks, and so on.
// Again resets the card to the start and makes it a little "harder" (lower ease).

const SRS = (() => {
  const MIN = 60 * 1000;
  const AGAIN = 0, HARD = 1, GOOD = 2, EASY = 3;
  const MAX_INTERVAL = 365;
  const LEARN_AHEAD = 20 * MIN; // in a session, show cards due within 20 min rather than waiting

  // Midnight (local time) `days` days after `now`, so "due in 1 day" means "due tomorrow".
  function dayOffset(now, days) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.getTime();
  }

  function todayKey(now = Date.now()) {
    const d = new Date(now);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function newCard(word, translation, now = Date.now()) {
    return { word, translation, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now, created: now, seen: false };
  }

  // Returns an updated copy of `card` after answering it with `grade`.
  function schedule(card, grade, now = Date.now()) {
    const c = { ...card, seen: true, last: now };

    if (grade === AGAIN) {
      if (c.reps > 0) c.lapses++;
      c.reps = 0;
      c.interval = 0;
      c.ease = Math.max(1.3, c.ease - 0.2);
      c.due = now + MIN;
      return c;
    }

    if (c.reps === 0) {
      if (grade === HARD) {
        c.due = now + 10 * MIN;
        return c;
      }
      c.interval = grade === EASY ? 3 : 1;
    } else if (grade === HARD) {
      c.interval = Math.max(c.interval + 1, Math.round(c.interval * 1.2));
      c.ease = Math.max(1.3, c.ease - 0.15);
    } else if (grade === GOOD) {
      c.interval = Math.max(c.interval + 1, Math.round(c.interval * c.ease));
    } else {
      c.interval = Math.max(c.interval + 2, Math.round(c.interval * c.ease * 1.3));
      c.ease += 0.15;
    }
    c.interval = Math.min(c.interval, MAX_INTERVAL);
    c.reps++;
    c.due = dayOffset(now, c.interval);
    return c;
  }

  function formatWait(ms, days) {
    if (days >= 60) return `${Math.round(days / 30)}mo`;
    if (days >= 1) return `${days}d`;
    const m = Math.max(1, Math.round(ms / MIN));
    return m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`;
  }

  // Label for a grade button: how long until the card comes back, e.g. "10m", "1d", "3d".
  function preview(card, grade, now = Date.now()) {
    const c = schedule(card, grade, now);
    return formatWait(c.due - now, c.interval);
  }

  // Picks the next card to study: due reviews first, then new cards
  // (if today's new-card allowance isn't used up), then learning cards due soon.
  function next(cards, newAllowed, now = Date.now(), skip = null) {
    const pool = cards.filter((c) => c.word !== skip);
    const byDue = (a, b) => a.due - b.due;
    const due = pool.filter((c) => c.seen && c.due <= now).sort(byDue);
    if (due.length) return due[0];
    if (newAllowed > 0) {
      const fresh = pool.filter((c) => !c.seen).sort((a, b) => a.created - b.created);
      if (fresh.length) return fresh[0];
    }
    const soon = pool.filter((c) => c.seen && c.interval === 0 && c.due <= now + LEARN_AHEAD).sort(byDue);
    if (soon.length) return soon[0];
    // Only the card we just answered is left (e.g. a single-card deck): show it again.
    if (skip) return cards.find((c) => c.word === skip && c.seen && c.interval === 0 && c.due <= now + LEARN_AHEAD) || null;
    return null;
  }

  function stats(cards, now = Date.now()) {
    return {
      total: cards.length,
      due: cards.filter((c) => c.seen && c.due <= now).length,
      fresh: cards.filter((c) => !c.seen).length,
      learned: cards.filter((c) => c.interval >= 21).length,
    };
  }

  function dueLabel(card, now = Date.now()) {
    if (!card.seen) return "new";
    if (card.due <= now) return "due now";
    return "in " + formatWait(card.due - now, Math.round((card.due - dayOffset(now, 0)) / 864e5));
  }

  return { AGAIN, HARD, GOOD, EASY, newCard, schedule, preview, next, stats, dueLabel, todayKey, dayOffset };
})();

if (typeof module !== "undefined") module.exports = SRS;
