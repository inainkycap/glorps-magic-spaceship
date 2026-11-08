# The sanctuary model

How the backend turns a sanctuary into possible futures:
- **Forecast** (`POST /api/sanctuary/simulate`): 1,000 futures over 50 years, summarised.
- **Advance** (`POST /api/sanctuary/advance`): one future actually happens over 10 years,
  with a report of what struck where, how lucky it was, and the Zorps it earned.

Code: `app/sanctuary/`. Tuning: `data/sanctuary.json` and `data/economy.json`.

## One-line pitch

> Every animal is simulated individually, across 1,000 futures: a good dome makes births
> likely and deaths rare, a tiny group struggles to find mates, a crowded dome breeds
> disease, and a disaster hits everyone in one dome at once. That's why the same animals
> survive more often when you split them across domes.

## 1. Fit: how well a dome suits a species (0 to 1)

For each need the species has data for:

- **Terrain**: 1 if the dome's terrain is one the species lists, otherwise 0.4.
- **Temperature, humidity, oxygen, pressure**: 1 inside the species' ideal range. Outside
  it, fit falls off as a bell curve, `exp(-(distance / tolerance)²)`, with tolerances of
  6 °C, 15 % humidity, 2 % oxygen and 10 kPa.

The overall fit is the **geometric mean** of these, so one badly wrong need drags the
whole score down. The frontend's fit bars use the same formula, so what the player sees
is what the sim uses.

## 2. Each year, in each dome, for each species

Animals are whole numbers: no 3.4 dodos.

```
births ~ Poisson( b · N · N/(N + A) · max(0, 1 − T/K) )
deaths ~ Binomial( N, m )
N      ← N + births − deaths      (then trimmed back to K if the dome is over capacity)
```

| Term | Meaning | Default |
|---|---|---|
| `b = 0.5 × fit` | Birth rate. A poor fit means fewer births. | |
| `m = 0.12 + 0.5 × (1 − fit)` | Death chance. A poor fit means more deaths. | |
| `N/(N + A)` | **Allee effect**: in a tiny group it's hard to find a mate. | A = 2 |
| `max(0, 1 − T/K)` | **Crowding**: T = every animal in the dome, K = its capacity, which all species share. | K = 60 (players upgrade to 200) |

A population of 0 or 1 is extinct: a single animal can't breed.

## 3. Disasters: why splitting is safer

Each dome, each year, can be hit by:

| Disaster | Chance per year | Each resident dies with |
|---|---|---|
| Dome breach | 0.6 % | 80 % |
| Power failure | 1.5 % | 35 % |
| Meteor strike | 0.3 % | 97 % |

A disaster hits **every resident of that dome at once** (correlated within a dome) and
never spreads to other domes (independent between domes).

**Disease is an outbreak that lingers.** In a dome without one, an outbreak starts with a
1 % yearly chance, rising once the dome is over 80 % full, up to 5 % when it's packed.
It lasts 3 to 5 years and kills 20 % of every species in the dome each year while it
runs (about half of them in all). Animals moved out of an infected dome may carry it:
each one starts an outbreak in its new dome with a 15 % chance.

Putting all your animals in one dome is like putting all your money in one stock: the
average looks fine, but one bad event wipes you out. Splitting them is
**diversification**, and it shows up in the worst case.

## 4. What comes back

**Forecast**, from 1,000 runs over 50 years:
- **Expected species saved**: the average number of species still alive anywhere.
- **Worst case**: the 5th percentile, so 1 run in 20 does this badly or worse. This is
  where diversification shows.
- **Survival curves**: for each species, the share of futures in which it's alive, year by
  year; plus the fan chart of species alive (5th–95th percentiles) and 25 sample futures.
- **Per dome survival**, how often each dome had a disaster or outbreak, and the Zorps the
  survivors would earn.

**Advance**, one future over 10 years:
- The new population of every dome (it replaces the old one in the player's save).
- Every event: which disaster struck which dome in which year, and how many of each
  species it killed (an outbreak is reported once, with its whole toll).
- Any outbreak still running at the end, so it carries into the next decade.
- **Luck**: the share of 500 possible futures that ended no better than this one.
- **Zorps earned**: each species with at least 2 animals alive pays 0.5 Zorps per animal,
  times its era multiplier (×1 today, up to ×5 for 2,000 BC).

## 5. Why Monte Carlo, not just "the average"?

A toy example. One dome; each decade a meteor has a **10 % chance of killing every
animal in it**; look 5 decades ahead.

| | "Average it out": lose 10 % of the animals each decade | What really happens: all or nothing |
|---|---|---|
| One dome | 100 → 59 dodos left; "they survive" | survive only if no meteor 5 times: 0.9⁵ = **59 % chance**, **41 % extinct** |
| Split over two domes | still 59 % of the dodos: **splitting changes nothing** | extinct only if **both** domes are hit: 0.41² ≈ 17 %, so **83 % survive** |

Averaging turns an all-or-nothing event into a gentle trickle, so a species can never go
extinct, and the benefit of diversification disappears. It lives entirely in the unlucky
futures. With births, crowding, mate-finding, multi-year outbreaks and several domes and
species, there is no formula for those probabilities, so the backend plays the sanctuary
forward 1,000 times with real random events and counts what happens.

The same comparison on the real model (10 dodos + 10 pigeons, 50 years):

| | Expected values run once | Monte Carlo |
|---|---|---|
| All in one dome | both survive, ~21 animals each | each dies out in ~1 in 3 futures; worst case 0 species |
| Split over two domes | both survive, ~41 each | each dies out in ~1 in 7; worst case 1 species |

**Forecast vs Advance** is a weather forecast vs the weather: a forecast ("70 % chance of
rain") needs many possible futures; living through the decade is a single roll of the
dice. Advance simulates 500 futures only to say how lucky the one that happened was.

## 6. Engineering notes (for the technical judges)

- **Vectorised**: populations are one numpy array `N[run, dome, species]`, and all futures
  step forward together. A forecast of 6 domes × 4 species takes about 0.3 s; an advance
  about 30 ms.
- **Reproducible forecasts**: the random seed is a hash of the sanctuary (order-independent).
  The same sanctuary always gives the same forecast, so when the player changes one thing,
  the difference they see is caused by their change, not by luck. Advances use a fresh
  future every time.
- **Untrusted input is cleaned, not rejected**: counts are clamped to each dome's capacity,
  conditions to the control-panel ranges, and unknown species are dropped.
- **Data-driven**: species needs come from `data/species/*.json`, and every rate above comes
  from `data/sanctuary.json`. Adding a species or retuning needs no code change.
- **Tested** (`tests/`): fit matches the frontend formula; splitting beats concentrating
  on the worst case; getting a need wrong costs at least 20 points of survival; a dome
  never exceeds its capacity; a crowded dome gets more outbreaks; outbreaks linger and
  carry over; moved animals sometimes spread them; luck is a fraction in [0, 1]; the
  Zorps paid follow the payout rule.

## Examples (50-year forecast, capacity 60)

| 10 dodos in one dome | Survival |
|---|---|
| Perfect (forest, 24 °C, 75 % humidity) | 86 % |
| 2 °C too cold | 84 % |
| Wrong terrain (grassland) | 65 % |
| 6 °C too cold | 60 % |

| 10 dodos + 10 pigeons | Expected saved | Worst case |
|---|---|---|
| All in one perfect dome | 1.37 | 0 |
| The same dome upgraded to capacity 120 | 1.63 | 0 |
| Split 5 + 5 across two perfect domes | 1.74 | **1** |

More capacity raises the average, but only splitting protects the worst case.
