# Heat Legends Helper — the idea

## Problem

In *Heat: Pedal to the Metal* you can add AI drivers, called **Legends**. Running them takes little effort, but it's constant: flip a card, check whether each Legend has passed the Legends Line, count spaces, check whether the target space is full. That's enough to pull you out of your own race.

## Goal

A phone web app that runs the Legends for you:

1. The app **is** the Legends deck. It shuffles and flips the cards digitally, so it never has to read a physical card.
2. You point the phone at the board. The app finds the Legend cars by their color.
3. The app works out each Legend's move and **draws the destination on the camera image**: "Green → here".
4. You move the car and continue.

## Non-goals (for now)

- Running the human players' cars or checking human moves.
- Replacing the physical game (no digital board).
- An app-store app. It's a static web app opened in the phone browser.
- Reading physical Legend cards with the camera.

## Guiding principle

Every milestone should be useful at the table by itself. The vision features are an upgrade on a version that already works with taps. The rules engine and track data are the core. Camera work is a convenience on top.
