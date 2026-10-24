"""Set final defaults and remove unused rotation channels before asset export."""
import bpy
from pathlib import Path

root=Path(__file__).resolve().parent
for name in ['Trump • rider rig','Biden • rider rig']:
    rig=bpy.data.objects[name]
    action=rig.animation_data.action
    remove_paths={rig.pose.bones[b].path_from_id('rotation_euler') for b in ['spine','head']}
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in list(bag.fcurves):
                    if fc.data_path in remove_paths:bag.fcurves.remove(fc)
scene=bpy.context.scene
scene.render.resolution_x=1280
scene.render.resolution_y=720
scene.eevee.taa_render_samples=64
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'streakchat_two_horse.blend'))
print('PROJECT_FINALIZED',flush=True)
