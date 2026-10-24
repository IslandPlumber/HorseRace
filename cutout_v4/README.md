# StreakChat — higher race view and faster legs

Open `http://127.0.0.1:8768/cutout_v4/preview.html` while the project’s local preview server is running.

This revision uses a higher three-quarter view inspired by the race footage in [This is... Japan World Cup 3](https://www.youtube.com/watch?v=sdmsRcsl_xA&t=120s). It uses a 70 mm perspective camera aimed downward by approximately 34 degrees, compared with the previous nearly side-on orthographic view. The camera is farther away and shows more track around the three riders. Horse leg animation runs at 3.6 cycles per second, up from 1.7, with separate phases. Rider bounce, the hat throw, and the field remain at their original speed.

Trump says the existing recorded “You’re fired!” excerpt during his hat throw. His jaw now moves only with the recording’s volume envelope, and rests at exactly zero outside that envelope. It uses constant interpolation to avoid motion spilling into silent frames. Biden’s recording starts after Trump finishes, at 2.25 seconds. McConnell’s expression remains still.

`streakchat_race_view.blend` contains packed photo textures and both recorded sounds. It retains the separate reusable rider and horse asset collections. The cap path and hand motion were rebuilt for the new camera-facing photo boards. Use `Open_Blender_Preview.cmd` to open with the tested Vulkan backend on this PC.

`staging_validation.json` checks all 96 frames for rider leg clearance, cap/head and cap/hand alignment, visible heads, speech-only jaw movement, and the measured number of leg cycles. `animation_timing.json` contains actual local render times. Output is four seconds, 1600 × 900, 24 fps; Eevee uses 48 samples, a 128 MB shadow pool, and shadow resolution scale 0.65.

To reproduce: run `prepare_audio.py`, then open `../cutout_v3/streakchat_three_riders.blend` in background Blender with Vulkan and run `build_race_view.py`. Run `verify_staging.py` on the new saved blend, followed by `render_race_view.py`. Use factory-startup Blender for `encode_race_view.py`, then run `validate_outputs.py` with Python.

Sources and recording timings are documented in `CREDITS.md` and `audio/dialogue.json`. The source portraits and source CC0 horse remain preserved under `../cutout_v2/sources/`. No AI video, generated voice, live-site edits, or external publishing were used.
