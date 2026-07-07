// The temporal cycle (Proprium de Tempore): the season/week/day a given date
// occupies in the 1962 liturgical year, computed perpetually from Easter and
// the Advent anchor rather than scraped per year.
//
// `temporalDay(n)` returns a compact signature whose fields are chosen to line
// up with the tags parsed onto the propers (see scripts/parse_propers.py):
//   season   — advent | christmas | epiphany | septuagesima | sexagesima |
//              quinquagesima | lent | easter | ascension | pentecost
//   week     — ordinal within the season, or null when the season isn't counted
//   weekday  — 0 = Sunday … 6 = Saturday
//   special  — the day's distinguishing character, if any
// `alt` lists additional special Masses also permitted that day (e.g. the
// numbered Sunday behind a displacing feast) so the resolver can offer them.

import {
  advent1,
  dayNum,
  easter,
  fromDayNum,
  sundayOnOrAfter,
  weekday,
} from "./computus.ts";

export interface TemporalSig {
  season: string;
  week: number | null;
  weekday: number;
  special: string | null;
  /** Extra special keys valid this day (offered as alternates by the resolver). */
  alt: string[];
}

/** The Easter-year (spring civil year) of the liturgical year containing `n`. */
export function easterYearOf(n: number): number {
  const { y } = fromDayNum(n);
  // Advent of civil year y starts the liturgical year whose Easter is y + 1.
  return n >= advent1(y) ? y + 1 : y;
}

export function temporalDay(n: number): TemporalSig {
  const ey = easterYearOf(n);
  const E = easter(ey);
  const wd = weekday(n);
  const alt: string[] = [];

  const adventStart = advent1(ey - 1);
  const christmas = dayNum(ey - 1, 12, 25);
  const epiphany = dayNum(ey, 1, 6);
  const septuagesima = E - 63;

  // --- Advent: first Sunday of Advent up to (but not including) Christmas. ---
  if (n >= adventStart && n < christmas) {
    const week = Math.floor((n - adventStart) / 7) + 1;
    // Ember days fall in the third week of Advent (after St Lucy, Dec 13).
    const emberWed = adventStart + 14 + 3;
    const special =
      n === emberWed || n === emberWed + 2 || n === emberWed + 3 ? "ember" : null;
    return { season: "advent", week, weekday: wd, special, alt };
  }

  // --- Christmastide: Christmas up to the Epiphany. ---
  if (n >= christmas && n < epiphany) {
    // Holy Name: the Sunday between Jan 2 and Jan 5, otherwise Jan 2.
    const holyNameSun = sundayOnOrAfter(dayNum(ey, 1, 2));
    const holyName = holyNameSun <= dayNum(ey, 1, 5) ? holyNameSun : dayNum(ey, 1, 2);
    if (n === holyName)
      return { season: "christmas", week: null, weekday: wd, special: "holy-name", alt };
    if (n === christmas + 3) // Dec 28, Holy Innocents / octave
      return { season: "christmas", week: null, weekday: wd, special: "octave", alt };
    return { season: "christmas", week: null, weekday: wd, special: null, alt };
  }

  // --- Epiphany and its Sundays, up to Septuagesima. ---
  if (n >= epiphany && n < septuagesima) {
    if (n === epiphany)
      return { season: "epiphany", week: null, weekday: wd, special: null, alt };
    const firstSun = sundayOnOrAfter(epiphany + 1);
    if (wd === 0) {
      const ordinal = Math.floor((n - firstSun) / 7) + 1;
      if (n === firstSun) {
        // Holy Family displaces the 1st Sunday after Epiphany; offer both.
        alt.push("epiphany-1");
        return { season: "epiphany", week: 1, weekday: wd, special: "holy-family", alt };
      }
      return { season: "epiphany", week: ordinal, weekday: wd, special: null, alt };
    }
    return { season: "epiphany", week: null, weekday: wd, special: null, alt };
  }

  const ashWed = E - 46;

  // --- Pre-Lent (Gesima Sundays and their weeks). The Quinquagesima week runs
  // only to Shrove Tuesday; Ash Wednesday begins Lent. ---
  for (const [season, sunday] of [
    ["septuagesima", septuagesima],
    ["sexagesima", E - 56],
    ["quinquagesima", E - 49],
  ] as const) {
    if (n >= sunday && n < sunday + 7 && n < ashWed)
      return { season, week: null, weekday: wd, special: null, alt };
  }

  // --- Lent (Ash Wednesday through Holy Saturday). ---
  if (n >= ashWed && n < E) {
    if (n < E - 42) // Ash Wednesday to the eve of the first Sunday of Lent.
      return { season: "lent", week: null, weekday: wd, special: "ash", alt };
    // Lenten weeks 1–6; week 6 is Holy Week (Palm Sunday onward).
    const week = Math.floor((n - (E - 42)) / 7) + 1;
    return { season: "lent", week, weekday: wd, special: null, alt };
  }

  // --- Eastertide (Easter Sunday through the Saturday before Pentecost). ---
  const pentecost = E + 49;
  if (n >= E && n < pentecost) {
    const off = n - E;
    if (off <= 6) // Easter week: Easter Sunday and its octave.
      return { season: "easter", week: null, weekday: wd, special: null, alt };
    if (off <= 35) // Sundays after Easter: Low Sunday (1st, E+7) … 5th (E+35).
      return { season: "easter", week: Math.floor(off / 7), weekday: wd, special: null, alt };
    if (off <= 38) // Rogation Mon/Tue/Wed, in the 5th week before Ascension.
      return { season: "easter", week: 5, weekday: wd, special: "rogation", alt };
    if (off === 48) // Saturday, Vigil of Pentecost.
      return { season: "pentecost", week: null, weekday: wd, special: "vigil", alt };
    // Ascension (Thu, E+39), the Sunday after (E+42), and the intervening ferias.
    return { season: "ascension", week: null, weekday: wd, special: null, alt };
  }

  // --- Pentecost and the season after it. ---
  const trinity = E + 56;
  if (n === pentecost)
    return { season: "pentecost", week: null, weekday: wd, special: null, alt };
  if (n > pentecost && n < pentecost + 7) {
    // Whit week: the octave of Pentecost (its Ember days have their own Whit
    // Wed/Fri/Sat propers, so the whole octave is marked "whit").
    return { season: "pentecost", week: null, weekday: wd, special: "whit", alt };
  }
  // Michaelmas Embertide: Wed/Fri/Sat after the third Sunday of September.
  const septEmberWed = sundayOnOrAfter(dayNum(ey, 9, 1)) + 14 + 3;
  if (n === septEmberWed || n === septEmberWed + 2 || n === septEmberWed + 3)
    return { season: "pentecost", week: null, weekday: wd, special: "ember", alt };
  if (n === E + 60)
    return { season: "pentecost", week: null, weekday: wd, special: "corpus-christi", alt };
  if (n === E + 68)
    return { season: "pentecost", week: null, weekday: wd, special: "sacred-heart", alt };
  // Christ the King: the last Sunday of October (1962 placement).
  if (n === dayNum(ey, 10, 31) - weekday(dayNum(ey, 10, 31)))
    return { season: "pentecost", week: null, weekday: wd, special: "christ-the-king", alt };

  // Sundays after Pentecost. The 1st is Trinity (E+56); count weekly to Advent.
  // The last Sunday before Advent is always the "Last Sunday after Pentecost";
  // the two before it are the "2nd-/3rd-last" (resumed Sundays after Epiphany).
  const lastSunday = advent1(ey) - 7;
  const totalSundays = (lastSunday - trinity) / 7 + 1; // 1 = Trinity
  const precedingSunday = n - wd; // Sunday on or before n
  const posFromStart = (precedingSunday - trinity) / 7 + 1; // 1 = Trinity week
  const posFromEnd = totalSundays - posFromStart; // 0 = last, 1 = 2nd-last …

  if (precedingSunday === trinity)
    return {
      season: "pentecost",
      week: 1,
      weekday: wd,
      special: wd === 0 ? "trinity" : null,
      alt,
    };

  let special: string | null = null;
  let week: number;
  if (posFromEnd === 0) {
    special = "last";
    week = 99;
  } else if (posFromEnd === 1) {
    special = "2nd-last";
    week = 98;
  } else if (posFromEnd === 2) {
    special = "3rd-last";
    week = 97;
  } else {
    week = Math.min(posFromStart, 23); // numbered 2nd … 23rd (dataset ceiling)
  }
  return {
    season: "pentecost",
    week,
    weekday: wd,
    special: wd === 0 ? special : null,
    alt,
  };
}
