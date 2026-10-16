# Korean Pronunciation Practice: phone / web app

The Chrome extension (`../korean-pronunciation-extension`) as a standalone web app you can install
on a phone's home screen. Same tabs: Listen, Quiz, **Cards** (spaced-repetition flashcards), Words
(take a photo of your textbook and it reads the Korean words) and Settings. Works offline after the
first visit, except auto-translation and YouGlish videos.

## What's different from the extension
| | Extension | Phone app |
|---|---|---|
| Voice | Chrome's voices (`chrome.tts`) | The phone's built-in Korean voice (iPhone: Yuna; Android: Google) |
| Storage | Chrome storage | This browser on this phone (localStorage) |
| Getting words in | Paste a screenshot, highlight on a page (➕) | Take a photo / pick a screenshot; on Android, **Share** text from any app to "Korean" |
| 🎤 Say it | Needs "Open in a tab" the first time | Asks for the microphone the first time |

Move your flashcards between computer and phone with **Cards → Deck → Export** on one and
**Import…** on the other (e.g. email or Drive the .json file to yourself).

## Putting it on your phone
Phones only allow the microphone, offline mode and "Add to Home Screen" as an app on **https://**
sites, so the folder needs to be hosted somewhere. Any static host works; two free options:

- **Netlify Drop** (no account needed to try): open https://app.netlify.com/drop and drag this whole
  folder onto the page. You get an https:// link; open it on your phone.
- **GitHub Pages**: push this folder to a GitHub repository, then Settings → Pages → deploy from the
  main branch.

Then on the phone: open the link, and
- **iPhone (Safari)**: Share → **Add to Home Screen**.
- **Android (Chrome)**: ⋮ menu → **Install app** (or Add to Home screen).

To try it quickly without hosting (no microphone or install, everything else works):
```
node tools/serve.mjs
```
and open the "on your phone" address it prints, with the phone on the same Wi-Fi.

## Updating
The shared code lives in the extension. After changing it:
```
node tools/sync.mjs
```
This copies `app.js`, `cards.js`, `srs.js`, `translate.js`, `conjugate.js`, `popup.css` and `lib/`,
rebuilds `index.html` from the extension's `popup.html`, and bumps the offline-cache version so
installed copies update the next time they're opened online. Then publish it:
```
git add -A
git commit -m "Sync from extension"
git push
```
The live copy is https://jared-powell-wku.github.io/korean-pronunciation-app/ (GitHub Pages, from the
`main` branch of github.com/Jared-Powell-WKU/korean-pronunciation-app); it updates about a minute
after each push.

Files that belong to the web app and are never overwritten: `platform.js` (speech and storage for
browsers), `web.css` (phone layout), `sw.js` (offline cache), `manifest.webmanifest` (install, share
target), `icons/`, `tools/`.

## Credits
Text recognition uses [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache 2.0), in `lib/`.
