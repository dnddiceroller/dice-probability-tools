# dice-probability-tools

From the team behind [dnddiceroller.com](https://dnddiceroller.com) · [more from us](https://github.com/dnddiceroller)

Exact odds for tabletop dice. No simulation, no sampling, no rounding until the last step: every count is a whole number of ways out of every possible roll.

- `NdX` and flat modifiers: `8d6`, `1d20+5`, `1d8+1d6+3`, `1d20-1d4`
- Keep and drop: `4d6dl1`, `2d20kh1`, `3d6kl2`, `5d10dh2`
- Advantage and disadvantage: `--adv`, `--dis`
- Chance to meet a DC: `--dc 15`

Zero dependencies. Node 20 or later.

## Try it

```sh
git clone https://github.com/dnddiceroller/dice-probability-tools
cd dice-probability-tools
node bin/dice-prob.js 4d6dl1
```

## The stat roll: 4d6, drop the lowest

```
$ node bin/dice-prob.js 4d6dl1
4d6dl1   mean 12.24   sd 2.85   range 3-18   1296 outcomes

total   exactly   at least
    3     0.08%   100.00%   
    4     0.31%    99.92%   #
    5     0.77%    99.61%   ##
    6     1.62%    98.84%   ####
    7     2.93%    97.22%   #######
    8     4.78%    94.29%   ###########
    9     7.02%    89.51%   ################
   10     9.41%    82.48%   #####################
   11    11.42%    73.07%   ##########################
   12    12.89%    61.65%   #############################
   13    13.27%    48.77%   ##############################
   14    12.35%    35.49%   ############################
   15    10.11%    23.15%   #######################
   16     7.25%    13.04%   ################
   17     4.17%     5.79%   #########
   18     1.62%     1.62%   ####
```

## How much is advantage worth?

```
$ node bin/dice-prob.js 1d20+5 --dc 15
1d20+5   mean 15.50   sd 5.77   range 6-25   20 outcomes
DC 15: 55.00%  (11 of 20)

$ node bin/dice-prob.js 1d20+5 --dc 15 --adv
1d20+5 (advantage)   mean 18.82   sd 4.71   range 6-25   400 outcomes
DC 15: 79.75%  (319 of 400)

$ node bin/dice-prob.js 1d20+5 --dc 15 --dis
1d20+5 (disadvantage)   mean 12.18   sd 4.71   range 6-25   400 outcomes
DC 15: 30.25%  (121 of 400)
```

`--adv` and `--dis` apply to every plain `1d20` in the expression. Write `2d20kh1` yourself if you want to be explicit.

## Fireball

```
$ node bin/dice-prob.js 8d6 --dc 28
8d6   mean 28.00   sd 4.83   range 8-48   1679616 outcomes
DC 28: 54.05%  (907785 of 1679616)
```

Add `--json` for machine-readable output. Counts come out as strings, because big pools pass what a JavaScript number holds exactly.

## As a library

```js
import { parse, atLeast, stats } from './src/index.js';

const stat = parse('4d6dl1');
stats(stat).mean;                                         // 12.2446...
atLeast(stat, 15).probability;                            // 0.2315...
atLeast(parse('1d20+7', { roll: 'adv' }), 18).probability; // 0.75
```

Also exported: `dice(n, sides)`, `keep(n, sides, k, 'high' | 'low')`, `advantage()`, `disadvantage()`, `add`, `negate`, `constant`, `exactly`, `ratio`.

## How keep/drop stays exact

Listing every roll of `10d10kh3` means ten billion rolls. Instead, `keep()` walks the faces from best to worst and decides how many dice land on each face. The first `k` dice placed are the kept ones. Each choice is weighted by a binomial coefficient, which together count every ordered roll exactly once. The tests check this against brute-force enumeration.

## Notation

| Write | Means |
| --- | --- |
| `3d6` | three six-sided dice, summed |
| `d20` | one d20 |
| `d%` | one d100 |
| `4d6dl1` | drop the lowest one |
| `5d10dh2` | drop the highest two |
| `2d20kh1` or `2d20k1` | keep the highest one |
| `3d6kl2` | keep the lowest two |
| `+ 5`, `- 1d4` | add or subtract any term |

## Tests

```sh
node --test
```

## Licence

MIT. Copyright Iron Code Studios.
