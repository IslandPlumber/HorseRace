# StreakChat — wider three-rider local test

Open `http://127.0.0.1:8768/cutout_v3/preview.html` while the project’s local preview server is running.

This extends the approved photo-cutout scene with Mitch McConnell’s September 2026 blank-stare car meme. His face stays fixed on a stiff suit while a third anatomical horse runs. The camera shows 31% more horizontal scene width, the dirt course is wider, and the output is 1600 × 900 at 24 fps. Trump’s attached/grabbed/thrown cap, fitted trousers and boots, and Biden’s actual recorded “C’mon, man!” are preserved.

`streakchat_three_riders.blend` contains packed image textures and the recorded sound. The reusable McConnell puppet and horse are marked as assets in their own collections. Use `Open_Blender_Preview.cmd` to open it on this PC with the tested Vulkan backend. The GPU’s OpenGL driver crashed during earlier rendering, so the launcher selects Vulkan explicitly.

`staging_validation.json` checks all 96 frames for the original cap/head and cap/hand alignment, the three riders’ leg clearance, head visibility, and McConnell’s stationary head pose. `animation_timing.json` contains measured frame render times. Eevee uses 48 samples, a 128 MB shadow pool, and shadow resolution scale 0.65 to fit the wider shot within that pool.

To rebuild: open the previous `../cutout_v2/streakchat_cutout_v2.blend` in background Blender and run `build_wide_race.py`, then run `verify_staging.py` on the saved three-rider scene. Render with `render_wide_race.py`, then use a factory-startup Blender session to run `encode_wide_race.py`. The clip is four seconds long; `audio/cmon_man.wav` starts at 1.75 seconds, after the hat release at frame 41.

Photo and recording credits are in `CREDITS.md`. The new meme is a third-party photo reference retained for this local parody prototype; no public-domain license is asserted for it. No live-site files were modified and no AI video or synthesized voice was used.
