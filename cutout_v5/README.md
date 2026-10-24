# StreakChat — Bernie and the planned twelve-rider field

Open `http://127.0.0.1:8768/cutout_v5/preview.html` with the project’s local preview server running. The preview contains the four-rider clip, twelve-horse capacity still, and a casting board.

Bernie is rider four. His inauguration photograph supplies a separate enlarged masked head and a static photo torso showing the actual parka, crossed arms and mittens. The fitted trousers, boots and stirrups remain outside his horse. The horse uses the same 3.6 Hz leg animation with a separate phase and a charcoal coat. His face remains silent and still.

The camera retains the Japan World Cup-inspired angle. It moves back to fit a fourth lane; the near rail and dirt edge move outward so the new horse’s feet stay visible. The cap interaction, Trump/Biden recordings, and speech-only jaw animation are checked over all 96 frames.

- `streakchat_four_riders.blend` / `.mp4`: four reusable horse/rider pairs; four-second video at 1600 × 900 and 24 fps. Textures and dialogue are packed in the blend.
- `field_12_capacity.blend` / `.png`: twelve actual horses, four built riders and eight numbered open saddles, with full-height photo-head space reserved. A layout test, not twelve finished characters.
- `ROSTER.md` / `roster.json`: proposed mixed field of twelve. Eight proposed characters have not been built or voiced.
- `staging_validation.json`: all-frame cap, hand, leg, horse framing, face framing and silent-jaw checks.
- `capacity_validation.json`: twelve-horse bounds, future-rider bounds and measured still-render time.
- `animation_timing.json` / `validation.json`: measured render timing and encoded-video/recorded-audio checks.

Use `Open_Blender_Preview.cmd` for the tested Vulkan backend. To rebuild, open `../cutout_v4/streakchat_race_view.blend` in background Blender with Vulkan and run `build_four_riders.py`. Run `verify_staging.py` on the four-rider blend, then `build_capacity_test.py` for the separate twelve-horse layout. Render the four-rider file with `render_four_riders.py`, encode using factory-startup Blender and `encode_four_riders.py`, and validate using Python `validate_outputs.py`.

Credits are in `CREDITS.md`. No live StreakChat changes, generated video, generated voices or external publishing were used.
