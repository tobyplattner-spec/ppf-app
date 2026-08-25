# Plattner Peonies & Farmstead — the app

Eleven files, no folders, deliberately: GitHub's web uploader handles loose files without
complaint and folders unreliably.

    index.html      the desktop face
    m.html          the phone face
    store.js        the seam: where the records live and how they are read and written
    sw.js           the shell, kept on the device so the app opens with no signal
    manifest.webmanifest / manifest-phone.webmanifest
    icon-*.png      the home-screen mark

The records are **not** here. They live in a private repository of their own —
`farm-data.json` in its root, and photographs in `photos/` beside it — and this app
reads and writes them through the GitHub contents API using a fine-grained token that
each device is given once and keeps to itself. Nothing in this repository is secret,
which is why it can be public and served by GitHub Pages.

Every save is a commit, so the history of the farm is the history of the file.

## Working on it

The tests pull the real functions out of these files rather than reimplementing them,
so they cannot quietly drift from the app. From the folder holding `app/` and `data/`:

    node tests/test-store.js       the seam, against a repository held in memory
    node tests/test-browser.js     both faces in a real browser, against the same
    node tests/test-app.js         the desktop face: ledger, map, wording, house style
    node tests/test-collection.js  cultivars, plants, dividing
    node tests/test-photos.js      photographs as files of their own
    node tests/test-real-data.js   the whole thing against the real farm

`test-browser.js` needs `npm i playwright`. The rest need nothing at all.
