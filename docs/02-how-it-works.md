# How it works

## Legends rules (base game)

Source: [legends-module-rules.txt](../legends-module-rules.txt) (rulebook text), [legend-cards.txt](../legend-cards.txt) → [data/legend-cards.json](../data/legend-cards.json), and the example in [legends-example.png](../legends-example.png).

### Cards
- 10 cards. Each card gives every one of the 6 car colors a **Top Speed** (the number in the helmet, 10–19) and a **Diamond** value (0–3).
- Shuffle the deck at setup. When it's empty, shuffle all 10 cards into a new deck.
- **One card per round.** It is revealed when the first Legend is due to move, and every Legend uses it that round.

### Track features the engine needs
- **Corner Line** with a **Speed Limit**.
- **Legends Line**: a golden line some spaces before each Corner Line.
- **Diamond spaces 0–3**: yellow diamonds printed on the track. They mark the 4 spaces right before each Corner Line (0 = the space touching the line).

### Movement (per Legend, when its turn comes up)
- **A. Past the Legends Line** (between it and the next Corner Line): move *Speed Limit + Diamond* spaces. The Legend may clear the corner or not.
- **B. Not past the Legends Line:**
  - if moving *Top Speed* spaces does not cross the next Corner Line → move *Top Speed* spaces;
  - otherwise → move to the diamond space numbered *Diamond* before that Corner Line.
- **Never cross 2 Corner Lines in one move.** If a move would, stop on the first space with a free spot before the second Corner Line.
- **Full spaces (D13).** A car ending on a space with both spots free takes the **raceline** spot. With one free spot, it takes that one. If the space is full, it goes **back** to the first space with a free spot. This applies to every outcome: Top Speed, Speed Limit + Diamond, diamond placement and the two-corners stop.

```
driving direction →
 space index:   ... 40   41   42   43 │ 44 ...
 diamond:            3    2    1    0 │   ← diamonds count DOWN towards the corner
                                      └ Corner Line
 "diamond 2 (41) full → 40 (diamond 3)"
```

The UI and explanation text always say "diamond N" or "space N" explicitly, never just "space 3".

- The signs at the corners show **speed limits**, not corner numbers. France in race order: 5 → 2 → 4 → …
- Legends never slipstream, use Heat or cool down. They count for Adrenaline but get no benefit from it.

### Worked example (from the rulebook image, corner with Speed Limit 3)
| Car | Situation | Card values | Result |
|---|---|---|---|
| Green | past the Legends Line | Diamond 2 | moves 3+2 = 5, clears the corner |
| Red | past the Legends Line | Diamond 1 | moves 3+1 = 4, doesn't clear it |
| Blue | not past the line | Top Speed 18, Diamond 3 | 18 would cross the corner → placed on diamond space 3 |
| Yellow | not past the line | Top Speed 11 | moves 11 |

This example becomes the engine's first test case.

## Turn order: why the app goes one Legend at a time

Cars move one at a time, starting with the leader and working back. Humans and Legends are interleaved. Whether a space is full depends on who has already moved. So the app must **not** compute all Legend moves from one snapshot at the end of the round.

The flow per round (decision D6). **You** drive the turn order, and the app follows:

```
[Next round]        → app marks a new round and flips its card (D39)
For each car, in race order (you know the order; the app doesn't need to):
  human car         → you play it as normal
  Legend car        → tap [Green]
                       app reads Green's position (tap / photo / live) → shows the target → you move the car
```

- One button per Legend. Tapping it again re-shows the move without flipping a new card.
- The card is flipped when the round starts (D39; it used to wait for the first Legend tap). A mistapped [Next round] still costs no card: undo puts it back.
- Undo for the last action: a mistapped [Next round] must not cost a card.
- A race starts in round 1. [Next round] is dashed, with "Red and Yellow still to move" under it, until every Legend has a recorded move this round; then it turns solid. It works either way (e.g. a Legend that is out of the race). A short line above the Legend buttons says what to do (D38, D39).

App-driven turn order (detect all cars and walk you through) is listed in [07-future-enhancements.md](07-future-enhancements.md).

## The three input modes (built in this order)

| Mode | How the app knows where the car is | How the target is shown |
|---|---|---|
| **A. Tap** | You tap the car's spot on a reference image of the track | Highlighted on the reference image |
| **B. Snapshot** | You take a photo, and the app finds the car by its color | Drawn on the frozen photo |
| **C. Hybrid live** | Detection runs **once** on a clean frame when you tap the Legend, as in B | Drawn on the **live** video. Only board alignment runs per frame, so the ring stays on the board as you move the phone and your hand |

All three share the same track model and rules engine. Only the input and the rendering differ.

Fully live detection (cars re-detected every frame) is deliberately **not** planned: hands moving cars would corrupt it, and it costs battery and heat for no gain (D15). If live alignment loses the board, the app falls back to the frozen snapshot from B.

### What must be in view
- The Legend whose turn it is must be visible in the frame.
- Spots outside the frame are **unknown**. If the target space's occupancy is unknown, the app shows the empty-track target plus the hint "if full → first free spot behind" instead of guessing.
- If the target is off-screen, an arrow at the edge of the screen points toward it.

### Laps & finish
v1 doesn't track laps. Movement never depends on the lap, and the finish line isn't a corner. You handle the end of the race yourself. The starting-grid spaces are annotated as normal spaces.
