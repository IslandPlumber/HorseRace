# StreakChat: photo puppet revision

This local revision replaces the first sample's rounded 3D caricatures and toy horses with photographic faces on crude, stiff suit bodies and a textured anatomical horse mesh. Face and jaw are separate pieces. Head angle, jaw movement, and a single rotating arm carry the reaction.

- **look_test.png**: initial still at 1440 × 900.
- **streakchat_cutout_v2.mp4** (also saved as **streakchat_cutout_fixed.mp4**): four-second local motion test, 1280 × 800 at 24 fps.
- **streakchat_cutout_v2.blend**: editable geometry, photo textures, source horse skin/rig, and ordinary keyframes. Textures are packed into the project. Scripts are not required for timeline playback.
- **CREDITS.md**: original source assets, photographers, and source/licensing links.
- **animation_timing.json**: measured timings for this revision.
- **Open_Blender_Preview.cmd**: double-click this in File Explorer to open the scene using Vulkan on this PC, without changing Blender's global preferences.

The original 3D sample is preserved in the parent folder. Nothing connects to or changes the live StreakChat website.

The completed four-second test rendered 96 frames at 1280 × 800, 48 samples, in **130.94 seconds**, averaging **1.361 seconds per frame**, on the RX 6400. All 96 PNGs were checked; MP4 metadata confirms four seconds at 1280 × 800. Browser playback, seeking to the head/jaw reaction, and half-speed playback were verified.

## Rendering on this PC

The still rendered under the usual OpenGL mode. The new animated skin triggered an access violation in the AMD OpenGL driver, `atio6axx.dll`, on the second frame. A three-frame Vulkan check rendered frames 1, 2, and 55 successfully on the RX 6400; the full motion test was then rendered using Vulkan. No driver installation or global Blender preference change was made.

Use Blender's `--gpu-backend vulkan` option for this scene on the tested PC. The renderer is still Eevee. This workaround applies to this scene and driver combination; it is not a claim that the driver problem is resolved generally.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --gpu-backend vulkan .\cutout_v2\streakchat_cutout_v2.blend --python .\cutout_v2\render_cutout.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\cutout_v2\encode_cutout.py
```

These commands are run from the parent Horse Race folder. The Python scripts resolve their own asset/output paths.

## Cap and seating correction

The cap now follows Trump's head through frame 32, with a reaching hand gripping it before release at frame 41. The source includes two connected sleeve controls and a separate hand so the cap is transferred from head to hand before the throw.

The saddle height is measured from the animated horse's back. Each rider now has a fitted blanket, saddle, two legs wrapping around the horse's flanks, and boots in stirrups. The far leg is on the far side of the actual horse mesh. This replaces the earlier flat legs that intersected the body.

`staging_validation.json` records checks across all 96 frames: cap-to-head attachment before the grab, cap-to-hand contact during the hold, and leg clearance from the animated horse surface. The checked leg vertices and face centers have at least 8 cm of clearance. `build_cutout.py` runs the correction script as part of a fresh build.

This remains a look and gag test. Horse motion, body silhouettes, and head cutout edges still need animation/art refinement before a production race. The deliberately rigid suit bodies are part of the intended cutout style.

## Original recorded dialogue

`streakchat_cmon_man.mp4` adds the real “C’mon, man!” excerpt from the YouTube video supplied by the user. It starts at 1.75 seconds, just after the cap release. The cutout jaw follows the excerpt's audio volume, and the caption appears with the line. The voice is a recording, not synthesized speech or a clone.

Both excerpts are also available as standalone files: `audio/cmon_man.wav` and `audio/hairy_legs.wav`. The latter is saved for reuse and is not mixed into this hat-throw gag. `audio/clips.json` records source timestamps. The local preview has separate audio players, and the Blender project contains the packed sound clip.

The dialogue update re-renders only frames 40–81; its additional timing is recorded separately in `dialogue_render_timing.json`. The cap and leg geometry are unchanged by this audio edit.

The video contains an AAC audio track. The decoded mix was checked against the source excerpt and matches it at the intended 1.75-second offset (`audio_validation.json`). A 128 MB shadow pool is now used to avoid allocation failures observed with the larger pool on this PC; affected frames were re-rendered successfully before encoding.
