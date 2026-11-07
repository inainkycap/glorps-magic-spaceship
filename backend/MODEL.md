# The sanctuary model

How `POST /api/sanctuary/simulate` turns a sanctuary into 1,000 possible futures.
Code: `app/sanctuary/`. Tuning: `data/sanctuary.json`.

## One-line pitch

> Every animal is simulated individually, across 1,000 futures: a good dome makes births
> likely and deaths rare, a tiny group struggles to find mates, and a disaster hits
> everyone in one dome at once. That's why the same animals survive more often when you
> split them across domes.

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
births ~ Poisson( b · N · N/(N + A) · 1/(1 + N_dome/C) )
deaths ~ Binomial( N, m )
N      ← N + births − deaths
```

| Term | Meaning | Default |
|---|---|---|
| `b = 0.5 × fit` | Birth rate. A poor fit means fewer births. | |
| `m = 0.12 + 0.5 × (1 − fit)` | Death chance. A poor fit means more deaths. | |
| `N/(N + A)` | **Allee effect**: in a tiny group it's hard to find a mate. | A = 2 |
| `1/(1 + N_dome/C)` | **Crowding**: all species in a dome share its space. | C = 30 |

A population of 0 or 1 is extinct: a single animal can't breed.

## 3. Disasters: why splitting is safer

Each dome, each year, can be hit by:

| Disaster | Chance per year | Each resident dies with |
|---|---|---|
| Dome breach | 0.6 % | 80 % |
| Power failure | 1.5 % | 35 % |
| Meteor strike | 0.3 % | 97 % |
| Disease outbreak | 1.0 % | 55 % |

A disaster hits **every resident of that dome at once** (correlated within a dome) and
never spreads to other domes (independent between domes). Putting all your animals in
one dome is like putting all your money in one stock: the average looks fine, but one
bad event wipes you out. Splitting them is **diversification**, and it shows up in the
worst case.

## 4. What comes back

From the 1,000 runs, after 50 years:

- **Expected species saved**: the average number of species still alive anywhere.
- **Worst case**: the 5th percentile, so 1 run in 20 does this badly or worse. This is
  where diversification shows.
- **Fan chart**: species alive each year (5th/25th/50th/75th/95th percentiles) plus 25
  sample futures.
- **Per species and per dome survival**, and how often each dome had a disaster.

## 5. Engineering notes (for the technical judges)

- **Vectorised**: populations are one numpy array `N[run, dome, species]`, and all 1,000
  futures step forward together. A typical sanctuary takes 20–80 ms.
- **Reproducible**: the random seed is a hash of the request. The same sanctuary always
  gives the same futures, so when the player changes one thing, the difference they see is
  caused by their change, not by luck.
- **Data-driven**: species needs come from `data/species/*.json`, and every rate above comes
  from `data/sanctuary.json`. Adding a species or retuning needs no code change.
- **Tested** (`tests/test_sanctuary.py`): fit matches the frontend formula, splitting
  beats concentrating on the worst case across several seeds, getting a need wrong costs
  at least 20 points of survival, and a harsh dome loses everything.

## Example (10 dodos, one dome, 50 years)

| Dome | Survival |
|---|---|
| Perfect (forest, 24 °C, 75 % humidity) | 90 % |
| 2 °C too cold | 85 % |
| Wrong terrain (grassland) | 57 % |
| 6 °C too cold | 47 % |

| 10 dodos + 10 pigeons | Expected saved | Worst case |
|---|---|---|
| All in one perfect dome | 1.54 | 0 |
| Split 5 + 5 across two perfect domes | 1.77 | 1 |
