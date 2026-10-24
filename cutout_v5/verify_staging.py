"""Check the new viewpoint, fast feet, and speech-only jaws over the whole shot."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view
root=Path(__file__).resolve().parent;scene=bpy.context.scene
aim=Vector((1.1,1.55,1.70));up=scene.camera.rotation_euler.to_quaternion()@Vector((0,1,0))
scene.camera.location=aim+Vector((12,-29,21))*1.28-up*.85
names=['Trump','Biden','McConnell','Bernie'];dialogue=json.loads((root/'audio'/'dialogue.json').read_text())
if not scene.get('four_lane_track'):
    dirt=bpy.data.objects['racing dirt'];dirt.dimensions.y=14.7;dirt.location.y=-.15
    for ob in bpy.data.objects['TRACK • moving set'].children:
        if ob.location.y<=-5.5:ob.location.y-=1.5
    scene['four_lane_track']=True
for clip in dialogue['clips']:
    jaw=bpy.data.objects[clip['rider']+' • jaw']
    for layer in jaw.animation_data.action.layers:
        for action_strip in layer.strips:
            for bag in action_strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='CONSTANT'
horses=[bpy.data.objects[f'HORSE {i+1} • root'] for i in range(4)]
bodies=[next(o for o in h.children if o.type=='MESH' and len(o.data.vertices)>3000) for h in horses]
rigs=[next(o for o in h.children if o.type=='ARMATURE') for h in horses]
legs=[ob for ob in scene.objects if 'side' in ob and 'horse_index' in ob]
hat=bpy.data.objects['red cap • throwable root'];head=bpy.data.objects['Trump • head hinge'];hand=bpy.data.objects['Trump • cap grip hand']
anchor=Vector((.015,1.47,.10));grip=Vector((-.38,-.025,.025))
violations=[];clearance=100;cap_error=0;hand_error=0;jaw_error=0;idle_mouth_movements=[]
bounds={n:[1,1,0,0] for n in names};angles=[[],[],[],[]];mitch_pose=set();horse_bounds={n:[1,1,0,0] for n in names}
for frame in range(1,97):
    scene.frame_set(frame);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
    trees=[BVHTree.FromObject(b,graph) for b in bodies]
    for name,body in zip(names,bodies):
        ob=body.evaluated_get(graph)
        for corner in ob.bound_box:
            p=world_to_camera_view(scene,scene.camera,ob.matrix_world@Vector(corner));b=horse_bounds[name]
            b[0]=min(b[0],p.x);b[1]=min(b[1],p.y);b[2]=max(b[2],p.x);b[3]=max(b[3],p.y)
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
    for clip in dialogue['clips']:
        jaw=bpy.data.objects[clip['rider']+' • jaw'];value=clip['envelope'][frame-1]
        expected=-.115*math.sqrt(value) if value else 0
        jaw_error=max(jaw_error,abs(jaw.location.y-expected))
        if value==0 and abs(jaw.location.y)>.00001:idle_mouth_movements.append([clip['rider'],frame,jaw.location.y])
    for i,rig in enumerate(rigs):
        pb=rig.pose.bones['Bone_L'];rest=pb.bone.matrix_local.to_3x3()
        rotation=rest@pb.rotation_quaternion.to_matrix()@rest.inverted()
        angles[i].append(rotation.to_euler('XYZ').y)
    for name in names:
        suffix=' • blank stare face' if name=='McConnell' else ' • masked inauguration face' if name=='Bernie' else ' • face'
        ob=bpy.data.objects[name+suffix]
        for v in ob.data.vertices:
            p=world_to_camera_view(scene,scene.camera,ob.matrix_world@v.co);b=bounds[name]
            b[0]=min(b[0],p.x);b[1]=min(b[1],p.y);b[2]=max(b[2],p.x);b[3]=max(b[3],p.y)
    mitch=bpy.data.objects['McConnell • head hinge'];mitch_pose.add(tuple(round(x,6) for x in (*mitch.location,*mitch.rotation_euler)))
cycles=[sum(a<=0<b for a,b in zip(values,values[1:])) for values in angles]
report={'frames_checked':96,'riders':names,'leg_penetrations':violations,'minimum_leg_clearance_m':clearance,
    'max_cap_anchor_error_m':cap_error,'max_grip_error_m':hand_error,'head_screen_bounds':bounds,
    'mcconnell_unique_local_head_poses':len(mitch_pose),'idle_mouth_movements':idle_mouth_movements,
    'jaw_envelope_max_error_m':jaw_error,'measured_front_leg_positive_cycles':cycles,
    'new_gait_hz':3.6,'previous_gait_hz':1.7,'camera_type':scene.camera.data.type,
    'camera_lens_mm':scene.camera.data.lens,'camera_down_angle_degrees':math.degrees(math.atan2(21,math.hypot(12,29))),
    'resolution':[1600,900],'horse_screen_bounds':horse_bounds,'rider_count':4,'target_field_size':12}
assert not violations and cap_error<.001 and hand_error<.001,report
assert not idle_mouth_movements and jaw_error<.00001 and len(mitch_pose)==1,report
assert all(13<=n<=15 for n in cycles),report
assert all(.02<b[0]<b[2]<.98 and .08<b[1]<b[3]<.91 for b in bounds.values()),report
assert all(.02<b[0]<b[2]<.98 and .10<b[1]<b[3]<.91 for b in horse_bounds.values()),report
(root/'staging_validation.json').write_text(json.dumps(report,indent=2))
scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(root/'streakchat_four_riders.blend'))
for frame,file in [(1,'look_test.png'),(64,'reaction_test.png')]:
    scene.frame_set(frame);scene.render.filepath=str(root/file);bpy.ops.render.render(write_still=True)
print('STAGING_PASSED',json.dumps(report),flush=True)
