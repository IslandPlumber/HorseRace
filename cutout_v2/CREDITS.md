# Source assets and construction

This is a local StreakChat art-direction revision. It uses photographed faces on separate Blender mesh pieces, rigid suit-body geometry, and a textured anatomical horse. No image generation, AI video, Higgsfield, or live-site changes are involved.

## Horse

- **Lyndon Daniels**, original horse mesh and textures; **ChadM**, supplied skeletal rig.
- Source: [Rigged Horse on OpenGameArt](https://opengameart.org/content/rigged-horse).
- The source page lists **CC0**. The downloaded original is preserved in `sources/horse.blend`.
- Local adaptations: normalized scale and orientation, modern Blender material nodes, small-eye/mane/tail bone attachments, gentle subdivision, two coat treatments, plain saddles, and sample leg animation.

## Photographs

- **Donald Trump:** official White House portrait, photographer Daniel Torok. Downloaded from the [White House image file](https://www.whitehouse.gov/wp-content/uploads/2025/06/President-Donald-Trump-Official-Presidential-Portrait.png). [Wikimedia Commons source/licensing record](https://commons.wikimedia.org/wiki/File:President-Donald-Trump-Official-Presidential-Portrait.png).
- **Joe Biden:** official portrait, photographer Adam Schultz. Downloaded from the [archived White House image file](https://bidenwhitehouse.archives.gov/wp-content/uploads/2025/01/biden-profile-31.png), linked by the [archived presidential biography](https://bidenwhitehouse.archives.gov/administration/president-biden/). [Wikimedia Commons source/licensing record](https://commons.wikimedia.org/wiki/File:Joe_Biden_presidential_portrait.jpg).
- The linked licensing records describe the official government photographs as public domain. Original files are preserved in `sources/`.
- Face and jaw outlines are Blender geometry with UV coordinates into the original photographs. No raster background-removal or face generation is used. Separate face and jaw pieces can be moved or replaced independently. Photo textures and horse textures are packed into the saved Blender project.

The suit silhouettes, prop cap, track, keyframes, and broadcast graphics were built locally for this prototype. The scene is an obvious cutout parody; it is not footage of an actual event.

## Recorded dialogue

- User-supplied source: [Joe Biden: Come On Man (Small Edit), CARBONSLAY](https://www.youtube.com/watch?v=3qUgMGN04wU&t=35s).
- The original English audio track is used, not an automatic translated track, synthetic speech, or a cloned voice.
- `audio/cmon_man.wav`: source 37.34–38.44 seconds; the spoken “C’mon, man!” excerpt, placed at 1.75 seconds in the local race clip.
- `audio/hairy_legs.wav`: source 38.43–40.30 seconds; the separate “I got hairy legs” excerpt, retained for reuse.
- Only cropping, mono conversion, volume adjustment, and short edge fades were applied. Timing and voice pitch were preserved. This third-party recording is credited separately from the official portrait photographs and CC0 horse.
