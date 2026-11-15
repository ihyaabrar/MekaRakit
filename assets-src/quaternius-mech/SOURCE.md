# Animated Mech Pack (Quaternius)

- Source: https://quaternius.com/packs/animatedmech.html (Flat Colors / glTF, March 2021 release)
- License: CC0 1.0 Universal (public domain), see `License.txt`
- Files: `George.gltf`, `Leela.gltf`, `Mike.gltf`, `Stan.gltf`

These are the inputs for `scripts/build-mech-kit.mjs`, which splits each rigged mech into kit parts
(`kits/<id>/kit.json`), part geometry (`public/models/<id>.json`) and box art (`public/art/<id>.png`):

| Kit   | Model  |
|-------|--------|
| KR-01 | Leela  |
| KR-02 | Stan   |
| KR-03 | Mike   |
| KR-04 | George |

Rebuild a kit:

    node scripts/build-mech-kit.mjs assets-src/quaternius-mech/Leela.gltf kr-01 KR-01
