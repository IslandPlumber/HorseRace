"""Fit riders around the animated horse and bake a head/hand-attached cap."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
scene=bpy.context.scene
camera=scene.camera
face_q=camera.rotation_euler.to_quaternion()
materials=bpy.data.materials
people=[]
horses=[]
for idx,name in enumerate(['Trump','Biden']):
    horse=bpy.data.objects[f'HORSE {idx+1} • root']
    body=next(o for o in horse.children if o.type=='MESH' and len(o.data.vertices)>3000)
    rider=bpy.data.objects[name+' • puppet body']
    collection=rider.users_collection[0]
    people.append((name,rider,bpy.data.objects[name+' • head hinge'],bpy.data.objects[name+' • jaw'],collection))
    horses.append((horse,body))

def mesh(name,verts,faces,material,parent,collection):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    ob=bpy.data.objects.new(name,data);collection.objects.link(ob);ob.parent=parent
    data.materials.append(material)
    return ob
def flat(name,points,material,parent,collection,depth=0):
    return mesh(name,[(x,y,depth) for x,y in points],[tuple(range(len(points)))],material,parent,collection)
def empty(name,parent,collection):
    ob=bpy.data.objects.new(name,None);collection.objects.link(ob);ob.parent=parent;return ob
def line(name,points,radius,material,parent,collection):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.bevel_depth=radius;data.bevel_resolution=2
    spline=data.splines.new('POLY');spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):p.co=(*co,1)
    ob=bpy.data.objects.new(name,data);collection.objects.link(ob);ob.parent=parent;data.materials.append(material);return ob
def smooth(u):
    u=max(0,min(1,u));return u*u*(3-2*u)
def lerp(a,b,u):return Vector(a).lerp(Vector(b),u)

# Snapshot the real deformed horse across the entire shot. All fitting uses this
# envelope rather than guessed billboard depth or a single-frame body bounding box.
trees=[[],[]]
seat_x=-.42
roof=[0,0]
for f in range(1,97):
    scene.frame_set(f)
    graph=bpy.context.evaluated_depsgraph_get()
    for idx,(horse,body) in enumerate(horses):
        tree=BVHTree.FromObject(body,graph)
        trees[idx].append(tree)
        for x in [seat_x-.28,seat_x,seat_x+.28]:
            for y in [-.22,0,.22]:
                p,_,_,_=tree.ray_cast(Vector((x,y,4)),Vector((0,0,-1)))
                if p is not None:roof[idx]=max(roof[idx],p.z)
print('HORSE_ENVELOPE_READY',roof,flush=True)

def flank(idx,x,z,side,floor):
    outer=floor
    for tree in trees[idx]:
        p,_,_,_=tree.ray_cast(Vector((x,side*3,z)),Vector((0,-side,0)))
        if p is not None:outer=max(outer,side*p.y+.075)
    return side*outer

leg_objects=[]
for idx,((name,rider,head,jaw,collection),(horse,body)) in enumerate(zip(people,horses)):
    seat_top=roof[idx]+.16
    rider.location=(seat_x,-.04,seat_top+.045)
    # Saddle and blanket used to sit 35 cm inside the horse.
    saddle=next(o for o in horse.children if o.name.startswith('simple leather saddle'))
    saddle.location=(seat_x,0,roof[idx]+.10)
    for v in saddle.data.vertices:
        v.co.x*=.58/.82;v.co.z*=.10/.13
    blanket=next(o for o in horse.children if o.name.startswith('plain saddle blanket'))
    blanket.hide_render=True;blanket.hide_viewport=True
    # Drape the blanket above the highest back surface over the animated shot.
    verts=[]
    xs=[seat_x-.38,seat_x-.19,seat_x,seat_x+.19,seat_x+.38]
    ys=[-.60,-.42,-.22,0,.22,.42,.60]
    for x in xs:
        for y in ys:
            heights=[]
            for tree in trees[idx]:
                p,_,_,_=tree.ray_cast(Vector((x,y,4)),Vector((0,0,-1)))
                if p is not None:heights.append(p.z)
            z=max(heights)+.025 if heights else roof[idx]-.32
            verts.append((x,y,z))
    faces=[]
    for i in range(len(xs)-1):
        for j in range(len(ys)-1):
            a=i*len(ys)+j;faces.append((a,a+1,a+len(ys)+1,a+len(ys)))
    mesh(name+' • fitted saddle blanket',verts,faces,materials['faded red' if idx==0 else 'muted blue'],horse,collection)
    for old in ['trouser leg','boot','back leg','back boot']:
        ob=bpy.data.objects[name+' • '+old];ob.hide_render=True;ob.hide_viewport=True
    # Both thighs start above the saddle, wrap over the flanks, and continue down
    # the outside. The far leg is really on the far side and occludes naturally.
    centers=[(seat_x-.11,seat_top+.045),(seat_x+.06,seat_top-.03),
             (seat_x+.25,seat_top-.25),(seat_x+.30,seat_top-.39),
             (seat_x+.17,seat_top-.66),(seat_x+.025,seat_top-.97)]
    dense=[]
    for a,b in zip(centers,centers[1:]):
        for step in range(5):dense.append(Vector(a).lerp(Vector(b),step/5))
    dense.append(Vector(centers[-1]))
    for side,label in [(-1,'near'),(1,'far')]:
        verts=[]
        for j,c in enumerate(dense):
            tangent=(dense[min(j+1,len(dense)-1)]-dense[max(0,j-1)]).normalized()
            across=Vector((-tangent.y,tangent.x))*.105
            for direction in [-1,1]:
                x,z=c+across*direction
                progress=smooth((seat_top+.06-z)/.40)
                y=flank(idx,x,z,side,.19+.40*progress)
                verts.append((x,y,z))
        faces=[(2*j,2*j+1,2*j+3,2*j+2) for j in range(len(dense)-1)]
        ob=mesh(name+' • fitted '+label+' trouser',verts,faces,materials['cheap navy suit'],horse,collection)
        ob['side']=side;ob['horse_index']=idx;leg_objects.append(ob)
        # Boots sit below the calf, with their toe pointing forward.
        ax,az=centers[-1]
        outline=[(ax-.105,az+.10),(ax+.105,az+.08),(ax+.12,az-.06),
                 (ax+.36,az-.095),(ax+.37,az-.18),(ax-.12,az-.18)]
        bootverts=[(x,flank(idx,x,z,side,.63),z) for x,z in outline]
        boot=mesh(name+' • fitted '+label+' boot',bootverts,[tuple(range(len(bootverts)))],materials['boots and mouth cavity'],horse,collection)
        boot['side']=side;boot['horse_index']=idx;leg_objects.append(boot)
        line(name+' • '+label+' stirrup strap',[(seat_x,side*.34,seat_top-.05),
             (seat_x+.16,side*.64,seat_top-.46),(ax,side*.66,az-.14)],.014,materials['worn leather'],horse,collection)
        line(name+' • '+label+' stirrup',[(ax-.14,side*.67,az+.02),
             (ax-.17,side*.67,az-.21),(ax+.40,side*.67,az-.21),(ax+.40,side*.67,az-.04)],.018,materials['worn leather'],horse,collection)

# Replace the single swiveling silhouette with two connected rigid sleeves and
# a hand. These stay editable and use ordinary transforms, no runtime handlers.
name,rider,head,jaw,collection=people[0]
oldhinge=bpy.data.objects['Trump • throwing arm hinge']
oldhinge.hide_render=True;oldhinge.hide_viewport=True
for ob in oldhinge.children_recursive:ob.hide_render=True;ob.hide_viewport=True
shoulder=Vector((-.23,.69,.13))
upper=empty('Trump • upper arm control',rider,collection)
fore=empty('Trump • forearm control',rider,collection)
hand=empty('Trump • cap grip hand',rider,collection)
flat('Trump • corrected upper sleeve',[(0,-.09),(1,-.085),(1,.085),(0,.10)],materials['cheap navy suit'],upper,collection)
flat('Trump • corrected fore sleeve',[(0,-.085),(1,-.067),(1,.067),(0,.085)],materials['cut paper lapels'],fore,collection)
flat('Trump • corrected shirt cuff',[(-.075,-.075),(.025,-.075),(.025,.075),(-.075,.075)],materials['off white shirt'],hand,collection)
flat('Trump • corrected gripping hand',[(-.015,-.07),(.13,-.065),(.18,-.025),(.16,.065),(.02,.075)],materials['hands'],hand,collection,.008)

def key_pose(ob,f):
    for path in ['location','rotation_euler','scale']:ob.keyframe_insert(data_path=path,frame=f)
def pose_arm(target,f):
    delta=Vector((target.x-shoulder.x,target.y-shoulder.y));distance=delta.length
    length=.76
    if distance>2*length:raise RuntimeError(f'Cap outside arm reach at {f}: {distance}')
    direction=delta.normalized()
    perpendicular=Vector((-direction.y,direction.x))
    # Lower/outward elbow solution in the rest pose, leftward when reaching up.
    elbow2=Vector((shoulder.x,shoulder.y))+direction*(distance/2)-perpendicular*math.sqrt(max(0,length*length-distance*distance/4))
    elbow=Vector((elbow2.x,elbow2.y,(shoulder.z+target.z)/2))
    for ob,a,b in [(upper,shoulder,elbow),(fore,elbow,target)]:
        d=b-a;ob.location=a;ob.rotation_euler=(0,0,math.atan2(d.y,d.x));ob.scale=(math.hypot(d.x,d.y),1,1);key_pose(ob,f)
    hand.location=target;hand.rotation_euler=(0,0,fore.rotation_euler.z);key_pose(hand,f)

hat=bpy.data.objects['red cap • throwable root']
hat.animation_data_clear();hat.parent=None;hat.rotation_mode='QUATERNION';hat.scale=(1.35,1,1)
anchor=Vector((.015,1.47,.10))
grip=Vector((-.38,-.025,.025))
rest_hand=Vector((.53,.39,.13))
grab_local=None;release_pos=None;release_q=None
for f in range(1,97):
    scene.frame_set(f)
    t=(f-1)/24
    # Bow the head slightly to meet the reaching hand while the cap stays on it.
    bow=smooth((f-20)/12)*(1-smooth((f-32)/8))
    reaction=math.exp(-((f-60)/10)**4)
    for idx,(nm,bodyroot,h,j,col) in enumerate(people):
        phase=t*math.tau*1.7+idx*1.1
        h.rotation_euler.z=.07*math.sin(phase*.5)+(-.50*reaction if idx else -.30*bow)
        h.location.y=.83-(.25*reaction if idx else .25*bow)
        h.keyframe_insert(data_path='rotation_euler',frame=f);h.keyframe_insert(data_path='location',frame=f)
        j.location.y=-((.075 if idx else .13)*abs(math.sin(f*.75)))*reaction
        j.keyframe_insert(data_path='location',frame=f)
    bpy.context.view_layer.update()
    if f<=32:
        hat.location=head.matrix_world @ anchor
        hat.rotation_quaternion=head.matrix_world.to_quaternion()
        cap_target=rider.matrix_world.inverted() @ (hat.location+hat.rotation_quaternion @ Vector((grip.x*1.35,grip.y,grip.z)))
        u=smooth((f-20)/12)
        target=rest_hand.lerp(cap_target,u)
        if f==32:
            grab_local=rider.matrix_world.inverted() @ hat.location
            grab_angle=head.rotation_euler.z
    elif f<=41:
        u=smooth((f-32)/9)
        local=grab_local.lerp(Vector((.78,1.68,.165)),u)
        hat.location=rider.matrix_world @ local
        hat.rotation_quaternion=face_q @ Quaternion((0,0,1),grab_angle*(1-u)+.20*u)
        target=rider.matrix_world.inverted() @ (hat.location+hat.rotation_quaternion @ Vector((grip.x*1.35,grip.y,grip.z)))
        if f==41:release_pos=hat.location.copy();release_q=hat.rotation_quaternion.copy()
    elif f<=73:
        u=(f-41)/32
        end=Vector((2.05,3.40,2.8))
        hat.location=release_pos.lerp(end,u);hat.location.z+=1.10*4*u*(1-u)
        hat.rotation_quaternion=release_q @ Quaternion((0,0,1),u*math.tau*1.35)
        target=Vector((.55,1.04,.16)).lerp(rest_hand,smooth((f-42)/14))
    else:
        u=min(1,(f-73)/16)
        hat.location=(2.05-u*.55,3.40,.15+(2.8-.15)*(1-u*u))
        hat.rotation_quaternion=face_q @ Quaternion((0,0,1),u*.4)
        target=rest_hand
    pose_arm(target,f)
    hat.keyframe_insert(data_path='location',frame=f);hat.keyframe_insert(data_path='rotation_quaternion',frame=f)

# Check both problems over every frame using the geometry, not just screenshots.
scene.frame_set(1)
max_cap_error=0;max_hand_error=0;minimum_clearance=100;violations=[]
for f in range(1,97):
    scene.frame_set(f);bpy.context.view_layer.update()
    if f<=32:max_cap_error=max(max_cap_error,(hat.location-head.matrix_world @ anchor).length)
    if 32<=f<=41:
        actual_grip=hat.matrix_world @ grip
        max_hand_error=max(max_hand_error,(actual_grip-hand.matrix_world.translation).length)
    for ob in leg_objects:
        tree=trees[ob['horse_index']][f-1];side=ob['side']
        samples=[v.co for v in ob.data.vertices]
        samples += [sum((ob.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices) for p in ob.data.polygons]
        for v in samples:
            p,_,_,_=tree.ray_cast(Vector((v.x,side*3,v.z)),Vector((0,-side,0)))
            if p is not None:
                clearance=side*(v.y-p.y);minimum_clearance=min(minimum_clearance,clearance)
                if clearance<.015:violations.append({'frame':f,'object':ob.name,'clearance':clearance})
report={'frames_checked':96,'cap_attached_frames':[1,32],
        'max_cap_anchor_error_m':max_cap_error,'hand_contact_frames':[32,41],
        'max_cap_hand_contact_error_m':max_hand_error,
        'minimum_leg_surface_clearance_m':minimum_clearance,'leg_penetrations':violations,
        'saddle_back_height_m':roof}
(ROOT/'staging_validation.json').write_text(json.dumps(report,indent=2))
if max_cap_error>.001 or max_hand_error>.001 or violations:raise RuntimeError(report)
for marker in list(scene.timeline_markers):scene.timeline_markers.remove(marker)
for f,n in [(1,'CAP ON HEAD / LEGS OUTSIDE HORSE'),(21,'REACH'),(32,'GRIP'),(41,'RELEASE'),(60,'BIDEN DUCKS'),(89,'CAP LANDS')]:scene.timeline_markers.new(n,frame=f)
scene.frame_set(1)
scene['staging_revision']='Cap follows head until grip; fitted saddle and outside legs checked across 96 frames.'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'streakchat_cutout_v2.blend'))
print('STAGING_FIXED',json.dumps(report),flush=True)
