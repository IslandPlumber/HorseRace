"""Check fitted legs, original cap contact, and full-shot rider visibility."""
import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view
root=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.eevee.shadow_resolution_scale=.65
names=['Trump','Biden','McConnell']
horses=[bpy.data.objects[f'HORSE {i+1} • root'] for i in range(3)]
bodies=[next(o for o in h.children if o.type=='MESH' and len(o.data.vertices)>3000) for h in horses]
legs=[ob for ob in scene.objects if 'side' in ob and 'horse_index' in ob]
hat=bpy.data.objects['red cap • throwable root']
head=bpy.data.objects['Trump • head hinge'];hand=bpy.data.objects['Trump • cap grip hand']
anchor=Vector((.015,1.47,.10));grip=Vector((-.38,-.025,.025))
violations=[];clearance=100;cap_error=0;hand_error=0
screen_bounds={n:[1,1,0,0] for n in names}
mitch_pose=set()
for frame in range(1,97):
    scene.frame_set(frame);bpy.context.view_layer.update()
    graph=bpy.context.evaluated_depsgraph_get()
    trees=[BVHTree.FromObject(b,graph) for b in bodies]
    for leg in legs:
        side=leg['side'];tree=trees[leg['horse_index']]
        samples=[v.co for v in leg.data.vertices]
        samples += [sum((leg.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices) for p in leg.data.polygons]
        for v in samples:
            p,_,_,_=tree.ray_cast(Vector((v.x,side*3,v.z)),Vector((0,-side,0)))
            if p is not None:
                distance=side*(v.y-p.y);clearance=min(clearance,distance)
                if distance<.015:violations.append([frame,leg.name,distance])
    if frame<=32:cap_error=max(cap_error,(hat.location-head.matrix_world@anchor).length)
    if 32<=frame<=41:hand_error=max(hand_error,(hat.matrix_world@grip-hand.matrix_world.translation).length)
    for name in names:
        ob=bpy.data.objects[name+' • blank stare face' if name=='McConnell' else name+' • face']
        for v in ob.data.vertices:
            p=world_to_camera_view(scene,scene.camera,ob.matrix_world@v.co)
            bounds=screen_bounds[name]
            bounds[0]=min(bounds[0],p.x);bounds[1]=min(bounds[1],p.y)
            bounds[2]=max(bounds[2],p.x);bounds[3]=max(bounds[3],p.y)
    mitch=bpy.data.objects['McConnell • head hinge']
    mitch_pose.add(tuple(round(x,6) for x in (*mitch.location,*mitch.rotation_euler)))
report={'frames_checked':96,'riders':names,'leg_penetrations':violations,
        'minimum_leg_clearance_m':clearance,'max_cap_anchor_error_m':cap_error,
        'max_grip_error_m':hand_error,'head_screen_bounds':screen_bounds,
        'mcconnell_unique_local_head_poses':len(mitch_pose),
        'resolution':[1600,900],'camera_width_m':scene.camera.data.ortho_scale,
        'previous_camera_width_m':11.3,'camera_width_increase_percent':round((14.8/11.3-1)*100,1)}
assert not violations and cap_error<.001 and hand_error<.001,report
assert len(mitch_pose)==1,report
assert all(.02<b[0]<b[2]<.98 and .08<b[1]<b[3]<.90 for b in screen_bounds.values()),report
(root/'staging_validation.json').write_text(json.dumps(report,indent=2))
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'streakchat_three_riders.blend'))
scene.render.filepath=str(root/'look_test.png');bpy.ops.render.render(write_still=True)
scene.frame_set(60);scene.render.filepath=str(root/'reaction_test.png');bpy.ops.render.render(write_still=True)
print('STAGING_PASSED',json.dumps(report),flush=True)
