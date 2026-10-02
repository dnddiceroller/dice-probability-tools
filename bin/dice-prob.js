#!/usr/bin/env node
// dice-prob: exact distribution of a dice expression.
//
//   dice-prob 4d6dl1
//   dice-prob 1d20+5 --dc 15 --adv
//   dice-prob 8d6 --json

import { parse, atLeast, stats, ratio } from '../src/index.js';

const HELP = `dice-prob EXPRESSION [--dc N] [--adv | --dis] [--json]

  EXPRESSION   dice notation: 1d20+5, 4d6dl1, 2d20kh1, 1d8+1d6+3, 1d20-1d4
               kh/k keep highest, kl keep lowest, dl drop lowest, dh drop highest
  --dc N       chance the total meets or beats N
  --adv        roll every plain 1d20 with advantage (2d20 keep highest)
  --dis        roll every plain 1d20 with disadvantage (2d20 keep lowest)
  --json       machine-readable output, counts as strings`;

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}

let expr, dc, roll, json = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dc') dc = Number(args[++i]);
  else if (a === '--adv') roll = 'adv';
  else if (a === '--dis') roll = 'dis';
  else if (a === '--json') json = true;
  else if (expr === undefined) expr = a;
  else expr += a;
}

if (dc !== undefined && !Number.isInteger(dc)) {
  console.error('--dc needs a whole number');
  process.exit(1);
}

let dist;
try {
  dist = parse(expr, { roll });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const s = stats(dist);
const pct = (p) => (p * 100).toFixed(2).padStart(6) + '%';
const label = expr + (roll === 'adv' ? ' (advantage)' : roll === 'dis' ? ' (disadvantage)' : '');

if (json) {
  const out = {
    expression: expr,
    roll: roll ?? null,
    outcomes: String(dist.outcomes),
    mean: s.mean, sd: s.sd, min: s.min, max: s.max,
    counts: Object.fromEntries([...dist.counts].map(([t, c]) => [t, String(c)])),
  };
  if (dc !== undefined) {
    const hit = atLeast(dist, dc);
    out.dc = { target: dc, ways: String(hit.ways), probability: hit.probability };
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

console.log(`${label}   mean ${s.mean.toFixed(2)}   sd ${s.sd.toFixed(2)}   range ${s.min}-${s.max}   ${dist.outcomes} outcomes`);

if (dc !== undefined) {
  const hit = atLeast(dist, dc);
  console.log(`DC ${dc}: ${(hit.probability * 100).toFixed(2)}%  (${hit.ways} of ${hit.outcomes})`);
} else {
  let peak = 0;
  for (const c of dist.counts.values()) if (Number(c) > peak) peak = Number(c);
  const width = String(s.max).length > String(s.min).length ? String(s.max).length : String(s.min).length;
  console.log(`\n${'total'.padStart(Math.max(5, width))}   exactly   at least`);
  let remaining = dist.outcomes;
  for (const [t, c] of dist.counts) {
    const p = ratio(c, dist.outcomes);
    const up = ratio(remaining, dist.outcomes);
    const bar = '#'.repeat(Math.round((Number(c) / peak) * 30));
    console.log(`${String(t).padStart(Math.max(5, width))}   ${pct(p)}   ${pct(up)}   ${bar}`);
    remaining -= c;
  }
}
