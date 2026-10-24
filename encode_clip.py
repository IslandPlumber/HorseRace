"""Encode locally rendered PNGs using Blender's bundled FFmpeg support."""
import bpy
import json
import time
from pathlib import Path

root=Path(__file__).resolve().parent
out=root/'renders'/'720p'
files=[f'frame_{f:04d}.png' for f in range(1,145)]
missing=[f for f in files if not (out/f).exists()]
if missing:
    raise RuntimeError(f'Missing {len(missing)} rendered frames: {missing[:5]}')
scene=bpy.context.scene
scene.render.resolution_x=1280
scene.render.resolution_y=720
scene.render.resolution_percentage=100
scene.render.fps=24
scene.frame_start=1
scene.frame_end=144
# These PNGs already contain the scene's AgX display transform.
# Standard preserves their sRGB appearance instead of applying AgX twice.
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.sequencer_colorspace_settings.name='sRGB'
editor=scene.sequence_editor_create()
strip=editor.strips.new_image('Rendered race',str(out/files[0]),channel=1,frame_start=1)
for f in files[1:]:strip.elements.append(f)
strip.frame_final_duration=144
if hasattr(scene.render.image_settings,'media_type'):
    scene.render.image_settings.media_type='VIDEO'
scene.render.image_settings.file_format='FFMPEG'
scene.render.ffmpeg.format='MPEG4'
scene.render.ffmpeg.codec='H264'
scene.render.ffmpeg.constant_rate_factor='HIGH'
scene.render.ffmpeg.ffmpeg_preset='GOOD'
scene.render.filepath=str(root/'streakchat_hat_throw.mp4')
scene.render.use_sequencer=True
start=time.perf_counter()
bpy.ops.render.render(animation=True)
print('ENCODE_DONE',json.dumps({'seconds':round(time.perf_counter()-start,3),'output':scene.render.filepath}),flush=True)
