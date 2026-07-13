/**
 * The car/object table, transcribed from MovieScript.ls `on Generate`.
 * gObject = random(gVariatie) selects 1..gVariatie; each case sets the
 * channel-1/channel-2 sounds and a per-level speed. Collision boxes are the
 * AABB the original sprite.intersects used (w/h from the cast bitmaps, or a
 * typical car footprint for the film-loop members).
 */
content.objects = (() => {
  // Build a speed(level) from an explicit table plus the `otherwise` default.
  function bySpeed(table, otherwise) {
    return (level) => (table[level] != null ? table[level] : otherwise)
  }

  const CARS = {
    1: {id: 1, member: 'carpolice', w: 105, h: 45, sound1: 'auto1', sound2: 'sirene',
      speed: bySpeed({1: 4, 2: 5}, 6)},
    2: {id: 2, member: 'boomcar', w: 105, h: 45, sound1: 'scheurkar', sound2: 'boemcar',
      speed: bySpeed({1: 3, 2: 4, 3: 5}, 6)},
    3: {id: 3, member: 'carspain', w: 103, h: 47, sound1: 'scheurkar', sound2: 'quepasa',
      speed: bySpeed({1: 2, 2: 3, 3: 4, 4: 5}, 6)},
    4: {id: 4, member: 'pick', w: 101, h: 43, sound1: 'auto1', sound2: 'toeter1',
      speed: bySpeed({1: 1, 2: 2, 3: 3, 4: 4, 5: 5}, 6)},
    5: {id: 5, member: 'ghost', w: 80, h: 60, sound1: 'ghosty',
      speed: (_level, rng) => rng(4), // gSpeed = random(4)
      blend: bySpeed({1: 80, 2: 50, 3: 30, 4: 20, 5: 10}, 1)},
    6: {id: 6, member: 'oranjewagen', w: 89, h: 48, sound1: 'pruttelauto', sound2: 'toeter2',
      speed: bySpeed({2: 3, 3: 4, 4: 5}, 6)},
    7: {id: 7, member: 'motor', w: 85, h: 37, sound1: 'motorloop',
      speed: bySpeed({2: 2, 3: 3, 4: 4, 5: 5}, 6)},
    8: {id: 8, member: 'loco', w: 130, h: 50, sound1: 'tjoekbel', sound2: 'treinhorn',
      speed: bySpeed({2: 3, 3: 4, 4: 5}, 6)},
    9: {id: 9, member: 'sandercar', w: 104, h: 47, sound1: 'auto1', sound2: 'toeter1',
      speed: bySpeed({3: 2, 4: 3, 5: 4, 6: 5}, 6)},
    10: {id: 10, member: 'roestauto', w: 109, h: 47, sound1: 'auto1', sound2: 'toeter2',
      speed: bySpeed({3: 1, 4: 2, 5: 3, 6: 4, 7: 5}, 6)},
    11: {id: 11, member: 'rozekar2', w: 107, h: 41, sound1: 'auto1', sound2: 'toeter1',
      speed: bySpeed({3: 3, 4: 4, 5: 5}, 6)},
    12: {id: 12, member: 'vierkantekar', w: 107, h: 41, sound1: 'auto1', sound2: 'toeter2',
      speed: bySpeed({4: 3, 5: 4, 6: 5}, 6)},
    13: {id: 13, member: 'fanfareanim2', w: 100, h: 50, sound1: 'harmonie',
      speed: bySpeed({4: 2, 5: 3, 6: 4, 7: 5}, 6)},
    14: {id: 14, member: 'bootanim', w: 130, h: 55, sound1: 'bootloop', sound2: 'boottoeter',
      speed: bySpeed({4: 2, 5: 3, 6: 4, 7: 5}, 6)},
    15: {id: 15, member: 'ufo', w: 90, h: 50, sound1: 'ufo2', sound2: 'leader',
      speed: bySpeed({5: 2, 6: 3, 7: 4, 8: 5}, 6)},
    16: {id: 16, member: 'sjark', w: 95, h: 45, sound1: 'shark',
      speed: bySpeed({5: 2, 6: 3, 7: 4, 8: 5}, 6)},
    17: {id: 17, member: 'gbusters', w: 100, h: 50, sound1: 'auto1', sound2: 'gbustclip2',
      speed: bySpeed({7: 2, 8: 3, 9: 4, 10: 5, 11: 6}, 1)},
    18: {id: 18, member: 'oliphant', w: 95, h: 55, sound1: 'olistamp', sound2: 'olifant',
      speed: bySpeed({7: 2, 8: 3, 9: 4, 10: 5, 11: 6}, 1)},
    19: {id: 19, member: 'batman', w: 107, h: 49, sound1: 'scheurkar', sound2: 'batmanclip',
      speed: bySpeed({8: 3, 9: 4, 10: 5, 11: 6}, 2)},
    20: {id: 20, member: 'drive02', w: 100, h: 45, sound1: 'driveback01',
      sound2: ['driveleo1', 'driveleo2', 'driveleo3'],
      speed: bySpeed({3: 1, 4: 2, 5: 3}, 4)},
    21: {id: 21, member: 'belcar', w: 105, h: 43, sound1: 'belmobiel', sound2: 'phone',
      speed: (_level, rng) => rng(3) + 2}, // case random(3) of 1:3 2:4 3:5
  }

  // Hidden 999 object: when gObject == 7 and gPlaytime >= 3, random(2) may
  // replace the motorbike with the warthog (olistamp + schetenloop, speed 2);
  // dying to it flips the game into "burp mode" (see game.js).
  const WARTHOG_999 = {
    id: 999, member: 'warthog044', w: 100, h: 45,
    sound1: 'olistamp', sound2: 'schetenloop', speed: () => 2,
  }

  return {CARS, WARTHOG_999}
})()
