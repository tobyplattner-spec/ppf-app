/* Hours of direct sun on one spot — the model.

   A proof of concept, and separate from the farm app on purpose: nothing here knows
   about peonies, and nothing in index.html or store.js knows about this.

   The whole question is two facts and one comparison.

     Where the sun is       its altitude above the horizon and its azimuth (compass
                            bearing), for a latitude, a longitude and a moment. Pure
                            astronomy, good to about a tenth of a degree, no network.

     How high the skyline    the elevation angle of the treeline in that direction. A
     is in that direction    function from azimuth to angle — the horizon mask. This is
                            the part you go outside and measure.

     The spot is in sun when the sun's altitude is greater than the mask's elevation at
     the sun's azimuth. Count the minutes that holds across a day and you have the day's
     sun hours; do it for every day of the year and you have the answer by month.

   Only the ANGLE of an obstruction matters, never its height or its distance. A sixty
   foot oak two hundred feet away and a fifteen foot hedge fifty feet away shade this
   spot identically. That is why the survey never has to measure a tree, and why the
   camera in sun.html is an aiming aid rather than an instrument.

   No DOM in this file. That is what lets test-sun.js pull the real functions into node
   and check them against known astronomy rather than against a second copy of them —
   the same arrangement store.js has with test-seam.js. */

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const MIN = 60000;                    /* one minute, in milliseconds */

const norm = (x, m) => ((x % m) + m) % m;
const norm360 = a => norm(a, 360);
/* The short way round from b to a, in (-180, 180]. Every azimuth comparison in this
   file goes through here, because the one place this kind of code always breaks is
   the seam at 0/360. */
const arc = (a, b) => { const d = norm360(a - b); return d > 180 ? d - 360 : d; };

/* ============================================================================
   The sun
   ============================================================================ */

/* NOAA's solar position algorithm, the one behind their published calculator. Good to
   about 0.1 degrees, which is fifty times better than any phone's compass — so the
   astronomy is never what limits the answer, and it is worth knowing that going in. */

/* Julian day from a Date. Exact: the epoch is 2440587.5. */
const julian = date => date.getTime() / 86400000 + 2440587.5;

/* Everything about the sun that depends on the date but not on where you are standing.
   Declination is how far north or south of the equator the sun stands; the equation of
   time is how far ahead or behind the sun runs against the clock, in minutes, and it is
   the reason solar noon wanders by a quarter of an hour across the year. */
function solarSeries(jd){
  const T = (jd - 2451545) / 36525;                                  /* Julian century */

  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032)); /* mean longitude */
  const M  = 357.52911 + T * (35999.05029 - 0.0001537 * T);          /* mean anomaly */
  const e  = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);     /* eccentricity */

  /* The equation of centre: the correction from a circular orbit to the real one. */
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T))
          + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T)
          + Math.sin(3 * M * RAD) * 0.000289;

  const trueLong = L0 + C;
  const omega    = 125.04 - 1934.136 * T;                            /* lunar node */
  const lambda   = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);  /* apparent */

  /* Obliquity: the tilt that makes seasons at all. */
  const e0  = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = e0 + 0.00256 * Math.cos(omega * RAD);

  const dec = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;

  const y = Math.tan(eps / 2 * RAD) ** 2;
  const eqTime = 4 * DEG * (
      y * Math.sin(2 * L0 * RAD)
    - 2 * e * Math.sin(M * RAD)
    + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD)
    - 1.25 * e * e * Math.sin(2 * M * RAD));

  return { dec, eqTime };
}

/* How much the atmosphere lifts the sun above where it geometrically is. About half a
   degree at the horizon and nothing at all overhead — which is most of the difference
   between a sunrise computed and a sunrise watched. NOAA's piecewise fit, in arcseconds. */
function refraction(elev){
  if(elev > 85) return 0;
  const t = Math.tan(elev * RAD);
  let r;
  if(elev > 5)          r = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
  else if(elev > -0.575) r = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else                  r = -20.772 / t;
  return r / 3600;
}

/* Where the sun stands, seen from a spot on the ground.

   Altitude comes back REFRACTED — the sun as you would see it, not as it geometrically
   is — because the skyline was measured through the same air and the two have to be
   compared like with like. `geometric` is there beside it for the almanac conventions
   below, which are defined on the true position.

   Longitude is east-positive throughout this file. Azimuth is degrees clockwise from
   true north: 0 north, 90 east, 180 south, 270 west. */
function position(when, lat, lon){
  const { dec, eqTime } = solarSeries(julian(when));
  return altAz(when, lat, lon, dec, eqTime);
}

/* The part of `position` that depends on the minute, split out because declination and
   the equation of time barely move within a day and recomputing them 1,440 times over
   is most of the cost of a year. `dayHours` holds them still; `position` does not. */
function altAz(when, lat, lon, dec, eqTime){
  /* True solar time, in minutes from solar midnight. */
  const utcMin = (when.getTime() / MIN) % 1440;
  const tst = norm(utcMin + eqTime + 4 * lon, 1440);
  const ha  = tst / 4 - 180;                    /* hour angle: 0 at noon, + in the afternoon */

  const φ = lat * RAD, δ = dec * RAD, H = ha * RAD;
  const sinAlt = Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H);
  const geometric = Math.asin(Math.min(1, Math.max(-1, sinAlt))) * DEG;

  /* Measured from due south and positive westward, then turned to bear from north.
     atan2 rather than acos so the quadrant comes out of the arithmetic instead of an
     `if`, which is what keeps it right either side of noon. */
  const az = norm360(Math.atan2(
      Math.sin(H),
      Math.cos(H) * Math.sin(φ) - Math.tan(δ) * Math.cos(φ)) * DEG + 180);

  return { alt: geometric + refraction(geometric), geometric, az, dec, eqTime, ha, when };
}

/* The almanac's sunrise and sunset: the moment the sun's UPPER LIMB touches the horizon,
   which is where the tables put it — half a degree of refraction plus a quarter of a
   degree of the sun's own width, hence 90.833.

   Note this is a different question from the one the rest of the file answers. Direct
   sun on a plant is about the sun's centre clearing a treeline; sunrise in a newspaper
   is about the first sliver of limb clearing a flat sea horizon. The two differ by a
   couple of minutes and both are wanted — one to check this file against published
   tables, one to actually answer the question.

   Astronomy is evaluated at the day's solar noon, as NOAA's own calculator does, so the
   numbers here can be compared with theirs directly. */
function sunTimes(when, lat, lon, zenith = 90.833){
  const dayStart = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
  /* Solar noon, near enough to evaluate the day's astronomy at. */
  const { dec, eqTime } = solarSeries(julian(new Date(dayStart + (12 - lon / 15) * 3600000)));

  const noonMin = 720 - 4 * lon - eqTime;
  const noon = new Date(dayStart + noonMin * MIN);

  const cosH = Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(dec * RAD))
             - Math.tan(lat * RAD) * Math.tan(dec * RAD);

  /* Above the arctic circles the sun can decline to rise or to set at all, and that is
     an answer rather than an error. */
  if(cosH > 1)  return { rise: null, set: null, noon, dayMinutes: 0,    polar: "night", dec, eqTime };
  if(cosH < -1) return { rise: null, set: null, noon, dayMinutes: 1440, polar: "day",   dec, eqTime };

  const h0 = Math.acos(cosH) * DEG;
  return {
    rise: new Date(dayStart + (noonMin - 4 * h0) * MIN),
    set:  new Date(dayStart + (noonMin + 4 * h0) * MIN),
    noon, dayMinutes: 8 * h0, polar: null, dec, eqTime
  };
}

/* ============================================================================
   The skyline
   ============================================================================ */

/* A mask is a list of sighted points — an azimuth and the elevation angle of the
   treeline there — held sorted, and read back by interpolating between neighbours.
   Nothing about it is a grid: twenty marks around the sun's arc describe a skyline
   perfectly well, and pretending to 360 of them would only invent detail. */
const Mask = {
  make(marks){
    return (marks || [])
      .filter(p => p && isFinite(p.az) && isFinite(p.alt))
      .map(p => ({ az: norm360(p.az), alt: +p.alt }))
      .sort((a, b) => a.az - b.az);
  },

  /* The skyline's elevation at one bearing. Straight lines between marks, wrapping
     through north, so the segment either side of 0/360 is no different from any other. */
  at(m, az){
    if(!m.length) return 0;
    if(m.length === 1) return m[0].alt;
    az = norm360(az);
    let i = 0;
    while(i < m.length && m[i].az < az) i++;
    /* i === m.length and i === 0 both land on the segment that straddles north. */
    const b = m[i % m.length], a = m[(i - 1 + m.length) % m.length];
    const span = norm360(b.az - a.az);
    if(span === 0) return a.alt;
    return a.alt + (b.alt - a.alt) * (norm360(az - a.az) / span);
  },

  /* Where the survey is thin. An unswept sector reads as flat ground and quietly
     inflates the answer, which is exactly the failure this tool must not have — so the
     gaps are a first-class output and the page says so out loud. */
  gaps(m, maxGap = 25){
    if(m.length < 2) return [{ from: 0, to: 360, span: 360 }];
    const out = [];
    for(let i = 0; i < m.length; i++){
      const a = m[i], b = m[(i + 1) % m.length];
      const span = norm360(b.az - a.az);
      if(span > maxGap) out.push({ from: a.az, to: b.az, span });
    }
    return out;
  },

  /* The highest the skyline gets, for scaling a drawing. */
  ceiling(m){ return m.reduce((h, p) => Math.max(h, p.alt), 0); }
};

/* ============================================================================
   Counting the hours
   ============================================================================ */

/* Recomputing the sun's declination and the equation of time for all 1,440 minutes of a
   day is most of what a year costs, and holding them still for the whole day is a fifth
   of a degree out by the ends of it — about a minute of time. Neither is necessary: both
   quantities are very nearly straight lines across twenty-four hours, so the ends are
   computed and everything between them interpolated. Two evaluations a day instead of
   1,440, and the error falls to a thousandth of a degree.

   `f` runs 0 to 1 across the window, which is the twenty-four hours centred on solar
   noon rather than a calendar day — that costs nothing and means the sun's arc is never
   cut in half by midnight, which is a real problem at high latitude and at the far end
   of a wide time zone. */
function daySpan(noonMs){
  return { a: solarSeries(julian(new Date(noonMs - 720 * MIN))),
           b: solarSeries(julian(new Date(noonMs + 720 * MIN))) };
}
const spanAt = (s, f) => ({ dec:    s.a.dec    + (s.b.dec    - s.a.dec)    * f,
                            eqTime: s.a.eqTime + (s.b.eqTime - s.a.eqTime) * f });

/* One day, minute by minute. */
function dayHours(when, lat, lon, mask, step = 1){
  const t = sunTimes(when, lat, lon);
  const noon = t.noon.getTime(), span = daySpan(noon);
  let lit = 0, up = 0, first = null, last = null;

  for(let k = -720; k < 720; k += step){
    const at = new Date(noon + k * MIN);
    const s = spanAt(span, (k + 720) / 1440);
    const p = altAz(at, lat, lon, s.dec, s.eqTime);
    if(p.alt <= 0) continue;
    up += step;
    if(p.alt > Mask.at(mask, p.az)){
      lit += step;
      if(first === null) first = at;
      last = new Date(at.getTime() + step * MIN);
    }
  }

  return {
    date: new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate())),
    minutes: lit,          /* minutes of direct sun on the spot */
    dayMinutes: up,        /* minutes the sun was up at all, for comparison */
    first, last,           /* when the sun first and last reached the spot */
    rise: t.rise, set: t.set, noon: t.noon, polar: t.polar
  };
}

/* Every day of a year. About half a million evaluations of the sun's position, which is
   a fraction of a second — so there is no need for a representative day per month, and
   the monthly figure below is a real average of real days rather than a stand-in. */
function yearHours(lat, lon, year, mask, step = 1){
  const out = [];
  for(let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year;
      d = new Date(d.getTime() + 86400000)){
    out.push(dayHours(d, lat, lon, mask, step));
  }
  return out;
}

const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

/* The year gathered into twelve rows. `lost` is the one to read: the hours a day the
   skyline costs this spot, which is the whole reason for standing outside with a phone. */
function byMonth(days){
  return MONTHS.map((name, i) => {
    const d = days.filter(x => x.date.getUTCMonth() === i);
    if(!d.length) return { month: i, name, days: 0 };
    const hrs = d.map(x => x.minutes / 60), day = d.map(x => x.dayMinutes / 60);
    const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
    const mid = d[Math.floor(d.length / 2)];
    return {
      month: i, name, days: d.length,
      sun: mean(hrs),                        /* mean hours of direct sun a day */
      best: Math.max(...hrs), worst: Math.min(...hrs),
      daylight: mean(day),                   /* mean hours the sun was up at all */
      lost: mean(day) - mean(hrs),           /* what the trees cost, hours a day */
      mid                                    /* a middling day, for its first/last times */
    };
  });
}

/* ============================================================================
   Drawing the sun
   ============================================================================ */

/* The sun's track across one day, as points to plot: azimuth along, altitude up. */
function sunArc(when, lat, lon, step = 4){
  const t = sunTimes(when, lat, lon), noon = t.noon.getTime(), span = daySpan(noon), out = [];
  for(let k = -720; k <= 720; k += step){
    const at = new Date(noon + k * MIN);
    const s = spanAt(span, (k + 720) / 1440);
    const p = altAz(at, lat, lon, s.dec, s.eqTime);
    if(p.alt > -1) out.push({ az: p.az, alt: p.alt, when: at });
  }
  return out;
}

/* The arc of the compass the sun ever uses here, all year.

   Outside the tropics there is a sector to the north it never enters — at 40°N, roughly
   301° round through 059° — and there is no reason to sweep a skyline the sun will never
   pass behind. Sampling rather than solving, because the closed form has awkward cases in
   the tropics and this costs a few thousand evaluations, which is nothing.

   Measured as offsets from the noon bearing so the wrap through north is never in the
   middle of the range being compared. */
function azimuthEnvelope(lat, lon, year = 2026){
  const centre = lat >= 0 ? 180 : 0;
  let lo = 0, hi = 0, any = false;
  /* The solstices bound it; the rest are cheap insurance in the tropics. */
  for(const day of [0, 45, 80, 135, 172, 220, 265, 310, 355]){
    const when = new Date(Date.UTC(year, 0, 1 + day));
    for(const p of sunArc(when, lat, lon, 5)){
      if(p.alt <= 0) continue;
      const d = arc(p.az, centre);
      if(!any){ lo = hi = d; any = true; }
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
  }
  if(!any) return { from: 0, to: 360, span: 360, centre, lo: -180, hi: 180 };
  /* lo and hi are kept rather than a half-span either side of centre: the arc is very
     nearly symmetric about noon but there is no need to assume it, and `holds` below
     wants the real bounds. */
  return { from: norm360(centre + lo), to: norm360(centre + hi),
           span: Math.min(360, hi - lo), centre, lo, hi,
           holds(az){ const d = arc(az, this.centre);
                      return this.span >= 359 || (d >= this.lo - 1e-9 && d <= this.hi + 1e-9); } };
}

/* Whether a gap in the survey actually matters — a hole in the northern sky at this
   latitude does not. Returns the gaps that fall inside the sun's own arc. */
function gapsThatMatter(mask, envelope, maxGap = 25){
  return Mask.gaps(mask, maxGap).filter(g => {
    /* Any part of the gap inside the envelope is enough to care about. */
    for(let a = 0; a <= g.span; a += Math.max(1, Math.min(5, g.span)))
      if(envelope.holds(norm360(g.from + a))) return true;
    return false;
  });
}

/* ============================================================================
   The compass, and what is wrong with it
   ============================================================================ */

/* A phone's magnetometer is good to somewhere between five and fifteen degrees, and
   worse beside a truck or a wire fence. That error, not the astronomy, is the whole
   accuracy question — so the survey should measure it rather than hope.

   The measurement is free and needs no equipment: a shadow's bearing is the sun's
   bearing plus exactly 180°, and this file knows the sun's bearing to a tenth of a
   degree. Sight along any shadow, hand the compass reading here, and what comes back is
   the compass's error in degrees. Subtract it from every mark and a ±10° unknown has
   become a ±2° known.

   (Sighting the sun's disc on the screen works identically — pass `sun` for `sighting`.
   The shadow is preferable only because it asks nobody to point a camera at the sun.) */
function compassError(when, lat, lon, readingDeg, sighting = "shadow"){
  const p = position(when, lat, lon);
  const trueBearing = sighting === "shadow" ? norm360(p.az + 180) : p.az;
  return {
    error: arc(readingDeg, trueBearing),   /* add to true, or subtract from readings */
    trueBearing, sunAz: p.az, sunAlt: p.alt,
    /* Below the horizon there is no shadow to sight along and no disc to see. */
    usable: p.alt > 3
  };
}

/* ---------- the two faces this file has ---------- */
/* A browser loads it with a script tag and a node test requires it, exactly as store.js
   is arranged, so the test runs the real functions rather than a copy of them. */
const API = { RAD, DEG, norm360, arc, julian, solarSeries, refraction, position, altAz,
  sunTimes, Mask, dayHours, yearHours, byMonth, MONTHS, sunArc, azimuthEnvelope,
  gapsThatMatter, compassError };

if(typeof window !== "undefined") Object.assign(window, API, { Sun: API });
if(typeof module !== "undefined" && module.exports) module.exports = API;
