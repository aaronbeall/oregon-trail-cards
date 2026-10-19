# Computer travellers

Each traveller in wagon setup has an icon-only Human / Computer selector. Everyone starts human. Control belongs to the traveller, not their portrait; randomizing names/portraits preserves it. Adding a traveller starts them human. Saved journeys and their replay history retain controller settings; older saves default to human.

One person can control all human travellers, or share them with people around the same screen. Any mixture, including an entirely computer-controlled wagon, is supported.

## Strategy

The goal is cooperative: get at least one survivor to Oregon. `Computer.ts` uses a deterministic, explainable heuristic, not a language model or a claim of mathematically optimal play. Each decision returns a reason. It uses visible hands, supplies, conditions, current connection and progress. It never reads the hidden trail or calamity deck order, predicts random rolls, or inspects future history.

The policy, in order:

1. Resolve mandatory phases: rest injuries, attempt river crossings, and take free repair rolls. At death, distribute up to two useful supplies among living companions and return the rest. These phases use the same engine methods as human play.
2. At towns, treat the most urgent non-self-healing condition instead of taking supplies. At forts, or towns without a condition needing care, restock supplies with outstanding remedy needs first and scarce emergency reserves next. Leave if no stock remains.
3. Supply remedies before advancing. Rank wagon-stopping conditions highest, followed by fatal deadlines (using the engine’s actual turns-to-deadline calculation), then repeat-sensitive conditions. Prefer an available contribution; never spend supplies on a broken arm that heals by resting. Respect the engine’s two-living-player rule allowing two supplies per turn.
4. If an urgent remedy is missing, trade two unneeded computer-owned supplies (including other computers’ bags) for the needed supply and immediately reconsider the remedy. Prefer computer-owned payments. If those are insufficient, the browser may propose human-owned payments and show their exact owners, supplies and requested exchange for approval. No supplies move before approval. Declining excludes human supplies from further requests for that turn. Approval covers only the displayed exchange, not future trades. Supplies currently required by any condition are protected from payment. Trading consumes inventory, so this policy cannot loop through free exchanges indefinitely.
5. Rank connected trail plays: fort, town, ordinary road, nonfatal river, deadly river, then calamity. Add a small bonus for leaving a connection playable by the next living traveller. Check both orientations, penalize needless rotation, and strongly prefer a safe final road when it completes the journey. A rotation is its own move; the next decision plays the now-connected card.
6. If the player has already supplied a remedy, finish their supply turn; if no road connects (or the wagon is stopped with no affordable remedy), draw and pass. The engine prevents drawing when a road is available.

Supply values combine base emergency utility with diminished value for party-wide duplicates and bonuses for outstanding remedy requirements. Spare parts, medicine and water have higher reserve values than bullets. Inheritance uses these same values and prioritizes recipients missing a needed supply.

This is a greedy cooperative policy with one-player connection lookahead. It does not perform a full-game search, know future dice/decks, assume humans will cooperate, or guarantee survival. The game remains deliberately unforgiving. Use seeded batches to compare future policies rather than judging a single lucky game.

## Browser cadence

A single scheduler waits until the current control is ready and no GSAP transition is running. It then waits approximately 1.1 seconds before a move and 1.7 seconds before flipping/continuing a result. Animations retain their normal durations. Computer turns use the existing card flights, reveals, rolls, supply movement, history recording and interstitials.

A computer action retains ownership of its reveal sequence even if the engine has already advanced to a human traveller. Death wills belong to the deceased traveller’s controller. Human reveals and human wills never auto-continue. The final game result remains open for the viewer.

Pause/resume is available during computer turns and their interstitials. Automation stops while viewing journeys/statistics/maps, confirming a new journey, or hiding the browser tab. It recomputes from current state when resumed and never queues stale decisions. Reduced-motion mode skips animation, but retains the deliberate AI delays.

## Headless use

```sh
npm run simulate -- --games 100 --players 3 --seed 1
```

The runner prints JSON with wins, losses, action-limit counts, average progress and per-game summaries. Consecutive seeds make runs reproducible. It uses no DOM, storage, browser, network or animation runtime and never changes your saved games.

Reusable API:

```ts
import { chooseComputerMove, applyComputerMove, simulateGame } from './Computer';

const move = chooseComputerMove(game); // read-only; undefined if finished/not started
if (move) applyComputerMove(game, move); // engine validates the action
// Human supplies are excluded by default. To propose them:
const proposed = chooseComputerMove(game, { requestHumanSupplies: true });
// Only after obtaining consent from each human payment owner:
// applyComputerMove(game, proposed, approvedHumanOwnerIndices);

const result = simulateGame({ seed: 42, players: 4, maxActions: 5000 });
// result.state, result.trace [{ turn, player, move }], result.truncated
```

`simulateGame` automatically resolves every phase, including inheritance. An illegal/unsupported decision throws rather than silently skipping it. The action budget reports `truncated: true` instead of calling an unfinished game a loss. The headless adapter refuses human-owned trade payments unless their owners are explicitly approved; all-computer simulations need no approval. The browser dispatches the same chosen moves through its normal action handlers, preserving presentation and recording; the headless adapter calls the same engine methods directly.

Tests cover legal actions, deadline priorities, two-supply remedies, rotations, trades, hidden-deck independence, controller saves, reproducibility, and complete games with two through six travellers.
