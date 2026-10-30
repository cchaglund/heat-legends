# Potential future enhancements

Not part of the first version. Recorded here so the design doesn't close them off.

## Turn order
- **App-driven turn order (alt 2).** Detect every car, humans included, and rank them by race position (space index, then raceline spot first). The app walks you through: "Next: human Yellow… now Green (Legend)". This needs reliable detection of all cars and a "human done" signal.
- **Suggested next Legend (alt 3).** Rank the cars from the last detection and pre-select the Legend most likely to move next. You confirm with one tap. It's cheaper than alt 2 and doesn't take control away from you.
- To keep these possible, the engine should expose `raceOrder(track, board)` from the start, even if the UI doesn't use it.

## Overlay
- Fake-3D arrows: use the pose recovered from the homography to draw arrows standing up from the board.

## Content
- More tracks and expansions (weather and road conditions modifying speed limits).

## Interaction
- Voice output ("Green: diamond space 2 before corner 3").
