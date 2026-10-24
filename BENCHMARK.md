# StreakChat local rendering test

Measured on the user's Windows PC, October 22, 2026. No remote rendering, AI-generated images/video, external model downloads, or live-site changes.

## Result

The six-second, two-horse clip rendered all 144 frames at 1280 × 720 and 24 fps. Rendering took **249.63 seconds (4 minutes 10 seconds)** inside Blender. The Blender process took **252.48 seconds** including opening the file and shutting down. Final MP4 encoding took another **3.87 seconds** inside Blender.

The output is a silent, H.264 MP4, 6.0 seconds long. It shows Trump reaching for his red cap, throwing it across the two lanes, and Biden ducking before the horses cross the finish stripe. Encoding preserves the already-rendered PNG colors without applying the scene's display transform twice.

## PC and settings

| Item | Verified value |
| --- | --- |
| Operating system | Windows 11 Home, 64-bit |
| CPU | AMD Ryzen 5 5600G, 6 cores / 12 threads |
| GPU actually used by Blender | AMD Radeon RX 6400, 4 GB |
| RAM | 8 GB installed; about 7.34 GB usable |
| Blender | 5.2.3 LTS |
| Renderer | Eevee; ray tracing disabled |
| Final settings | 1280 × 720, 64 samples, 24 fps, 144 frames |
| Render process peak working set | 847.5 MB |
| Highest sampled private memory commitment | 2,894.7 MB |

Memory was sampled once per second. The working set is resident process memory; private commitment includes memory that may be paged out. These figures do not measure total system RAM use or dedicated GPU memory. Other desktop apps stayed open during the test. Less than 1 GB of system RAM was available before building the scene.

## Measured timings

| Run | Scope | Time |
| --- | --- | --- |
| 540p, 32 samples | Three reviewed preview frames | 3.71 sec total; median 0.891 sec/frame |
| 720p, 64 samples | Five reviewed preview frames | 9.58 sec total; median 1.698 sec/frame |
| 720p, 64 samples | Full 144-frame render | 249.63 sec total; mean 1.717 sec/frame; median 1.703 sec/frame |
| MP4 encoding | All rendered PNGs | 3.87 sec |

The initial render of the first scene version took 14.5 seconds for its first frame while shaders and resources initialized; subsequent frames in that process took about 0.8 seconds. The final full run used the warmed shader cache, with a 2.64-second first frame. Cold starts and shader/material changes can add setup time.

The full render is about **42 times slower than playback time**. A one-minute race with the same per-frame cost would take approximately **41–42 minutes** to render, plus encoding and startup. This is a proportional estimate, not a measured longer race. More horses, geometry, effects, resolution, or different camera coverage can change the cost substantially. These measurements support rendering a video in advance; they do not establish interactive frame rates or a live streaming pipeline.

## Visual review and reuse

The sample uses original, stylized caricatures and compact toy-like horses. The scene has four named armatures, rigid bone weights, ordinary baked keyframes, named asset collections, an independent cap, and editable course/broadcast graphics. There are no external texture dependencies or scripts required for playback of the saved Blender scene.

Reviewed frames include the opening, cap grab, release, airborne hat/duck, and finish. The first review caught misplaced horse ears and an incorrect ducking axis; both were corrected before the final render. The result establishes the local modeling/rendering pipeline and a consistent cartoon look. It is not production character art. Likeness, hair, hands, joint deformation, and planted-hoof gallop animation need refinement.

Separate GLB exports contain both riders, both horses, and the static cap. The four character/horse exports each contain a skin and an animation. Shot-specific root travel is removed from those exports; the full interaction remains in the Blender project.

All 144 PNGs were checked for readability and 1280 × 720 dimensions. MP4 container metadata confirms 6.0 seconds at 1280 × 720. GLB headers and mesh/skin/animation structures were checked. Detailed evidence is retained in `validation.json`, `hardware.json`, and the benchmark/process JSON files in `renders/`.

Browser playback of the final encoded video was checked, including a seek to the duck at 3.25 seconds and half-speed playback. The local player supports byte ranges so the full six-second video can be scrubbed.

The hat action is a scripted sample animation. This test does not implement game input, winner logic, networking, website integration, or race broadcasting.
