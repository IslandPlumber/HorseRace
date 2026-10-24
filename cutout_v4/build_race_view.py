"""Higher, wider race view; fast horse feet; only recorded speech drives jaws."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
root=Path(__file__).resolve().parent
scene=bpy.context.scene;scene.frame_set(1)
camera=scene.camera
old_biden=bpy.data.objects['Biden • puppet body'].matrix_world.copy()
old_flight_target=old_biden.inverted()@Vector((2.05,3.40,2.8))

# Three-quarter broadcast view, based on the actual Japan World Cup race footage.
aim=Vector((1.1,1.55,1.70))
camera.location=aim+Vector((12,-29,21))
camera.rotation_euler=(aim-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='PERSP';camera.data.lens=70;camera.data.sensor_width=36
camera.data.sensor_fit='HORIZONTAL';camera.data.clip_end=180
face_q=camera.rotation_euler.to_quaternion()
for name in ['Trump','Biden','McConnell']:
    rider=bpy.data.objects[name+' • puppet body']
    rider.rotation_mode='QUATERNION';rider.rotation_quaternion=face_q
bpy.context.view_layer.update()
flight_target=bpy.data.objects['Biden • puppet body'].matrix_world@old_flight_target

def bone_y(rig,name,angle,frame):
    pb=rig.pose.bones[name];rest=pb.bone.matrix_local.to_3x3()
    pb.rotation_mode='QUATERNION'
    pb.rotation_quaternion=(rest.inverted()@Matrix.Rotation(angle,3,'Y')@rest).to_quaternion()
    pb.keyframe_insert(data_path='rotation_quaternion',frame=frame)

# Separate copied actions let each horse have a different footfall phase.
for idx in range(3):
    horse=bpy.data.objects[f'HORSE {idx+1} • root']
    rig=next(ob for ob in horse.children if ob.type=='ARMATURE')
    rig.animation_data_clear()
    for frame in range(1,97):
        phase=(frame-1)/24*math.tau*3.6+idx*1.1
        for side in ['L','R']:
            a=phase+(.75 if side=='R' else 0)
            values=[(f'Bone_{side}',.35*math.sin(a)),
                (f'Bone_{side}.001',-.5*max(0,math.sin(a+.5))),
                (f'Bone_{side}.002',.20*math.sin(a)),
                (f'Bone_{side}.003',.35*math.sin(a+2.5)),
                (f'Bone_{side}.004',.5*max(0,math.sin(a+2.8))),
                (f'Bone_{side}.005',-.2*math.sin(a+2.8))]
            for name,angle in values:bone_y(rig,name,angle,frame)
    rig['gait_cycles_per_second']=3.6

# Refresh the cap's world-space path after the photo boards turn to the new camera.
rider=bpy.data.objects['Trump • puppet body'];head=bpy.data.objects['Trump • head hinge']
hat=bpy.data.objects['red cap • throwable root'];hat.animation_data_clear()
hat.rotation_mode='QUATERNION';hat.scale=(1.35,1,1)
upper=bpy.data.objects['Trump • upper arm control'];fore=bpy.data.objects['Trump • forearm control'];hand=bpy.data.objects['Trump • cap grip hand']
anchor=Vector((.015,1.47,.10));grip=Vector((-.38,-.025,.025))
shoulder=Vector((-.23,.69,.13));rest_hand=Vector((.53,.39,.13))
def smooth(u):
    u=max(0,min(1,u));return u*u*(3-2*u)
def key_pose(ob,frame):
    for path in ['location','rotation_euler','scale']:ob.keyframe_insert(data_path=path,frame=frame)
def pose_arm(target,frame):
    delta=Vector((target.x-shoulder.x,target.y-shoulder.y));distance=delta.length;length=.76
    assert distance<=2*length,(frame,distance)
    direction=delta.normalized();perpendicular=Vector((-direction.y,direction.x))
    elbow2=Vector((shoulder.x,shoulder.y))+direction*(distance/2)-perpendicular*math.sqrt(max(0,length*length-distance*distance/4))
    elbow=Vector((elbow2.x,elbow2.y,(shoulder.z+target.z)/2))
    for ob,a,b in [(upper,shoulder,elbow),(fore,elbow,target)]:
        d=b-a;ob.location=a;ob.rotation_euler=(0,0,math.atan2(d.y,d.x));ob.scale=(math.hypot(d.x,d.y),1,1);key_pose(ob,frame)
    hand.location=target;hand.rotation_euler=(0,0,fore.rotation_euler.z);key_pose(hand,frame)
for frame in range(1,97):
    scene.frame_set(frame);bpy.context.view_layer.update()
    if frame<=32:
        hat.location=head.matrix_world@anchor;hat.rotation_quaternion=head.matrix_world.to_quaternion()
        cap_target=rider.matrix_world.inverted()@(hat.location+hat.rotation_quaternion@Vector((grip.x*1.35,grip.y,grip.z)))
        target=rest_hand.lerp(cap_target,smooth((frame-20)/12))
        if frame==32:grab_local=rider.matrix_world.inverted()@hat.location;grab_angle=head.rotation_euler.z
    elif frame<=41:
        u=smooth((frame-32)/9);local=grab_local.lerp(Vector((.78,1.68,.165)),u)
        hat.location=rider.matrix_world@local;hat.rotation_quaternion=face_q@Quaternion((0,0,1),grab_angle*(1-u)+.20*u)
        target=rider.matrix_world.inverted()@(hat.location+hat.rotation_quaternion@Vector((grip.x*1.35,grip.y,grip.z)))
        if frame==41:release_pos=hat.location.copy();release_q=hat.rotation_quaternion.copy()
    elif frame<=73:
        u=(frame-41)/32
        hat.location=release_pos.lerp(flight_target,u);hat.location.z+=1.10*4*u*(1-u)
        hat.rotation_quaternion=release_q@Quaternion((0,0,1),u*math.tau*1.35)
        target=Vector((.55,1.04,.16)).lerp(rest_hand,smooth((frame-42)/14))
    else:
        u=min(1,(frame-73)/16)
        hat.location=flight_target.lerp(Vector((1.50,3.40,.15)),u)
        hat.location.z=flight_target.z+(.15-flight_target.z)*u*u
        hat.rotation_quaternion=face_q@Quaternion((0,0,1),u*.4);target=rest_hand
    pose_arm(target,frame)
    hat.keyframe_insert(data_path='location',frame=frame);hat.keyframe_insert(data_path='rotation_quaternion',frame=frame)

dialogue=json.loads((root/'audio'/'dialogue.json').read_text())
editor=scene.sequence_editor_create()
for strip in list(editor.strips):editor.strips.remove(strip)
for clip in dialogue['clips']:
    jaw=bpy.data.objects[clip['rider']+' • jaw'];jaw.animation_data_clear()
    for frame,value in enumerate(clip['envelope'],1):
        jaw.location=(0,-.115*math.sqrt(value) if value else 0,0)
        jaw.keyframe_insert(data_path='location',frame=frame)
    for layer in jaw.animation_data.action.layers:
        for action_strip in layer.strips:
            for bag in action_strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='CONSTANT'
    speech=editor.strips.new_sound(clip['rider']+' • original recorded quote',str(root/'audio'/clip['file']),
        channel=1 if clip['rider']=='Trump' else 2,frame_start=clip['start_frame'])
    speech.volume=1;speech.sound.pack()

# Graphics in camera space stay near the lens so the 3D field cannot occlude them.
ui=bpy.data.collections['GRAPHICS • minimal']
for ob in list(ui.objects):bpy.data.objects.remove(ob,do_unlink=True)
depth=6;scale=(depth*camera.data.sensor_width/camera.data.lens)/18.5
def text(name,value,x,y,size,align='LEFT'):
    data=bpy.data.curves.new(name,'FONT');data.body=value;data.size=size;data.align_x=align
    data.materials.append(bpy.data.materials['graphic cream'])
    ob=bpy.data.objects.new(name,data);ui.objects.link(ob);ob.parent=camera
    ob.location=(x*scale,y*scale,-depth+.004);ob.scale=(scale,scale,scale);return ob
def card(name,x0,y0,x1,y1):
    data=bpy.data.meshes.new(name);data.from_pydata([(x0*scale,y0*scale,-depth),(x1*scale,y0*scale,-depth),
        (x1*scale,y1*scale,-depth),(x0*scale,y1*scale,-depth)],[],[(0,1,2,3)])
    data.materials.append(bpy.data.materials['graphic ink'])
    ob=bpy.data.objects.new(name,data);ui.objects.link(ob);ob.parent=camera;return ob
card('header card',-8.85,4.30,-4.45,4.92)
text('brand','STREAKCHAT',-8.58,4.47,.36)
text('look label','LOCAL / RACE VIEW TEST',8.65,4.50,.23,'RIGHT')
card('footer card',-8.85,-4.97,8.85,-4.30)
text('Trump label','01 / TRUMP',-8.58,-4.73,.29)
text('Biden label','02 / BIDEN',-4.80,-4.73,.29)
text('McConnell label','03 / McCONNELL',-.92,-4.73,.29)
text('joke','BAD DECISIONS. FAST HORSES.',8.55,-4.71,.20,'RIGHT')
for clip in dialogue['clips']:
    caption=text(clip['rider']+' • caption',clip['rider'].upper()+': '+clip['words'],0,-3.82,.36,'CENTER')
    panel=card(clip['rider']+' • caption card',-2.55,-4.00,2.55,-3.43)
    start=clip['start_frame'];end=math.ceil((clip['start_seconds']+clip['duration_seconds'])*24)
    for ob in [caption,panel]:
        for frame,hidden in [(1,True),(start-1,True),(start,False),(end,False),(end+1,True),(96,True)]:
            ob.hide_render=hidden;ob.hide_viewport=hidden
            ob.keyframe_insert(data_path='hide_render',frame=frame);ob.keyframe_insert(data_path='hide_viewport',frame=frame)
scene['race_view_revision']='Higher three-quarter perspective from Japan World Cup reference; 70mm camera; fast 3.6 Hz feet.'
scene['gait_speed_ratio']=3.6/1.7
scene['speech_rule']='Both jaws are driven only by the existing recorded speech envelope; exact rest pose otherwise.'
scene['dialogue_timing']='Trump 0.75 sec; hat release 1.667 sec; Biden reply 2.25 sec.'
for marker in list(scene.timeline_markers):
    if 'CMON' in marker.name:scene.timeline_markers.remove(marker)
scene.timeline_markers.new('TRUMP: YOURE FIRED • ORIGINAL RECORDING',frame=19)
scene.timeline_markers.new('BIDEN: CMON MAN • ORIGINAL RECORDING',frame=55)
scene.render.resolution_x=1600;scene.render.resolution_y=900
scene.render.resolution_percentage=100;scene.render.use_sequencer=False
scene.eevee.shadow_resolution_scale=.65
scene.frame_set(1);bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(root/'streakchat_race_view.blend'))
for frame,file in [(1,'look_test.png'),(41,'throw_test.png'),(64,'reaction_test.png')]:
    scene.frame_set(frame);scene.render.filepath=str(root/file);bpy.ops.render.render(write_still=True)
print('RACE_VIEW_BUILT',flush=True)
