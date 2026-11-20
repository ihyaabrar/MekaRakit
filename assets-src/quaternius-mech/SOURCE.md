# Animated Mech Pack (Quaternius)

- Source: https://quaternius.com/packs/animatedmech.html (Flat Colors / glTF, March 2021 release)
- License: CC0 1.0 Universal (public domain), see `License.txt`
- Files: `George.gltf`, `Leela.gltf`, `Mike.gltf`, `Stan.gltf`

These are the inputs for `scripts/build-mech-kit.mjs`, which splits each rigged mech into kit parts
(`kits/<id>/kit.json`), part geometry (`public/models/<id>.json`) and box art (`public/art/<id>.png`):

| Kit   | Model  | Detail | Parts |
|-------|--------|--------|-------|
| KR-01 | Leela  | 0      | 14    |
| KR-02 | Stan   | 2      | 20    |
| KR-03 | Mike   | 2      | 23    |
| KR-04 | George | 2      | 40    |

Detail 0 keeps one piece per bone (the beginner kit). Detail 1 splits deep pieces into front and back plates (only where the halves really separate, and the same on both sides); detail 2 also gives each hand a palm and separate fingers.

Rebuild a kit (height 3.4, then the detail level):

    node scripts/build-mech-kit.mjs assets-src/quaternius-mech/Leela.gltf kr-01 KR-01 3.4 0
    node scripts/build-mech-kit.mjs assets-src/quaternius-mech/Stan.gltf kr-02 KR-02 3.4 2
    node scripts/build-mech-kit.mjs assets-src/quaternius-mech/Mike.gltf kr-03 KR-03 3.4 2
    node scripts/build-mech-kit.mjs assets-src/quaternius-mech/George.gltf kr-04 KR-04 3.4 2
