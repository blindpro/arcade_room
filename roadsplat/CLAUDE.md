# CLAUDE.md — ROADSPLAT!

Audio-first road-crossing / survival game built on the syngen-template.
The player controls a character crossing busy roads while avoiding traffic.

## Controls

All input is read via `engine.input.keyboard` in `src/js/app/screen/game.js`.

| Key | Action |
| --- | --- |
| Arrow keys / WASD | Move the player along the road grid |
| `I` | Announce status (score, health, level) |
| `P` | Toggle pause |
| `Esc` / `Backspace` | Pause (first press); quit to splash screen (second press) |
| `F1` | Read score |
| `F2` | Read health |
| `F3` | Read level and points to next level |
| `F4` | Read current position label |

The splash screen offers a "Return to Games List" button that calls `app.quit()`.

## Screen flow

```
splash → game → gameover → highscores → splash
                  ↘ help / language ↗
```
