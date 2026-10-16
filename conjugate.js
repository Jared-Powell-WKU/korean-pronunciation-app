// Generates common spoken (polite 해요체) forms of a Korean verb/adjective
// from its dictionary form, e.g. 가다 → 가요, 갔어요, 갈 거예요.
// Covers regular verbs plus the common irregular groups (하다, 르, ㅂ, ㄷ, ㅅ, ㅎ).
// It's rule-based, so rare exceptions may come out wrong.

const KoreanConjugator = (() => {
  const BASE = 0xac00;
  const VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  const FINALS = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

  // Stems that look irregular but are regular, or vice versa.
  const BIEUP_REGULAR = new Set(["입", "잡", "좁", "씹", "업", "뽑", "접", "넓", "수줍"]);
  const BIEUP_WA = new Set(["돕", "곱"]); // 도와요, not 도워요
  const DIGEUT_IRREGULAR = new Set(["듣", "걷", "묻", "싣", "깨닫", "붇", "엿듣"]);
  const SIOT_IRREGULAR = new Set(["낫", "짓", "붓", "잇", "젓", "긋"]);
  const RIEUL_EU_REGULAR = new Set(["따르", "치르", "들르", "다다르"]); // ㅡ-drop, not 르 irregular
  const HIEUT_IRREGULAR = new Set(["그렇", "이렇", "저렇", "어떻", "빨갛", "파랗", "노랗", "하얗", "까맣", "동그랗"]);

  const isHangul = (ch) => ch >= "가" && ch <= "힣";

  function split(ch) {
    const code = ch.charCodeAt(0) - BASE;
    return { l: Math.floor(code / 588), v: VOWELS[Math.floor((code % 588) / 28)], t: FINALS[code % 28] };
  }

  function join(l, v, t = "") {
    return String.fromCharCode(BASE + l * 588 + VOWELS.indexOf(v) * 28 + FINALS.indexOf(t));
  }

  const withFinal = (ch, t) => { const s = split(ch); return join(s.l, s.v, t); };
  const isBright = (v) => v === "ㅏ" || v === "ㅗ" || v === "ㅑ";

  // The 아/어 form ("infinitive"): 가 → 가, 먹 → 먹어, 마시 → 마셔, 고르 → 골라
  function infinitive(stem) {
    const head = stem.slice(0, -1);
    const last = stem.slice(-1);
    const s = split(last);

    if (last === "하") return head + "해";

    if (HIEUT_IRREGULAR.has(stem)) {
      const v = s.v === "ㅑ" ? "ㅒ" : "ㅐ";
      return head + join(s.l, v);
    }

    if (last === "르" && head && !RIEUL_EU_REGULAR.has(stem)) {
      const prev = head.slice(-1);
      return head.slice(0, -1) + withFinal(prev, "ㄹ") + (isBright(split(prev).v) ? "라" : "러");
    }

    if (s.t === "ㅂ" && !BIEUP_REGULAR.has(stem)) {
      return head + join(s.l, s.v) + (BIEUP_WA.has(stem) ? "와" : "워");
    }

    if (s.t === "ㄷ" && DIGEUT_IRREGULAR.has(stem)) {
      return head + join(s.l, s.v, "ㄹ") + (isBright(s.v) ? "아" : "어");
    }

    if (s.t === "ㅅ" && SIOT_IRREGULAR.has(stem)) {
      return head + join(s.l, s.v) + (isBright(s.v) ? "아" : "어");
    }

    if (s.t) return stem + (isBright(s.v) ? "아" : "어");

    switch (s.v) {
      case "ㅗ": return head + join(s.l, "ㅘ");
      case "ㅜ": return head + join(s.l, "ㅝ");
      case "ㅣ": return head + join(s.l, "ㅕ");
      case "ㅚ": return head + join(s.l, "ㅙ");
      case "ㅡ": {
        const prevV = head ? split(head.slice(-1)).v : "ㅓ";
        return head + join(s.l, isBright(prevV) ? "ㅏ" : "ㅓ");
      }
      case "ㅟ":
      case "ㅢ":
        return stem + "어";
      default: // ㅏ ㅓ ㅐ ㅔ ㅕ ㅑ … already end in a suitable vowel
        return stem;
    }
  }

  // The (으)ㄹ form used before 거예요: 가 → 갈, 먹 → 먹을, 돕 → 도울
  function futureBase(stem) {
    const head = stem.slice(0, -1);
    const last = stem.slice(-1);
    const s = split(last);

    if (HIEUT_IRREGULAR.has(stem)) return head + join(s.l, s.v, "ㄹ");
    if (s.t === "ㅂ" && !BIEUP_REGULAR.has(stem)) return head + join(s.l, s.v) + "울";
    if (s.t === "ㄷ" && DIGEUT_IRREGULAR.has(stem)) return head + join(s.l, s.v, "ㄹ") + "을";
    if (s.t === "ㅅ" && SIOT_IRREGULAR.has(stem)) return head + join(s.l, s.v) + "을";
    if (!s.t) return head + join(s.l, s.v, "ㄹ");
    if (s.t === "ㄹ") return stem;
    return stem + "을";
  }

  function addPast(inf) {
    return inf.slice(0, -1) + withFinal(inf.slice(-1), "ㅆ") + "어요";
  }

  // Returns [{ label, text }], always starting with the word itself.
  function forms(word) {
    const w = word.trim();
    const out = [{ label: "as written", text: w }];
    if (w.length < 2 || !w.endsWith("다") || ![...w].every(isHangul)) return out;

    const stem = w.slice(0, -1);
    const inf = infinitive(stem);
    out.push(
      { label: "present", text: inf + "요" },
      { label: "past", text: addPast(inf) },
      { label: "future", text: futureBase(stem) + " 거예요" },
    );
    return out;
  }

  return { forms, infinitive, futureBase };
})();

if (typeof module !== "undefined") module.exports = KoreanConjugator;
