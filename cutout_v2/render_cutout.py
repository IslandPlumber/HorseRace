import bpy,time,json,statistics,sys,gpu
from pathlib import Path

root=Path(__file__).resolve().parent
check='--check' in sys.argv
dialogue='--dialogue' in sys.argv
repair='--repair' in sys.argv
out=root/('frames_check' if check else 'frames');out.mkdir(exist_ok=True)
scene=bpy.context.scene
scene.render.resolution_x=1280;scene.render.resolution_y=800
scene.eevee.taa_render_samples=48
prop=scene.eevee.bl_rna.properties['shadow_pool_size']
scene.eevee.shadow_pool_size=128 if prop.type=='INT' else '128'
start=time.perf_counter();frames=[]
for frame in ([42,44,53,65,68,71] if repair else [1,32,41,60,89] if check else range(40,82) if dialogue else range(1,97)):
    scene.frame_set(frame);scene.render.filepath=str(out/f'{frame:04d}.png')
    tick=time.perf_counter();bpy.ops.render.render(write_still=True)
    frames.append({'frame':frame,'seconds':round(time.perf_counter()-tick,3)})
    report={'frames':frames,'resolution':[1280,800],'samples':48,'gpu':gpu.platform.renderer_get(),'backend':gpu.platform.backend_type_get(),'total_seconds':round(time.perf_counter()-start,3),'mean_seconds_per_frame':statistics.mean(x['seconds'] for x in frames)}
    (root/('repair_render_timing.json' if repair else 'render_check.json' if check else 'dialogue_render_timing.json' if dialogue else 'animation_timing.json')).write_text(json.dumps(report,indent=2))
    if frame%12==0:print('PROGRESS',frame,flush=True)
print('CUTOUT_RENDERED',flush=True)
