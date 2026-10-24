"""Refine the first build in place after visual review; also used by build_sample."""
import bpy
import math
from pathlib import Path
from mathutils import Matrix,Vector

ROOT=Path(__file__).resolve().parent
scene=bpy.context.scene
trump=bpy.data.objects['Trump • rider rig']
biden=bpy.data.objects['Biden • rider rig']
horse_a=bpy.data.objects['Chestnut • gallop rig']
hat=bpy.data.objects['CAP • animated throw root']

def world_y(rig,bone,angle):
    pb=rig.pose.bones[bone]
    rest=pb.bone.matrix_local.to_3x3()
    pb.rotation_mode='QUATERNION'
    pb.rotation_quaternion=(rest.inverted() @ Matrix.Rotation(angle,3,'Y') @ rest).to_quaternion()
    return pb

for o in bpy.data.objects:
    if o.name.startswith(('Chestnut ear','Silver ear')):
        o.rotation_euler=(0,0,0)

# UI uses emission for predictable, clean readability in any lighting.
ui=bpy.data.collections['GRAPHICS • broadcast']
cache={}
for o in ui.objects:
    if not hasattr(o.data,'materials'):continue
    for i,old in enumerate(o.data.materials):
        if old.name not in cache:
            m=bpy.data.materials.new(old.name+' • unlit graphics')
            m.diffuse_color=old.diffuse_color
            tree=m.node_tree
            tree.nodes.clear()
            em=tree.nodes.new('ShaderNodeEmission')
            em.inputs['Color'].default_value=old.diffuse_color
            em.inputs['Strength'].default_value=1
            output=tree.nodes.new('ShaderNodeOutputMaterial')
            tree.links.new(em.outputs[0],output.inputs[0])
            cache[old.name]=m
        o.data.materials[i]=cache[old.name]
card=bpy.data.objects['brand pill']
# Resize vertices so bevels remain consistent and overlay depth stays fixed.
for v in card.data.vertices:
    v.co.x*=3.5/2.6
    v.co.y*=1.3/.4
card.location=(-3.46,2.17,-7)

# A compact cue card provides contrast over the dirt.
cue=bpy.data.objects['interaction cue']
new=bpy.data.objects.new('interaction cue backdrop',card.data.copy())
ui.objects.link(new)
new.parent=scene.camera
new.location=(0,-1.95,-7.015)
for v in new.data.vertices:
    v.co.x*=2.5/3.5
    v.co.y*=.4/1.3
bevel=new.modifiers.new('rounded card','BEVEL');bevel.width=.025;bevel.segments=3
for f,hidden in [(1,True),(52,True),(53,False),(92,False),(93,True),(144,True)]:
    new.hide_render=hidden;new.keyframe_insert(data_path='hide_render',frame=f)
    new.hide_viewport=hidden;new.keyframe_insert(data_path='hide_viewport',frame=f)

def mix(a,b,u):return tuple(x+(y-x)*u for x,y in zip(a,b))
def arm_target(f):
    el=(.30,-.41,2.64);hand=(.61,-.31,2.49)
    if f<30:return el,hand
    if f<42:
        u=(f-30)/12;return mix(el,(.08,-.48,3.34),u),mix(hand,(.10,-.28,3.88),u)
    if f<52:
        u=(f-42)/10;return mix((.08,-.48,3.34),(-.32,-.49,3.30),u),mix((.10,-.28,3.88),(-.39,-.24,3.92),u)
    if f<62:
        u=(f-52)/10;return mix((-.32,-.49,3.30),(.24,-.13,3.26),u),mix((-.39,-.24,3.92),(.53,.42,3.66),u)
    if f<85:
        u=(f-62)/23;return mix((.24,-.13,3.26),el,u),mix((.53,.42,3.66),hand,u)
    return el,hand

def exact_arm(rig,el,hand,f):
    sh=Vector((0,-.285,2.94))
    for bone,a,b in [('near_upperarm',sh,Vector(el)),('near_forearm',Vector(el),Vector(hand))]:
        pb=rig.pose.bones[bone]
        direction=b-a
        mat=direction.to_track_quat('Y','Z').to_matrix().to_4x4()
        mat.translation=a
        mat=mat @ Matrix.Diagonal((1,direction.length/pb.bone.length,1,1))
        pb.rotation_mode='QUATERNION'
        pb.matrix=mat
        for path in ['location','rotation_quaternion','scale']:
            pb.keyframe_insert(data_path=path,frame=f)
        bpy.context.view_layer.update()

for f in range(1,145):
    scene.frame_set(f)
    t=(f-1)/24
    for idx,rig in enumerate([trump,biden]):
        phase=t*math.tau*1.8+idx*1.45
        duck=.95*math.exp(-((f-79)/10)**4) if idx==1 else 0
        for bone,ang in [('spine',.045*math.sin(phase+.4)+duck),('head',-.045*math.sin(phase+.4)-duck*.18)]:
            pb=world_y(rig,bone,ang)
            pb.keyframe_insert(data_path='rotation_quaternion',frame=f)
    el,hand=arm_target(f)
    exact_arm(trump,el,hand,f)
    # Reach stays attached to the same cap, then a visible arc crosses Biden.
    if f<42:
        p=Vector((horse_a.location.x+.02,-1.45,4.005+trump.location.z))
        rot=(0,0,0)
    elif f<62:
        p=Vector((horse_a.location.x+hand[0],-1.45+hand[1],hand[2]+.10))
        rot=((f-42)*.04,(f-42)*.03,0)
    elif f<=96:
        u=(f-62)/34
        p=Vector((horse_a.location.x+.53,-1.03,3.76)).lerp(Vector((1.06,2.,1.0)),u)
        p.z+=1.1*4*u*(1-u)
        rot=(u*math.tau*1.5,u*math.tau,u*.8)
    elif f<109:
        u=(f-96)/13;p=Vector((1.06-u*1.1,2.,1*(1-u)+.12));rot=(math.pi*.12,0,u)
    else:
        p=Vector((-.04-(f-109)*3.4/24,2.,.12));rot=(math.pi*.12,0,1)
    hat.location=p;hat.rotation_euler=rot
    hat.keyframe_insert(data_path='location',frame=f);hat.keyframe_insert(data_path='rotation_euler',frame=f)

scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'streakchat_two_horse.blend'))
print('REFINEMENT_DONE',flush=True)
