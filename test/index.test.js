import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dice, keep, parse, atLeast, exactly, stats, advantage, disadvantage } from '../src/index.js';

// Brute force: list every ordered roll. Only for small cases, as a referee.
function brute(n, sides, score) {
  const counts = new Map();
  const roll = new Array(n).fill(1);
  for (;;) {
    const t = score([...roll]);
    counts.set(t, (counts.get(t) ?? 0n) + 1n);
    let i = 0;
    while (i < n && roll[i] === sides) roll[i++] = 1;
    if (i === n) break;
    roll[i]++;
  }
  return new Map([...counts].sort((a, b) => a[0] - b[0]));
}
const sum = (r) => r.reduce((a, b) => a + b, 0);
const keepHigh = (k) => (r) => sum(r.sort((a, b) => b - a).slice(0, k));
const keepLow = (k) => (r) => sum(r.sort((a, b) => a - b).slice(0, k));

test('1d6 is flat', () => {
  const d = dice(1, 6);
  assert.equal(d.outcomes, 6n);
  for (let f = 1; f <= 6; f++) assert.equal(d.counts.get(f), 1n);
});

test('2d6: 7 is the most common total, 6 ways in 36', () => {
  const d = dice(2, 6);
  assert.equal(d.outcomes, 36n);
  assert.equal(d.counts.get(7), 6n);
  assert.equal(d.counts.get(2), 1n);
  assert.equal(d.counts.get(12), 1n);
});

test('NdX matches brute force', () => {
  for (const [n, s] of [[3, 6], [2, 8], [4, 4], [3, 10]]) {
    assert.deepEqual(dice(n, s).counts, brute(n, s, sum), `${n}d${s}`);
  }
});

test('keep highest / lowest match brute force', () => {
  for (const [n, s, k] of [[4, 6, 3], [3, 6, 1], [5, 4, 2], [3, 8, 2]]) {
    assert.deepEqual(keep(n, s, k, 'high').counts, brute(n, s, keepHigh(k)), `${n}d${s}kh${k}`);
    assert.deepEqual(keep(n, s, k, 'low').counts, brute(n, s, keepLow(k)), `${n}d${s}kl${k}`);
  }
});

test('4d6 drop lowest: known exact values', () => {
  const d = parse('4d6dl1');
  assert.equal(d.outcomes, 1296n);
  assert.equal(d.counts.get(18), 21n);
  assert.equal(d.counts.get(3), 1n);
  assert.equal(d.counts.get(13), 172n);
  assert.ok(Math.abs(stats(d).mean - 15869 / 1296) < 1e-12);
});

test('advantage and disadvantage on a d20', () => {
  // P(adv >= t) = 1 - ((t-1)/20)^2 ; P(dis >= t) = ((21-t)/20)^2
  for (let t = 1; t <= 20; t++) {
    assert.equal(atLeast(advantage(), t).ways, 400n - BigInt((t - 1) ** 2));
    assert.equal(atLeast(disadvantage(), t).ways, BigInt((21 - t) ** 2));
  }
  assert.equal(exactly(advantage(), 20).ways, 39n);
  assert.ok(Math.abs(stats(advantage()).mean - 13.825) < 1e-12);
});

test('--adv flag rewrites plain 1d20 only', () => {
  assert.deepEqual(parse('1d20+5', { roll: 'adv' }).counts, parse('2d20kh1+5').counts);
  assert.deepEqual(parse('d20', { roll: 'dis' }).counts, parse('2d20kl1').counts);
  assert.deepEqual(parse('2d20kh1', { roll: 'dis' }).counts, parse('2d20kh1').counts);
  assert.deepEqual(parse('1d8', { roll: 'adv' }).counts, parse('1d8').counts);
});

test('DC check: 1d20+5 vs DC 15 is 55%', () => {
  const hit = atLeast(parse('1d20+5'), 15);
  assert.equal(hit.ways, 11n);
  assert.equal(hit.probability, 0.55);
});

test('mixed expressions and subtraction', () => {
  const d = parse('1d8 + 1d6 + 3');
  assert.equal(d.outcomes, 48n);
  assert.equal(stats(d).min, 5);
  assert.equal(stats(d).max, 17);
  assert.ok(Math.abs(stats(d).mean - 11) < 1e-12);

  const e = parse('1d20-1d4');
  assert.equal(stats(e).min, -3);
  assert.equal(stats(e).max, 19);
});

test('d% is a d100', () => {
  assert.deepEqual(parse('d%').counts, dice(1, 100).counts);
});

test('big pools stay exact', () => {
  const d = parse('20d20');
  assert.equal(d.outcomes, 20n ** 20n); // past 2^53, still exact
  let total = 0n;
  for (const c of d.counts.values()) total += c;
  assert.equal(total, d.outcomes);
  assert.equal(d.counts.get(20), 1n);
  assert.ok(Math.abs(stats(d).mean - 210) < 1e-9);
});

test('bad input is refused', () => {
  assert.throws(() => parse(''), SyntaxError);
  assert.throws(() => parse('2x6'), SyntaxError);
  assert.throws(() => parse('3d6kh4'), RangeError);
  assert.throws(() => parse('3d6dl3'), RangeError);
  assert.throws(() => parse('0d6'), RangeError);
});
