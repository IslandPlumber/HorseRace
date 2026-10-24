# Source assets and construction

This is a local StreakChat art-direction revision. It uses photographed faces on separate Blender mesh pieces, rigid suit-body geometry, and a textured anatomical horse. No image generation, AI video, Higgsfield, or live-site changes are involved.

## Horse

- **Lyndon Daniels**, original horse mesh and textures; **ChadM**, supplied skeletal rig.
- Source: [Rigged Horse on OpenGameArt](https://opengameart.org/content/rigged-horse).
- The source page lists **CC0**. The downloaded original is preserved in `../cutout_v2/sources/horse.blend`.
- Local adaptations: normalized scale and orientation, modern Blender material nodes, small-eye/mane/tail bone attachments, gentle subdivision, two coat treatments, plain saddles, and sample leg animation.

## Photographs

- **Donald Trump:** official White House portrait, photographer Daniel Torok. Downloaded from the [White House image file](https://www.whitehouse.gov/wp-content/uploads/2025/06/President-Donald-Trump-Official-Presidential-Portrait.png). [Wikimedia Commons source/licensing record](https://commons.wikimedia.org/wiki/File:President-Donald-Trump-Official-Presidential-Portrait.png).
- **Joe Biden:** official portrait, photographer Adam Schultz. Downloaded from the [archived White House image file](https://bidenwhitehouse.archives.gov/wp-content/uploads/2025/01/biden-profile-31.png), linked by the [archived presidential biography](https://bidenwhitehouse.archives.gov/administration/president-biden/). [Wikimedia Commons source/licensing record](https://commons.wikimedia.org/wiki/File:Joe_Biden_presidential_portrait.jpg).
- The linked licensing records describe the official government photographs as public domain. Original portrait files are preserved in `../cutout_v2/sources/`.
- Face and jaw outlines are Blender geometry with UV coordinates into the original photographs. No raster background-removal or face generation is used. Separate face and jaw pieces can be moved or replaced independently. Photo textures and horse textures are packed into the saved Blender project.

The suit silhouettes, prop cap, track, keyframes, and broadcast graphics were built locally for this prototype. The scene is an obvious cutout parody; it is not footage of an actual event.

## Mitch McConnell — blank stare

- Reference: [Mitch McConnell Blankly Staring In Car, Know Your Meme](https://knowyourmeme.com/memes/mitch-mcconnell-blankly-staring-in-car), entry added September 16, 2026. It identifies the source footage as TMZ / Charlie Cotton, September 14, 2026.
- Downloaded reference image: [KYM entry image](https://i.kym-cdn.com/entries/icons/facebook/000/057/458/Screenshot_2026-09-16_151820.jpg), preserved untouched at `sources/mcconnell_car.jpg`.
- The face is traced with UV-mapped Blender geometry, excluding the image’s meme caption and background. His expression and profile are unchanged; there is no generated face or speaking animation.
- This third-party source is credited separately from the public-domain official portraits and CC0 horse. No public-domain or commercial redistribution license is asserted for the meme photograph.

## Recorded dialogue

- User-supplied source: [Joe Biden: Come On Man (Small Edit), CARBONSLAY](https://www.youtube.com/watch?v=3qUgMGN04wU&t=35s).
- The original English audio track is used, not an automatic translated track, synthetic speech, or a cloned voice.
- `audio/cmon_man.wav`: source 37.34–38.44 seconds; the spoken “C’mon, man!” excerpt, placed at 2.25 seconds in this revision after Trump’s line.
- `../cutout_v2/audio/hairy_legs.wav`: source 38.43–40.30 seconds; the separate “I got hairy legs” excerpt, retained in the previous source folder for reuse.
- Only cropping, mono conversion, volume adjustment, and short edge fades were applied. Timing and voice pitch were preserved. This third-party recording is credited separately from the official portrait photographs and CC0 horse.

### Trump’s hat-throw line

- Source: [You’re fired — Donald Trump Sounds: The Apprentice, 101soundboards](https://www.101soundboards.com/sounds/15922-youre-fired), a sound entry uploaded October 16, 2018.
- The existing recorded MP3 is preserved in `sources/trump_youre_fired.mp3`. The page identifies it as Donald Trump’s line from The Apprentice. The source MP3 is downloaded from the audio URL exposed by that page.
- `audio/youre_fired.wav` is the same 1.343-second recording, converted to mono PCM with volume normalization and 6 ms fades. No pitch or speed change, voice generation, or voice cloning was applied.
- It begins at 0.75 seconds, during the cap reach and throw, and ends at 2.093 seconds. The hat releases at 1.667 seconds; Biden answers at 2.25 seconds. The recording is credited as third-party media, with no public-domain license asserted.

## Camera reference

- [This is... Japan World Cup 3, LetsPlay Community](https://www.youtube.com/watch?v=sdmsRcsl_xA&t=120s): the actual game’s higher three-quarter view of the racing field was inspected as the camera reference. No footage from the game is included in this prototype.
