// Exact dice distributions. Every count is a BigInt, so nothing is sampled and
// nothing is rounded until you ask for a decimal.
//
// A distribution is { counts: Map<total, BigInt>, outcomes: BigInt }:
// `counts.get(t)` ways of rolling total t, out of `outcomes` equally likely rolls.

function check(n, sides) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`dice count must be a positive integer, got ${n}`);
  if (!Number.isInteger(sides) || sides < 1) throw new RangeError(`sides must be a positive integer, got ${sides}`);
}

function bump(map, key, by) {
  map.set(key, (map.get(key) ?? 0n) + by);
}

function sorted(map) {
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}

/** A fixed number, as a distribution: one outcome, one total. */
export function constant(value) {
  if (!Number.isInteger(value)) throw new RangeError(`constant must be an integer, got ${value}`);
  return { counts: new Map([[value, 1n]]), outcomes: 1n };
}

/** Sum of two independent distributions. */
export function add(a, b) {
  const out = new Map();
  for (const [x, cx] of a.counts) for (const [y, cy] of b.counts) bump(out, x + y, cx * cy);
  return { counts: sorted(out), outcomes: a.outcomes * b.outcomes };
}

/** Every total flipped in sign: used for subtracted terms like `1d20 - 1d4`. */
export function negate(d) {
  const out = new Map();
  for (const [x, c] of d.counts) out.set(-x, c);
  return { counts: sorted(out), outcomes: d.outcomes };
}

/** NdX: the sum of n dice with `sides` faces each. */
export function dice(n, sides) {
  return keep(n, sides, n, 'high');
}

function binomials(n) {
  const rows = [[1n]];
  for (let i = 1; i <= n; i++) {
    const row = [1n];
    for (let j = 1; j < i; j++) row.push(rows[i - 1][j - 1] + rows[i - 1][j]);
    row.push(1n);
    rows.push(row);
  }
  return rows;
}

/**
 * Roll n dice, keep the k highest (or lowest), sum them.
 *
 * Walks the faces from best to worst. At each face it decides how many of the
 * remaining dice show that face; the first k dice placed are the kept ones.
 * Counts multiply by C(remaining, c), which together give the multinomial
 * count of every ordered roll, so the result is exact without listing rolls.
 */
export function keep(n, sides, k, which = 'high') {
  check(n, sides);
  if (!Number.isInteger(k) || k < 0 || k > n) throw new RangeError(`keep must be 0..${n}, got ${k}`);
  if (which !== 'high' && which !== 'low') throw new RangeError(`which must be 'high' or 'low'`);

  const C = binomials(n);
  const faces = [];
  for (let v = 1; v <= sides; v++) faces.push(v);
  if (which === 'high') faces.reverse();

  // state key: `${placed},${keptSum}`
  let states = new Map([['0,0', 0n + 1n]]);
  for (const v of faces) {
    const next = new Map();
    for (const [key, ways] of states) {
      const [placed, sum] = key.split(',').map(Number);
      const left = n - placed;
      for (let c = 0; c <= left; c++) {
        const kept = Math.max(0, Math.min(c, k - placed));
        bump(next, `${placed + c},${sum + kept * v}`, ways * C[left][c]);
      }
    }
    states = next;
  }

  const counts = new Map();
  for (const [key, ways] of states) {
    const [placed, sum] = key.split(',').map(Number);
    if (placed === n) bump(counts, sum, ways);
  }
  return { counts: sorted(counts), outcomes: BigInt(sides) ** BigInt(n) };
}

/** 2d20, keep the higher. */
export const advantage = (sides = 20) => keep(2, sides, 1, 'high');
/** 2d20, keep the lower. */
export const disadvantage = (sides = 20) => keep(2, sides, 1, 'low');

/** Ways to roll `target` or more, as { ways, outcomes, probability }. */
export function atLeast(d, target) {
  let ways = 0n;
  for (const [x, c] of d.counts) if (x >= target) ways += c;
  return { ways, outcomes: d.outcomes, probability: ratio(ways, d.outcomes) };
}

/** Ways to roll exactly `target`. */
export function exactly(d, target) {
  const ways = d.counts.get(target) ?? 0n;
  return { ways, outcomes: d.outcomes, probability: ratio(ways, d.outcomes) };
}

/** BigInt a/b as a float, accurate to ~15 significant digits. */
export function ratio(a, b) {
  if (b === 0n) throw new RangeError('division by zero');
  const SCALE = 10n ** 18n;
  return Number((a * SCALE) / b) / 1e18;
}

/** Mean, standard deviation, min and max. */
export function stats(d) {
  let s1 = 0n, s2 = 0n;
  for (const [x, c] of d.counts) {
    s1 += BigInt(x) * c;
    s2 += BigInt(x) * BigInt(x) * c;
  }
  const mean = ratio(s1, d.outcomes);
  // variance = E[x^2] - E[x]^2, kept in integers until the last step
  const variance = ratio(s2 * d.outcomes - s1 * s1, d.outcomes * d.outcomes);
  const totals = [...d.counts.keys()];
  return { mean, sd: Math.sqrt(variance), min: Math.min(...totals), max: Math.max(...totals) };
}

const TERM = /^(\d*)d(\d+|%)(?:(kh|kl|dh|dl|k)(\d+))?$/i;

/**
 * Parse dice notation into a distribution.
 *
 *   "1d20+5"     "4d6dl1"     "2d20kh1"     "8d6"     "1d8+1d6+3"     "1d20-1d4"
 *
 * kh/k = keep highest, kl = keep lowest, dl = drop lowest, dh = drop highest.
 * Option `roll: 'adv' | 'dis'` turns every plain 1d20 into 2d20kh1 / 2d20kl1.
 */
export function parse(expr, { roll } = {}) {
  const src = String(expr).replace(/\s+/g, '').toLowerCase();
  if (!src) throw new SyntaxError('empty expression');
  const pieces = src.match(/[+-]?[^+-]+/g);
  if (!pieces || pieces.join('') !== src) throw new SyntaxError(`cannot read "${expr}"`);

  let total = constant(0);
  for (const piece of pieces) {
    const sign = piece[0] === '-' ? -1 : 1;
    const body = piece.replace(/^[+-]/, '');
    let d;
    if (/^\d+$/.test(body)) {
      d = constant(Number(body));
    } else {
      const m = body.match(TERM);
      if (!m) throw new SyntaxError(`cannot read "${body}" in "${expr}"`);
      const n = m[1] === '' ? 1 : Number(m[1]);
      const sides = m[2] === '%' ? 100 : Number(m[2]);
      const mod = m[3];
      const k = m[4] === undefined ? undefined : Number(m[4]);
      check(n, sides);
      if (!mod && n === 1 && sides === 20 && roll === 'adv') d = advantage();
      else if (!mod && n === 1 && sides === 20 && roll === 'dis') d = disadvantage();
      else if (!mod) d = dice(n, sides);
      else if (mod === 'kh' || mod === 'k') d = keep(n, sides, k, 'high');
      else if (mod === 'kl') d = keep(n, sides, k, 'low');
      else if (mod === 'dl') d = keep(n, sides, n - k, 'high');
      else if (mod === 'dh') d = keep(n, sides, n - k, 'low');
      if (k > n || (mod && mod[0] === 'd' && k >= n)) throw new RangeError(`"${body}": cannot ${mod} ${k} of ${n} dice`);
    }
    total = add(total, sign < 0 ? negate(d) : d);
  }
  return total;
}
