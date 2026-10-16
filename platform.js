// Web / phone version of the platform layer (the extension has its own platform.js).
// Speech: the browser's built-in speechSynthesis (iPhone: "Yuna"; Android: Google Korean).
// Storage: localStorage on this device.

const Platform = (() => {
  const PREFIX = "kpp:";

  function read(keys) {
    const out = {};
    for (const k of keys) {
      try {
        const v = localStorage.getItem(PREFIX + k);
        if (v !== null) out[k] = JSON.parse(v);
      } catch { /* storage blocked or corrupt: fall back to defaults */ }
    }
    return out;
  }

  function write(obj) {
    for (const [k, v] of Object.entries(obj)) {
      try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (err) { console.warn("Couldn't save", k, err); }
    }
  }

  const synth = window.speechSynthesis;
  const isKo = (v) => (v.lang || "").toLowerCase().replace("_", "-").startsWith("ko");

  // Voices load asynchronously on most browsers.
  function allVoices() {
    const now = synth?.getVoices() || [];
    if (now.length || !synth) return Promise.resolve(now);
    return new Promise((resolve) => {
      const done = () => resolve(synth.getVoices());
      synth.addEventListener("voiceschanged", done, { once: true });
      setTimeout(done, 1500);
    });
  }

  return {
    kind: "web",

    speak(text, { rate = 0.8, voiceName = "" } = {}) {
      if (!synth || !text) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = rate;
      const voices = synth.getVoices();
      const voice = voices.find((v) => v.name === voiceName) || voices.find(isKo);
      if (voice) u.voice = voice;
      synth.speak(u);
    },

    async koreanVoices() {
      return (await allVoices()).filter(isKo).map((v) => ({ name: v.name }));
    },

    getSettings: async (keys) => read(keys),
    setSettings: async (obj) => write(obj),
    getData: async (keys) => read(keys),
    setData: async (obj) => write(obj),

    openUrl: (url) => window.open(url, "_blank", "noopener"),
    assetUrl: (path) => new URL(path, document.baseURI).href,
    openFullPage: null, // already full page

    // Text shared to the installed app (Android share sheet → "Korean Pronunciation"),
    // or opened with ?words=가다,오다, becomes flashcard candidates.
    async takePendingWords() {
      const params = new URLSearchParams(location.search);
      const text = ["words", "text", "title"].map((k) => params.get(k) || "").join(" ");
      const found = [...new Set(text.match(/[가-힣]+/g) || [])];
      if (params.toString()) history.replaceState(null, "", location.pathname);
      return found;
    },
  };
})();
