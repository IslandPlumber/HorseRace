import bpy,time,json,statistics,gpu
from pathlib import Path
root=Path(__file__).resolve().parent
out=root/'frames';out.mkdir(exist_ok=True)
scene=bpy.context.scene
scene.render.resolution_x=1600;scene.render.resolution_y=900
scene.eevee.taa_render_samples=48
scene.eevee.shadow_resolution_scale=.65
prop=scene.eevee.bl_rna.properties['shadow_pool_size']
scene.eevee.shadow_pool_size=128 if prop.type=='INT' else '128'
start=time.perf_counter();frames=[]
for frame in range(1,97):
    scene.frame_set(frame);scene.render.filepath=str(out/f'{frame:04d}.png')
    tick=time.perf_counter();bpy.ops.render.render(write_still=True)
    frames.append({'frame':frame,'seconds':round(time.perf_counter()-tick,3)})
    report={'frames':frames,'resolution':[1600,900],'samples':48,'gpu':gpu.platform.renderer_get(),'backend':gpu.platform.backend_type_get(),'total_seconds':round(time.perf_counter()-start,3),'mean_seconds_per_frame':statistics.mean(x['seconds'] for x in frames)}
    (root/'animation_timing.json').write_text(json.dumps(report,indent=2))
    if frame%12==0:print('PROGRESS',frame,flush=True)
print('THREE_RIDERS_RENDERED',flush=True)
