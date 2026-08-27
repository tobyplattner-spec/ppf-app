# Plattner Peonies & Farmstead — the app

Loose files, no folders, deliberately: GitHub's web uploader handles loose files without
complaint and folders unreliably.

    index.html      the app
    m.html          four lines of redirect, for a home-screen icon added when the app
                    lived here. Safe to delete once the icon has been added again.
    store.js        the seam: where the records live and how they are read and written
    sw.js           the shell, kept on the device so the app opens with no signal
    test-seam.js    the seam, against a repository held in memory
    manifest.webmanifest
    icon-*.png      the home-screen mark

One face, and it is a phone. There was a desktop one at `index.html` and a phone one at
`m.html`; the phone one is the app now and lives at the root. The desktop face is gone,
and with it the second copy of everything both faces knew.

The records are **not** here. They live in a private repository of their own —
`farm-data.json` in its root, and pictures in `photos/` beside it — and this app
reads and writes them through the GitHub contents API using a fine-grained token that
each device is given once and keeps to itself. Nothing in this repository is secret,
which is why it can be public and served by GitHub Pages.

## Two kinds of picture

A cultivar keeps a photograph and a transaction keeps its receipt, and they sit in
directories of their own — `photos/cultivars/` and `photos/receipts/` — because they
want opposite things and a folder listing should say which is which.

A bloom is looked at. Its photograph is drawn down to a long edge of 800 and kept at
quality 0.72, and nothing further is asked of it: the colour and the light are the
whole reason for having one.

A receipt is read. It keeps a long edge of 1600, because shrinking is what actually
destroys small print, and gives away quality instead — one step at a time down a
ladder until the file comes in under about 200 KB. In practice a phone photograph of a
till roll lands somewhere around 40–150 KB, legible end to end. One too busy to fit
even at the bottom of the ladder is kept at its smallest rather than refused.

Below the seam neither kind is a special case: `store.js` builds one shelf twice, and
everything about holding a picture — this device's copy of it, writing it, taking it
away, what is owed when there is no signal — is written once.

Every save is a commit, so the history of the farm is the history of the file.

## The ways in

The repository is the app: the only way the records are ever written, and the only one
worth using. Two others exist to open a file before it is connected — reading
`farm-data.json` from beside this page, or being handed it out of Files or Drive. Both
keep your edits on the phone and hand them back through the share sheet. Neither writes
anything on its own.

There is a second set of books in the same repository — `sandbox-data.json` and
`sandbox-photos/` — to poke at where nothing matters. It is a separate file with a
separate photo directory, and what it owes is kept on a shelf of its own, so an edit made
there out of range can never be sent home to the farm.

## Working on it

    node test-seam.js

Needs nothing installed. It pulls the real functions out of `store.js` rather than
restating them, so they cannot quietly drift from the app, and stands a repository up in
memory to write to. Its last few checks read `index.html` as text rather than running it —
the app needs a browser — and are named so you can tell which are which.

## Two versions, and both have to move

`BUILD` in `store.js` is what the app prints on the way-in screen. `CACHE` in `sw.js` is
what actually empties a stale shell: `activate` deletes every cache that is not the
current name, so a shell holding yesterday's files goes on serving them until that name
changes. Change `store.js` or either face and move both.

`SHELL` in `sw.js` is all-or-nothing — `addAll` fails the whole install if one file 404s,
which leaves a device with no shell rather than an old one. Every name in it has to exist.
