# StreakChat local Blender sample

This folder is an isolated, local render prototype. It has no deployment code or connection to the live StreakChat site.

The original, stylized 3D assets are modeled with Blender geometry. No generated images or AI video are used. Trump and Biden are caricature placeholders for testing the pipeline, not production likenesses.

## Open the sample

- `streakchat_hat_throw.mp4` — six-second, silent H.264 video, 1280 × 720 at 24 fps.
- `streakchat_two_horse.blend` — editable scene with all meshes, materials, armatures, and baked keyframes. Open it in Blender and press Space to preview the timeline. Camera view is saved in the file.
- `preview.html` — local video player with slow motion and jumps to the interaction. Open this after rendering; its video works directly from disk. The measured-time fields load automatically when served locally.
- `BENCHMARK.md` — measured local render speed and the limits of this test.
- `assets/` — separate animated GLB exports for both riders and both horses, plus the static cap.

## Reuse the Blender assets

The four `ASSET` collections are marked as Blender assets. Append them from the Blender file, or add this folder as an asset library. The two horse rigs and two rider rigs have named bones and keyed actions. Rider rigs are parented to their horse rigs in the shot; detach that parent when using a rider separately.

The cap is an independent prop with a keyed throw root. Interaction markers identify reach, grab, wind-up, release, duck, landing, and finish. Playing the saved scene does not require scripts, downloads, or external textures.

The GLB exports use separate roots with shot-specific travel removed. Riders retain the sample gesture/duck and horses retain the gallop. The cap export has no animation so it can be attached to a hand or animated as a projectile. The source Blender file retains the full interaction.

The meshes use rigid bone weights for compact, toy-style articulation. They are useful prototype assets; production characters would benefit from refined facial sculpting, continuous deformation around joints, improved hand contact, and a more natural gallop with planted hooves.

## Re-render locally

Blender was found at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.

From PowerShell in this folder:

```powershell
.\run_local_sample.ps1 -Preview  # three 720p preview frames
.\run_local_sample.ps1           # 144 frames, MP4, and reusable GLB assets
.\run_local_sample.ps1 -Build    # rebuild original geometry, then render and export
```

`build_sample.py` models the scene. `refine_sample.py` applies the visually reviewed animation/graphics corrections to a fresh build. `render_sample.py` records per-frame render timings. `encode_clip.py` uses Blender's bundled FFmpeg to encode the PNG sequence. `export_assets.py` exports the GLBs without changing the saved Blender project.

The first render after a shader-cache change can take longer. PNG frames are retained in `renders/720p/` so the video can be re-encoded without rendering the scene again. Logs and JSON measurements are local, and nothing publishes or uploads any output.

For the full player, run `python serve_preview.py` and open `http://127.0.0.1:8768/preview.html`. This loopback-only server supports video seeking and is already running for the current preview.
