"""Render selected frames or the full clip, recording measured per-frame times."""
import bpy
import json
import time
import sys
import statistics
import gpu
from pathlib import Path

ROOT=Path(__file__).resolve().parent
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
mode=args[0] if args else 'preview'
scene=bpy.context.scene
frames=[1,72,81] if mode=='preview' else list(range(1,145))
if mode=='still':frames=[int(args[1]) if len(args)>1 else 72]
if '--720' in args:
    scene.render.resolution_x=1280
    scene.render.resolution_y=720
if '--samples' in args:
    scene.eevee.taa_render_samples=int(args[args.index('--samples')+1])
if '--frames' in args:
    frames=[int(x) for x in args[args.index('--frames')+1].split(',')]
out=ROOT/'renders'/('720p' if '--720' in args else '')
out.mkdir(exist_ok=True)
scene.render.image_settings.file_format='PNG'
scene.render.image_settings.color_mode='RGB'
measurements=[]
start=time.perf_counter()
for frame in frames:
    scene.frame_set(frame)
    scene.render.filepath=str(out/f'frame_{frame:04d}.png')
    frame_start=time.perf_counter()
    bpy.ops.render.render(write_still=True)
    elapsed=time.perf_counter()-frame_start
    measurements.append({'frame':frame,'seconds':round(elapsed,3)})
    report={'mode':mode,'engine':scene.render.engine,'blender':bpy.app.version_string,
        'graphics_device':gpu.platform.renderer_get(),'graphics_vendor':gpu.platform.vendor_get(),
        'resolution':[scene.render.resolution_x,scene.render.resolution_y],
        'samples':scene.eevee.taa_render_samples,'frames':measurements,
        'total_seconds':round(time.perf_counter()-start,3),
        'mean_seconds_per_frame':round(statistics.mean(x['seconds'] for x in measurements),3),
        'median_seconds_per_frame':round(statistics.median(x['seconds'] for x in measurements),3)}
    (out/f'benchmark_{mode}.json').write_text(json.dumps(report,indent=2))
    print('FRAME_MEASURED',json.dumps(measurements[-1]),flush=True)
print('RENDER_DONE',json.dumps(report),flush=True)
