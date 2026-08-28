/* The sun model, against known astronomy.

   Pulls the real sun.js in rather than reimplementing it, so it cannot quietly drift
   from the page. A loose file like everything else here — no folder to upload.

       node test-sun.js

   Needs nothing installed.

   The astronomy is worth testing properly because it can be checked against the world
   rather than against itself: the sun's declination at the solstices, the extremes of
   the equation of time, and the altitude of noon are all published numbers this file
   either reproduces or does not. Where an external number was not to hand, the check is
   made by computing the same quantity two independent ways — a closed form against a
   minute-by-minute scan — which catches an algebra error just as well.

   The last section reads sun.html as text rather than running it: the page needs a
   browser and sensors, so those are source checks and say so. */

const S = require("path").join(__dirname, "sun.js");
const { julian, solarSeries, position, altAz, sunTimes, Mask, dayHours, yearHours,
        byMonth, sunArc, azimuthEnvelope, gapsThatMatter, compassError, norm360, arc } = require(S);

let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; console.log("  ok   " + m); }
                       else  { fail++; console.log("  FAIL " + m); } };
/* Nearly equal, to a stated tolerance, with the miss printed when it misses. */
const near = (got, want, tol, m) =>
  ok(Math.abs(got - want) <= tol, `${m}  (${(+got).toFixed(3)} vs ${(+want).toFixed(3)} ±${tol})`);

const U = s => new Date(s);
const hm = d => d ? d.toISOString().slice(11, 16) : "—";
/* Minutes between two Dates, for comparing times of day. */
const mins = (a, b) => Math.abs(a - b) / 60000;

/* Where the tests stand. A northern mid-latitude, which is the case that matters here,
   plus a scatter chosen to break things: the equator, the tropics, the far south, and
   inside the arctic circle. */
const HOLLER = { lat: 40.0, lon: -80.0 };

console.log("\n-- the astronomy, against published values --");

near(solarSeries(julian(U("2026-06-21T12:00:00Z"))).dec, 23.44, 0.02,
     "declination at the June solstice is the obliquity of the ecliptic");
near(solarSeries(julian(U("2026-12-21T12:00:00Z"))).dec, -23.44, 0.02,
     "and its negative at the December solstice");
near(solarSeries(julian(U("2026-03-20T12:00:00Z"))).dec, 0, 0.4,
     "and passes through zero at the March equinox");

/* The equation of time is the sun running ahead of or behind the clock. Its four turning
   points are fixed enough to test against: nothing else in the file would produce them
   by accident. */
near(solarSeries(julian(U("2026-11-03T12:00:00Z"))).eqTime, 16.4, 0.3,
     "the equation of time peaks near +16.4 min in early November");
near(solarSeries(julian(U("2026-02-11T12:00:00Z"))).eqTime, -14.2, 0.3,
     "and bottoms near -14.2 min in mid February");
near(solarSeries(julian(U("2026-07-26T12:00:00Z"))).eqTime, -6.5, 0.3,
     "with the lesser dip in late July");
near(solarSeries(julian(U("2026-05-14T12:00:00Z"))).eqTime, 3.7, 0.3,
     "and the lesser rise in mid May");

/* The strongest single check in the file. At solar noon the sun stands at
   90 - |latitude - declination| above the horizon, exactly, everywhere. Getting this
   right at four latitudes on two dates means the declination, the equation of time, the
   hour angle and the altitude formula are all correct together — no two of them could be
   wrong in a way that cancels at every one of these. */
for(const date of ["2026-06-21", "2026-12-21"]){
  for(const lat of [51.5, 40, 0, -33.9]){
    const t = sunTimes(U(date + "T12:00:00Z"), lat, 0);
    const p = position(t.noon, lat, 0);
    near(p.geometric, 90 - Math.abs(lat - t.dec), 0.02,
         `noon altitude at ${lat}° on ${date} is 90 - |lat - dec|`);
  }
}

/* Azimuth's quadrant, which is the part of the arithmetic an `if` would get wrong. At
   noon the sun is due south of anywhere further from the equator than it is, and due
   north of anywhere nearer — including, on the June solstice, the equator itself. */
{
  const noonAz = (lat, date) => position(sunTimes(U(date + "T12:00:00Z"), lat, 0).noon, lat, 0).az;
  near(noonAz(51.5, "2026-06-21"), 180, 0.1, "at noon the sun bears due south from London");
  near(noonAz(-33.9, "2026-06-21"), 0, 0.1, "and due north from Sydney");
  near(noonAz(0, "2026-06-21"), 0, 0.1, "and due north from the equator in June");
  near(noonAz(0, "2026-12-21"), 180, 0.1, "and due south from the equator in December");
}

console.log("\n-- sunrise and sunset --");

/* Against the published tables. Greenwich is the one place a sunrise time is a fact
   about the calendar rather than about a time zone. */
{
  const t = sunTimes(U("2026-06-21T12:00:00Z"), 51.4779, -0.0015);
  ok(hm(t.rise) === "03:42" || hm(t.rise) === "03:43", "London midsummer sunrise is 03:43 UTC, ±1 min  (got " + hm(t.rise) + ")");
  ok(hm(t.set)  === "20:20" || hm(t.set)  === "20:21", "London midsummer sunset is 20:21 UTC, ±1 min  (got " + hm(t.set) + ")");
}
{
  /* An equinox day is a few minutes over twelve hours everywhere, not exactly twelve —
     refraction lifts the sun into view early and holds it late, and the tables are drawn
     on the upper limb rather than the centre. That excess is the check. */
  const t = sunTimes(U("2026-03-20T12:00:00Z"), 0, 0);
  near(t.dayMinutes, 727, 3, "an equinox day at the equator runs about 12h07m, not 12h00m");
}
{
  const t = sunTimes(U("2026-06-21T12:00:00Z"), 69.6496, 18.956);
  ok(t.polar === "day" && t.rise === null, "inside the arctic circle at midsummer the sun does not set");
  const w = sunTimes(U("2026-12-21T12:00:00Z"), 69.6496, 18.956);
  ok(w.polar === "night" && w.dayMinutes === 0, "and at midwinter it does not rise");
}

/* Two independent paths to the same instant. `sunTimes` solves the hour angle in closed
   form; this walks the full-precision `position` minute by minute and interpolates the
   crossing. They share no arithmetic beyond the solar series itself, so agreement to
   under a minute is real evidence rather than a tautology. */
function scanCrossing(date, lat, lon, target = -0.833){
  const noon = sunTimes(U(date + "T12:00:00Z"), lat, lon).noon.getTime();
  const out = {};
  let prev = null;
  for(let k = -720; k <= 720; k++){
    const at = new Date(noon + k * 60000);
    const a = position(at, lat, lon).geometric;
    if(prev && ((prev.a <= target && a > target) || (prev.a >= target && a < target))){
      const f = (target - prev.a) / (a - prev.a);
      const t = new Date(prev.at.getTime() + f * 60000);
      out[a > target ? "rise" : "set"] = t;
    }
    prev = { a, at };
  }
  return out;
}
for(const [name, lat, lon, date] of [
    ["Coyote Holler in June", HOLLER.lat, HOLLER.lon, "2026-06-21"],
    ["Coyote Holler in December", HOLLER.lat, HOLLER.lon, "2026-12-21"],
    ["Sydney in June", -33.8688, 151.2093, "2026-06-21"],
    ["the equator at an equinox", 0, 0, "2026-03-20"]]){
  const closed = sunTimes(U(date + "T12:00:00Z"), lat, lon), scanned = scanCrossing(date, lat, lon);
  ok(mins(closed.rise, scanned.rise) < 1 && mins(closed.set, scanned.set) < 1,
     `the closed form and a minute-by-minute scan agree on sunrise and sunset — ${name}`);
}

console.log("\n-- interpolating the day's astronomy --");

/* `dayHours` evaluates the solar series twice a day and interpolates between, rather
   than recomputing it for all 1,440 minutes. That is an approximation, and this is what
   it costs. Held still for the whole day instead it would be a fifth of a degree out by
   the ends — about a minute of time; interpolated it is a thousandth of that, which is
   three orders of magnitude below the compass error that actually limits the answer.

   Tested at an equinox, when declination moves fastest. */
{
  const lat = HOLLER.lat, lon = HOLLER.lon;
  const noon = sunTimes(U("2026-03-20T12:00:00Z"), lat, lon).noon.getTime();
  const a = solarSeries(julian(new Date(noon - 720 * 60000)));
  const b = solarSeries(julian(new Date(noon + 720 * 60000)));
  let worst = 0, worstHeld = 0;
  for(let k = -720; k <= 720; k += 5){
    const at = new Date(noon + k * 60000), f = (k + 720) / 1440;
    const lerped = altAz(at, lat, lon, a.dec + (b.dec - a.dec) * f, a.eqTime + (b.eqTime - a.eqTime) * f);
    const held   = altAz(at, lat, lon, (a.dec + b.dec) / 2, (a.eqTime + b.eqTime) / 2);
    const full   = position(at, lat, lon);
    worst = Math.max(worst, Math.abs(lerped.alt - full.alt));
    worstHeld = Math.max(worstHeld, Math.abs(held.alt - full.alt));
  }
  ok(worst < 0.002, `interpolating across the day costs under 0.002° of altitude  (${worst.toFixed(5)}°)`);
  ok(worstHeld > worst * 20, `which is far better than holding it still would be  (${worstHeld.toFixed(4)}°)`);
}

console.log("\n-- the skyline --");

ok(Mask.at(Mask.make([]), 123) === 0, "an empty skyline is flat ground, not a hole");
ok(Mask.at(Mask.make([{ az: 90, alt: 20 }]), 300) === 20, "a single mark stands all the way round");
{
  const m = Mask.make([{ az: 0, alt: 0 }, { az: 90, alt: 30 }]);
  near(Mask.at(m, 45), 15, 1e-9, "between two marks the skyline is a straight line");
  near(Mask.at(m, 90), 30, 1e-9, "and lands exactly on a mark it is asked for");
}
{
  /* The one place this kind of code always breaks. */
  const m = Mask.make([{ az: 350, alt: 10 }, { az: 10, alt: 30 }]);
  near(Mask.at(m, 0), 20, 1e-9, "interpolation crosses north without noticing");
  near(Mask.at(m, 355), 15, 1e-9, "and reads correctly just short of it");
  near(Mask.at(m, 5), 25, 1e-9, "and just past it");
  /* Everywhere else is the long way round between the same two marks. */
  near(Mask.at(m, 180), 20, 1e-9, "the far side is the long segment between the same two marks");
}
{
  const m = Mask.make([{ az: 10, alt: 5 }, { az: 30, alt: 5 }, { az: 200, alt: 5 }]);
  const g = Mask.gaps(m, 25);
  ok(g.length === 2, "a survey with two wide holes in it reports two gaps");
  ok(g.some(x => Math.round(x.from) === 30 && Math.round(x.span) === 170), "the hole from 30° is 170° wide");
  ok(g.some(x => Math.round(x.from) === 200 && Math.round(x.span) === 170), "and the one through north is 170° wide too");
  ok(Mask.gaps(Mask.make([]), 25)[0].span === 360, "and a survey with nothing in it is one gap all the way round");
}

console.log("\n-- the arc the sun actually uses --");
{
  const env = azimuthEnvelope(HOLLER.lat, HOLLER.lon, 2026);
  near(env.from, 57, 3, "at 40°N the sun first appears around 57°, at midsummer sunrise");
  near(env.to, 303, 3, "and last around 303°, at midsummer sunset");
  ok(env.span < 250, "leaving a sector to the north it never enters, so the sweep is not a full circle");

  /* A hole in a part of the sky the sun never reaches is not a hole in the survey. Both
     of these are swept every 20° except for one deliberate hole, so there is exactly one
     gap to have an opinion about. */
  const swept = (from, to) => {
    const total = norm360(to - from), m = [];
    for(let a = 0; a < total; a += 20) m.push({ az: from + a, alt: 10 });
    m.push({ az: to, alt: 10 });
    return Mask.make(m);
  };

  const northHole = swept(50, 310);                     /* nothing swept from 310 round to 50 */
  ok(Mask.gaps(northHole, 25).length === 1, "the survey with a hole in the north has one gap");
  ok(gapsThatMatter(northHole, env, 25).length === 0,
     "and it lies entirely in the northern sky, so it is not worth walking back for");

  const southHole = swept(240, 120);                    /* nothing swept from 120 round to 240 */
  ok(Mask.gaps(southHole, 25).length === 1, "the survey with a hole across the south has one gap");
  ok(gapsThatMatter(southHole, env, 25).length === 1,
     "and that one is squarely in the sun's way, so it is reported");
}

console.log("\n-- counting the hours --");

const FLAT = Mask.make([]);
{
  const d = dayHours(U("2026-06-21T12:00:00Z"), HOLLER.lat, HOLLER.lon, FLAT);
  ok(d.minutes === d.dayMinutes, "with nothing in the way the spot is lit for the whole day");
  ok(d.minutes > 890 && d.minutes < 910, `and a June day at 40°N is about fifteen hours  (${(d.minutes/60).toFixed(2)}h)`);
  /* The almanac puts 40°N at 9h20m on the solstice, upper limb to upper limb. This
     counts the sun's centre instead, which is a few minutes shorter. */
  const w = dayHours(U("2026-12-21T12:00:00Z"), HOLLER.lat, HOLLER.lon, FLAT);
  ok(w.minutes > 548 && w.minutes < 562, `and a December one about nine and a third  (${(w.minutes/60).toFixed(2)}h)`);
  ok(d.minutes > w.minutes, "and summer is longer than winter, which is the whole point of the exercise");
}
{
  /* A wall ninety degrees high across every westward bearing. The sun is cut off the
     moment it passes south, so the spot gets the morning and nothing else — and the
     morning is half the day, because the sun crosses due south exactly at solar noon. */
  const wall = Mask.make([
    { az: 179.9, alt: 0 }, { az: 180, alt: 89 }, { az: 359.9, alt: 89 }, { az: 0, alt: 0 }]);
  const d = dayHours(U("2026-06-21T12:00:00Z"), HOLLER.lat, HOLLER.lon, wall);
  near(d.minutes, d.dayMinutes / 2, 3, "a wall across the whole west leaves exactly the morning");
  ok(d.last && d.last <= new Date(d.noon.getTime() + 120000),
     "and the last of the sun falls at solar noon, when it crosses into the west");
}
{
  /* The invariant that catches a sign error anywhere in the comparison. */
  const days = ["2026-02-15", "2026-06-21", "2026-10-05"];
  let monotone = true, strict = false;
  for(const day of days){
    let prev = Infinity;
    for(const h of [0, 5, 10, 20, 40, 70]){
      const m = Mask.make([{ az: 0, alt: h }, { az: 180, alt: h }]);
      const got = dayHours(U(day + "T12:00:00Z"), HOLLER.lat, HOLLER.lon, m).minutes;
      if(got > prev) monotone = false;
      if(got < prev) strict = true;
      prev = got;
    }
  }
  ok(monotone, "raising the skyline never gives the spot more sun");
  ok(strict, "and does take some away, so the comparison is doing something");
}
{
  const tall = Mask.make([{ az: 0, alt: 89 }, { az: 180, alt: 89 }]);
  ok(dayHours(U("2026-06-21T12:00:00Z"), HOLLER.lat, HOLLER.lon, tall).minutes === 0,
     "shut in on every side, the spot gets nothing and says so rather than dividing by zero");
  const d = dayHours(U("2026-06-21T12:00:00Z"), HOLLER.lat, HOLLER.lon, tall);
  ok(d.first === null && d.last === null, "with no first or last sun to report");
}
{
  /* A skyline below the horizon is a real thing — a spot on a bluff looking down a
     valley — and it must not be mistaken for no skyline at all. */
  const below = Mask.make([{ az: 0, alt: -5 }, { az: 180, alt: -5 }]);
  const d = dayHours(U("2026-12-21T12:00:00Z"), HOLLER.lat, HOLLER.lon, below);
  ok(d.minutes === d.dayMinutes, "a skyline that falls away below the horizon takes nothing");
}

console.log("\n-- the year, by month --");
{
  const t0 = Date.now();
  const year = byMonth(yearHours(HOLLER.lat, HOLLER.lon, 2026, FLAT));
  const ms = Date.now() - t0;
  ok(ms < 3000, `a whole year at one-minute steps costs a fraction of a second  (${ms} ms)`);
  ok(year.length === 12 && year.every(m => m.days >= 28), "twelve months, all of them full");
  ok(year.every(m => Math.abs(m.lost) < 1e-9), "with nothing in the way, no month loses an hour");
  ok(year[5].sun > year[11].sun, "June beats December at 40° north");

  const trees = Mask.make([
    { az: 60, alt: 5 }, { az: 100, alt: 22 }, { az: 140, alt: 25 }, { az: 180, alt: 12 },
    { az: 230, alt: 8 }, { az: 270, alt: 30 }, { az: 300, alt: 18 }]);
  const shaded = byMonth(yearHours(HOLLER.lat, HOLLER.lon, 2026, trees, 2));
  ok(shaded.every((m, i) => m.sun <= year[i].sun + 1e-9), "and a treeline costs every month of it something");
  ok(shaded.every(m => m.lost > 0), "which is what `lost` reports, month by month");
  ok(shaded.every(m => m.worst <= m.sun + 1e-9 && m.sun <= m.best + 1e-9),
     "the worst day of a month is no better than its mean, and the best no worse");

  /* The answer the whole thing exists to give: which months clear six hours. */
  const six = shaded.filter(m => m.sun >= 6).length;
  ok(six > 0 && six < 12, `some months clear six hours of sun and some do not  (${six} of 12)`);
}
{
  /* End to end, and the strongest check that the two halves are talking to each other:
     at the moment the sun first reaches the spot it must be sitting exactly ON the
     skyline — not above it, not below it. Any error anywhere between the astronomy and
     the interpolation shows up here as a gap. One minute of the sun's climb is about a
     fifth of a degree, so that is the tolerance. */
  const trees = Mask.make([
    { az: 45, alt: 4 }, { az: 70, alt: 22 }, { az: 90, alt: 28 }, { az: 110, alt: 30 },
    { az: 130, alt: 24 }, { az: 150, alt: 10 }, { az: 170, alt: 7 }, { az: 190, alt: 6 },
    { az: 210, alt: 9 }, { az: 230, alt: 14 }, { az: 250, alt: 20 }, { az: 270, alt: 24 },
    { az: 290, alt: 12 }, { az: 305, alt: 5 }]);
  let worst = 0, checked = 0;
  for(const day of ["2026-01-15", "2026-04-15", "2026-06-15", "2026-10-15", "2026-12-15"]){
    const d = dayHours(U(day + "T12:00:00Z"), HOLLER.lat, HOLLER.lon, trees);
    for(const t of [d.first, d.last]){
      if(!t) continue;
      const p = position(t, HOLLER.lat, HOLLER.lon);
      worst = Math.max(worst, Math.abs(p.alt - Mask.at(trees, p.az)));
      checked++;
    }
  }
  ok(checked === 10, "first and last sun are reported on all five test days");
  ok(worst < 0.25,
     `and at each of them the sun sits on the skyline to within a minute's climb  (${worst.toFixed(2)}°)`);
  /* And the sun must be BEHIND the trees a minute earlier, or "first" means nothing. */
  const d = dayHours(U("2026-01-15T12:00:00Z"), HOLLER.lat, HOLLER.lon, trees);
  const before = position(new Date(d.first.getTime() - 90000), HOLLER.lat, HOLLER.lon);
  ok(before.alt < Mask.at(trees, before.az), "a minute and a half earlier it was still behind them");
}
{
  /* Stepping coarsely is a speed dial, not a different answer. */
  const trees = Mask.make([{ az: 90, alt: 20 }, { az: 270, alt: 20 }]);
  const fine = dayHours(U("2026-04-10T12:00:00Z"), HOLLER.lat, HOLLER.lon, trees, 1).minutes;
  const coarse = dayHours(U("2026-04-10T12:00:00Z"), HOLLER.lat, HOLLER.lon, trees, 5).minutes;
  ok(Math.abs(fine - coarse) <= 10, `five-minute steps land within ten minutes of one-minute steps  (${fine} vs ${coarse})`);
}

console.log("\n-- the compass, and what is wrong with it --");
{
  /* The feasibility test itself, in miniature. Sight along a shadow, hand the compass
     reading in, and get back what the compass is lying by. Here the reading is
     manufactured from a known error, and the check is that it comes back out. */
  const when = U("2026-06-21T17:00:00Z");     /* early afternoon at 80° west */
  const truth = position(when, HOLLER.lat, HOLLER.lon);
  const shadowBearing = norm360(truth.az + 180);
  for(const err of [-12, -3, 0, 7, 25]){
    const c = compassError(when, HOLLER.lat, HOLLER.lon, norm360(shadowBearing + err), "shadow");
    near(c.error, err, 1e-6, `a compass ${err}° out is measured as ${err}° out, off a shadow`);
  }
  const c = compassError(when, HOLLER.lat, HOLLER.lon, norm360(truth.az + 9), "sun");
  near(c.error, 9, 1e-6, "and sighting the sun's disc instead gives the same answer");
  ok(c.usable === true, "with the sun well up, the sighting is usable");
  ok(compassError(U("2026-06-21T09:30:00Z"), HOLLER.lat, HOLLER.lon, 0, "shadow").usable === false,
     "and at first light there is no shadow worth sighting along, which it says");
}
{
  /* Wrapping, again, because a shadow sighting near north is exactly where it would break. */
  const when = U("2026-06-21T12:30:00Z");
  const truth = position(when, HOLLER.lat, HOLLER.lon);
  const c = compassError(when, HOLLER.lat, HOLLER.lon, norm360(truth.az + 180 - 2), "shadow");
  near(c.error, -2, 1e-6, "a shadow sighting either side of north wraps correctly");
}
/* What a compass error actually costs, which is the number that decides whether any of
   this works. A systematic offset turns the whole skyline on the spot, so it moves the
   eastern edge one way and the western edge the other. What that does to the answer
   depends entirely on whether the site is symmetric, and both cases are worth pinning
   down because together they are the argument for doing the shadow sight at all. */
{
  const skew = (m, off) => Mask.make(m.map(p => ({ az: p.az + off, alt: p.alt })));
  const on = (m, day) => dayHours(U(day + "T12:00:00Z"), HOLLER.lat, HOLLER.lon, m);

  /* Trees more or less evenly round: the two edges move in opposite directions and very
     nearly cancel, so the total survives an error that ruins the times. */
  const even = Mask.make([
    { az: 60, alt: 12 }, { az: 120, alt: 20 }, { az: 180, alt: 15 },
    { az: 240, alt: 20 }, { az: 300, alt: 12 }]);
  const base = on(even, "2026-04-15"), off = on(skew(even, 10), "2026-04-15");
  ok(Math.abs(off.minutes - base.minutes) <= 3,
     `on an even skyline a 10° compass error barely moves the day's total  (${off.minutes - base.minutes} min)`);
  ok(mins(off.first, base.first) >= 6,
     `while moving first light by several times as much  (${mins(off.first, base.first)} min)`);

  /* Trees crowding the east and open to the west: nothing cancels, and in December the
     error lands right on the half-hour this tool is trying to stay inside. This is why
     the shadow sight is a step in the survey rather than a nicety — it is what turns a
     ±10° unknown into a ±2° known, and a 27-minute error into a five-minute one. */
  const lopsided = Mask.make([
    { az: 45, alt: 5 }, { az: 75, alt: 28 }, { az: 105, alt: 30 }, { az: 135, alt: 26 },
    { az: 165, alt: 6 }, { az: 200, alt: 2 }, { az: 315, alt: 2 }]);
  const win = on(lopsided, "2026-12-21");
  const wOff = Math.max(mins(win.first, on(skew(lopsided, 10), "2026-12-21").first),
                        mins(win.first, on(skew(lopsided, -10), "2026-12-21").first));
  const wTot = Math.max(Math.abs(win.minutes - on(skew(lopsided, 10), "2026-12-21").minutes),
                        Math.abs(win.minutes - on(skew(lopsided, -10), "2026-12-21").minutes));
  ok(wTot > 15, `on a lopsided skyline the total does not cancel — a 10° error costs ${wTot} minutes of a winter day`);
  ok(wTot < 40, "which is the size of the problem the shadow sight exists to remove");
  ok(wOff > 15, `and first light moves with it  (${wOff} min)`);

  /* And the point of the sight: a couple of degrees is a few minutes, not half an hour. */
  const small = Math.abs(win.minutes - on(skew(lopsided, 2), "2026-12-21").minutes);
  ok(small <= 8, `corrected to within 2°, the same winter day is out by ${small} minutes`);
}

console.log("\n-- the page (source checks) --");
{
  const fs = require("fs");
  const page = fs.readFileSync(require("path").join(__dirname, "sun.html"), "utf8");
  ok(/<script src="sun\.js"><\/script>/.test(page), "the page loads the model rather than restating it");
  ok(!/function solarSeries|function refraction/.test(page), "and holds no astronomy of its own");
  ok(/getUserMedia/.test(page) && /catch/.test(page), "the camera is asked for and its refusal is caught");
  ok(/cameraOptional|noCamera|camera is an aiming aid/i.test(page),
     "and the page says out loud that it works without one");
  ok(/requestPermission/.test(page), "iOS is asked for the motion sensors from a tap, as it requires");
  ok(/webkitCompassHeading/.test(page), "and its true-north heading is preferred where it exists");
  ok(/webkitCompassAccuracy/.test(page), "and its own account of how badly it is doing is read");
  ok(/declination/i.test(page), "Android's magnetic north is corrected by a declination");
  ok(/median/i.test(page), "a mark is the median of many samples, not one twitch of the needle");
  ok(/localStorage/.test(page), "the survey is kept on the phone");
  /* The separation is the point of the proof of concept, so it is worth a test rather
     than a promise. Prose may name farm-data.json — the code may not touch it. */
  const srcs = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map(s => /src="([^"]+)"/.exec(s)[1]);
  ok(srcs.length === 1 && srcs[0] === "sun.js", "the page loads sun.js and nothing else");
  ok(!/api\.github\.com|Store\.|Outbox\.|dataFile\(/.test(page),
     "and reaches for neither the farm's records nor the seam that writes them");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
