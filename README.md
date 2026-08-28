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

    sun.html        hours of sun on a spot — a proof of concept, and not the app
    sun.js          the arithmetic behind it
    test-sun.js     that arithmetic, against published astronomy

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

## Hours of sun, which is not the app

`sun.html` answers a different question: how many hours of direct sun does one spot get,
month by month. It is a proof of concept and it is deliberately not wired into anything.
It writes no records, loads no `store.js`, is not in the shell, and knows nothing about
peonies. Open it, stand on a spot, and it tells you what that spot gets.

The whole model is two facts and one comparison. Where the sun is — pure astronomy, good
to a tenth of a degree, no network. How high the treeline stands in that direction — the
part you go outside and measure. The spot is in sun when the first is above the second;
count the minutes across every day of the year and you have the answer by month.

Only the **angle** of an obstruction matters, never its height or its distance: a sixty
foot oak two hundred feet away and a fifteen foot hedge fifty feet away shade a spot
identically. So nothing is ever measured or paced out. You put a crosshair on a treetop
and the phone's attitude sensors do the rest — which also means the camera is only an
aiming aid, and the survey works exactly as well when iOS refuses to hand one over, as it
has done on and off for years in a home-screen web app.

The one real uncertainty is the compass. A phone's magnetometer is five to fifteen degrees
out, and on a lopsided skyline ten degrees is worth close to half an hour of a winter day —
`test-sun.js` pins that number down. So the survey measures the error rather than hoping:
a shadow's bearing is the sun's bearing plus exactly 180°, and the page knows the sun's
bearing to a tenth of a degree. Sight along any shadow and a ±10° unknown becomes a ±2°
known, which is five minutes rather than twenty-seven.

Offline needs no work here. The worker asks the network first for anything on this origin
and keeps what comes back, so `sun.html` opens without a signal once it has been opened
with one. It is **not** in `SHELL` on purpose: that list is all-or-nothing on install, and
a proof of concept has no business being able to leave the farm app with no shell.

## The screen is re-drawn, and it has to stay still while it is

Every change re-builds the whole screen out of the records — a hundred times an
afternoon, under taps that meant to change one line. That is what keeps the screen and
the file the same thing, and it is not going anywhere. But everything the browser was
holding on the app's behalf goes with the old markup: how far a list was scrolled, where
the caret was, how far along a rail of chips had been pushed, and the fact that an open
sheet was already open — so it slid up from the bottom edge again under every touch.

So `render()` lifts all of that out before the re-draw and puts it back after, in the
same frame, before anything is painted. A sheet that was already up is marked so it does
not arrive twice; one that has gone is moved onto the body to finish going down over a
screen that is free to be whatever it now is; one whose contents changed height is walked
to its new height rather than jumping there. Nothing in that layer decides anything — it
only carries. Add a `render()` call anywhere and it is carried for you.

The speeds and the curves are five custom properties at the top of the stylesheet, so
nothing has to guess: `--t-press` for a press letting go, `--t-state` for something
changing under your eye, `--t-sheet` for something arriving or leaving, and `--ease-out`
and `--ease-in` for entering and leaving, which are deliberately not the same curve. A
phone set to keep still is obeyed everywhere at once, in one media query.

## Working on it

    node test-seam.js
    node test-sun.js

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
