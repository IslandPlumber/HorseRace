"""Local Blender proof: photographic puppet heads, stiff bodies, anatomical horses."""
import bpy,math,random,json,time
from pathlib import Path
from mathutils import Vector,Matrix

ROOT=Path(__file__).resolve().parent
random.seed(21)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.fps=24;scene.frame_start=1;scene.frame_end=96
scene.eevee.taa_render_samples=64;scene.eevee.use_raytracing=False
shadowprop=scene.eevee.bl_rna.properties['shadow_pool_size']
scene.eevee.shadow_pool_size=128 if shadowprop.type=='INT' else '128'
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.world.color=(.26,.29,.32)
scene.render.threads_mode='FIXED';scene.render.threads=6

def col(name):
    c=bpy.data.collections.new(name);scene.collection.children.link(c);return c
ENV=col('SET • dirt track');PEOPLE=col('ASSET • photographic cutout riders');PROP=col('ASSET • hat');LIGHT=col('CAMERA • light');UI=col('GRAPHICS • minimal')
current=ENV
def link(ob):
    for c in list(ob.users_collection):c.objects.unlink(ob)
    current.objects.link(ob);return ob
def mat(name,color,rough=.8,emission=False):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1)
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough
    if emission:
        bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=1
        bs.inputs['Base Color'].default_value=(0,0,0,1)
    return m
NAVY=mat('cheap navy suit',(.035,.048,.065));SUIT=mat('cut paper lapels',(.065,.075,.085));SHIRT=mat('off white shirt',(.78,.77,.70));RED=mat('faded red',(.46,.035,.025));BLUE=mat('muted blue',(.06,.18,.29));SKIN=mat('hands',(.56,.35,.24));BLACK=mat('boots and mouth cavity',(.008,.007,.008));DIRT=mat('worn track',(.25,.18,.11));GRASS=mat('dry infield',(.20,.24,.14));CONCRETE=mat('aged concrete',(.28,.29,.27));RAIL=mat('painted rail',(.57,.56,.49));BROWN=mat('worn leather',(.075,.035,.018));PAPER=mat('graphic cream',(.84,.80,.68),emission=True);INK=mat('graphic ink',(.012,.014,.014),emission=True)
def mesh(name,verts,faces,material,parent=None):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    ob=bpy.data.objects.new(name,data);current.objects.link(ob)
    if material:data.materials.append(material)
    ob.parent=parent;return ob
def poly(name,points,material,parent=None,depth=0):
    return mesh(name,[(x,y,depth) for x,y in points],[tuple(range(len(points)))],material,parent)
def box(name,pos,scale,material,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);ob=bpy.context.object;ob.name=name;ob.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);link(ob);ob.data.materials.append(material)
    if bevel:
        m=ob.modifiers.new('worn edges','BEVEL');m.width=bevel;m.segments=2
        ob.modifiers.new('normals','WEIGHTED_NORMAL')
    return ob
def empty(name,pos,parent=None):
    ob=bpy.data.objects.new(name,None);current.objects.link(ob);ob.parent=parent;ob.location=pos;return ob
def line(name,pts,radius,material,parent=None):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.bevel_depth=radius;data.bevel_resolution=2
    sp=data.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for p,co in zip(sp.bezier_points,pts):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,data);current.objects.link(ob);data.materials.append(material);ob.parent=parent;return ob
def text(name,value,pos,size,material,parent=None,align='LEFT'):
    data=bpy.data.curves.new(name,'FONT');data.body=value;data.size=size;data.align_x=align
    ob=bpy.data.objects.new(name,data);current.objects.link(ob);ob.location=pos;ob.parent=parent;data.materials.append(material);return ob

# Two copies of the same reusable anatomical horse and its weighted skeleton.
with bpy.data.libraries.load(str(ROOT/'horse_asset.blend'),link=False) as (src,dst):dst.collections=src.collections
source=dst.collections[0]
horses=[]
for idx,loc in enumerate([(-.75,-1.55,0),(1.0,1.55,0)]):
    current=col('ASSET • '+('Trump horse' if idx==0 else 'Biden horse'))
    root=empty('HORSE '+str(idx+1)+' • root',loc)
    mapping={}
    for original in source.objects:
        ob=original.copy()
        if original.type=='ARMATURE':ob.data=original.data.copy()
        current.objects.link(ob);ob.parent=root;mapping[original]=ob
    for original,ob in mapping.items():
        for mod in ob.modifiers:
            if mod.type=='ARMATURE':mod.object=mapping[mod.object]
        if idx==1 and ob.type=='MESH' and len(ob.data.vertices)>3000:
            ob.data=ob.data.copy();gray=ob.data.materials[0].copy();gray.name='Horse • weathered gray coat'
            tree=gray.node_tree;bs=tree.nodes.get('Principled BSDF')
            old=next(l.from_socket for l in tree.links if l.to_socket==bs.inputs['Base Color'])
            hue=tree.nodes.new('ShaderNodeHueSaturation');hue.inputs['Saturation'].default_value=.08;hue.inputs['Value'].default_value=1.12
            tree.links.new(old,hue.inputs['Color']);tree.links.new(hue.outputs['Color'],bs.inputs['Base Color']);ob.data.materials[0]=gray
    rig=next(ob for ob in mapping.values() if ob.type=='ARMATURE')
    horses.append((root,rig))
    saddle=box('simple leather saddle',(-.15,0,1.86),(.82,.66,.13),BROWN,.025);saddle.parent=root
    blanket=box('plain saddle blanket',(-.15,0,1.78),(.96,.78,.08),RED if idx==0 else BLUE,.015);blanket.parent=root
    line('leather rein',[(1.5,-.21,2.0),(.78,-.42,1.95),(.15,-.40,2.45)],.014,BROWN,root)

# Camera first: all photo geometry faces this camera and remains separate from the horses.
current=LIGHT
data=bpy.data.cameras.new('Cutout test camera');camera=bpy.data.objects.new('Cutout test camera',data);current.objects.link(camera)
camera.location=(4.2,-19.5,6.25);camera.rotation_euler=(Vector((.05,0,2.2))-camera.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO';data.ortho_scale=11.3;scene.camera=camera
face_orientation=camera.rotation_euler.to_quaternion()
for name,pos,energy,size in [('overcast key',(0,-5,10),1250,9),('stadium fill',(2,5,8),850,8)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size
    ob=bpy.data.objects.new(name,d);current.objects.link(ob);ob.location=pos;ob.rotation_euler=(Vector((0,0,1.8))-ob.location).to_track_quat('-Z','Y').to_euler()

def clip_horizontal(points,seam,upper):
    result=[]
    for a,b in zip(points,points[1:]+points[:1]):
        ina=a[1]<=seam if upper else a[1]>=seam
        inb=b[1]<=seam if upper else b[1]>=seam
        if ina:result.append(a)
        if ina!=inb:
            u=(seam-a[1])/(b[1]-a[1]);result.append((a[0]+u*(b[0]-a[0]),seam))
    return result

outlines={
'Trump':{'ref':(2048,1152),'points':[(970,87),(1103,87),(1220,117),(1284,180),(1307,249),(1304,319),(1274,388),(1281,458),(1252,521),(1235,581),(1225,642),(1197,717),(1149,793),(1089,835),(1030,851),(968,829),(925,786),(890,741),(860,682),(842,624),(821,624),(797,596),(777,554),(753,492),(738,430),(731,357),(716,290),(735,221),(778,164),(836,117),(910,96)],'seam':736,'height':1.60},
'Biden':{'ref':(1270,640),'points':[(631,56),(681,65),(731,90),(756,130),(766,177),(766,217),(778,224),(777,260),(764,291),(753,318),(744,352),(729,382),(705,415),(677,439),(649,455),(617,444),(591,426),(570,407),(551,376),(535,346),(522,312),(510,286),(497,270),(493,235),(500,224),(500,178),(504,135),(525,93),(570,66)],'seam':346,'height':1.53}}

def photo_head(name,root):
    desc=outlines[name];points=desc['points'];rw,rh=desc['ref']
    minx=min(x for x,y in points);maxx=max(x for x,y in points);maxy=max(y for x,y in points);miny=min(y for x,y in points)
    scale=desc['height']/(maxy-miny);cx=(minx+maxx)/2
    image=bpy.data.images.load(str(ROOT/'sources'/(name.lower()+'.png')));image.pack()
    m=bpy.data.materials.new(name+' • original photo, geometric cutout')
    tree=m.node_tree;tree.nodes.clear();tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image
    emit=tree.nodes.new('ShaderNodeEmission');emit.inputs['Strength'].default_value=.85;tree.links.new(tex.outputs['Color'],emit.inputs['Color'])
    output=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(emit.outputs[0],output.inputs['Surface'])
    pivot=empty(name+' • head hinge',(0,.83,.065),root)
    mouth=poly(name+' • black mouth backing',[(-.30,.01),(.30,.01),(.30,.43),(-.30,.43)],BLACK,pivot,.003)
    pieces=[]
    for part,up in [('face',True),('jaw',False)]:
        pts=clip_horizontal(points,desc['seam'],up)
        ob=poly(name+' • '+part,[((x-cx)*scale,(maxy-y)*scale) for x,y in pts],m,pivot,.018 if up else .022)
        uv=ob.data.uv_layers.new(name='original photograph coordinates')
        for polygon in ob.data.polygons:
            for loop in polygon.loop_indices:
                px,py=pts[ob.data.loops[loop].vertex_index];uv.data[loop].uv=(px/rw,1-py/rh)
        solid=ob.modifiers.new('thin cutout board','SOLIDIFY');solid.thickness=.008
        pieces.append(ob)
    pivot['construction']='Unaltered source portrait on separate face and lower-jaw meshes; no AI images.'
    return pivot,pieces[1]

current=PEOPLE
riders=[]
for idx,name in enumerate(['Trump','Biden']):
    # Stiff suit body and boots are separate flat pieces with minimal movement.
    root=empty(name+' • puppet body',(-.24,-.07,1.93),horses[idx][0]);root.rotation_mode='QUATERNION';root.rotation_quaternion=face_orientation
    poly(name+' • rigid suit',[(-.27,-.12),(.22,-.12),(.30,.73),(.18,.88),(-.20,.88),(-.35,.71)],NAVY,root)
    poly(name+' • shirt',[(-.12,.84),(.10,.84),(.08,.43),(-.04,.31)],SHIRT,root,.012)
    poly(name+' • left lapel',[(-.25,.78),(-.10,.87),(-.03,.30),(-.25,.56)],SUIT,root,.017)
    poly(name+' • right lapel',[(.10,.86),(.25,.73),(.12,.49),(-.03,.30)],SUIT,root,.018)
    poly(name+' • tie',[(-.06,.77),(.035,.77),(.08,.20),(.01,.10),(-.07,.20)],RED if idx==0 else BLUE,root,.025)
    poly(name+' • trouser leg',[(-.25,.02),(.07,-.03),(.22,-.39),(.01,-.84),(-.16,-.81),(-.04,-.40),(-.30,-.20)],NAVY,root,.45)
    poly(name+' • boot',[(-.17,-.78),(.03,-.80),(.18,-.92),(.15,-.99),(-.21,-.97)],BLACK,root,.46)
    poly(name+' • back leg',[(.14,-.07),(.32,-.18),(.41,-.57),(.25,-.65),(.08,-.27)],SUIT,root,-.015)
    poly(name+' • back boot',[(.24,-.57),(.42,-.59),(.54,-.71),(.49,-.78),(.23,-.74)],BLACK,root,-.01)
    poly(name+' • rigid rein arm',[(-.26,.73),(-.40,.57),(.08,.29),(.57,.31),(.57,.47),(.09,.46)],NAVY,root,.04)
    poly(name+' • rein hand',[(.50,.32),(.67,.31),(.74,.36),(.69,.45),(.52,.46)],SKIN,root,.047)
    arm=empty(name+' • throwing arm hinge',(-.23,.69,.05),root)
    poly(name+' • arm',[(-.09,.06),(.07,.10),(.47,-.19),(.64,-.15),(.68,-.30),(.43,-.38),(-.12,-.11)],SUIT,arm,.02)
    poly(name+' • other hand',[(.60,-.15),(.77,-.12),(.83,-.19),(.80,-.30),(.66,-.31)],SKIN,arm,.027)
    head,jaw=photo_head(name,root)
    root['animation_design']='stiff torso; head hinge, jaw flap, and one rotating arm'
    riders.append((root,head,jaw,arm))

# A simple paper cap reads like an intentionally cheap prop against the photographs.
current=PROP
hat=empty('red cap • throwable root',(0,0,0));hat.rotation_mode='QUATERNION';hat.rotation_quaternion=face_orientation
poly('cap crown',[(-.37,0),(.35,0),(.30,.24),(.17,.34),(-.14,.35),(-.32,.24)],RED,hat)
poly('cap brim',[(-.37,0),(.35,0),(.65,-.075),(.60,-.14),(-.31,-.08)],RED,hat,.01)
t=text('cap lettering','SC',(-.11,.09,.02),.13,PAPER,hat)

# A muted, slightly grubby course, without colorful toy spectators.
current=ENV
box('ground',(0,0,-.17),(80,45,.3),GRASS)
box('racing dirt',(0,0,-.025),(70,7.8,.13),DIRT)
tree=DIRT.node_tree;bs=tree.nodes.get('Principled BSDF');noise=tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=14
bump=tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.045;tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
for y in [-3.9,3.9]:
    for x in range(-18,22,3):box('weathered rail post',(x,y,.55),(.08,.08,1.1),RAIL,.01)
    for z in [.67,1.02]:box('rail',(0,y,z),(65,.07,.085),RAIL,.01)
for i in range(4):box('empty concrete grandstand',(0,7+i*.7,.15+i*.35),(55,.8,.5+i*.65),CONCRETE,.02)
for x in [-9,-3,3,9]:
    board=box('trackside sign',(x,4.05,.55),(4.5,.10,.71),BLACK,.01)
    lettering=text('track board','STREAKCHAT',(-1.97,-.065,-.08),.29,PAPER)
    lettering.parent=board;lettering.rotation_euler=(math.pi/2,0,0)
for i in range(80):
    x=random.uniform(-15,15);y=random.uniform(-3.7,3.7)
    line('hoof mark',[(x,y,.05),(x+.13,y+.035,.052)],.008,BROWN)
scroll=empty('TRACK • moving set',(0,0,0))
for ob in list(ENV.objects):
    if ob!=scroll and not ob.parent and ob.name not in ['ground','racing dirt']:
        ob.parent=scroll

# Minimal broadcast graphics keep the focus on the actual art test.
current=UI
poly('header card',[(-5.2,2.65),(-1.77,2.65),(-1.77,3.05),(-5.2,3.05)],INK,camera,-7)
text('brand','STREAKCHAT',(-5.02,2.76,-6.98),.27,PAPER,camera)
text('look label','PHOTO CUTOUT TEST', (5.1,2.76,-6.98),.16,PAPER,camera,'RIGHT')
poly('footer card',[(-5.2,-3.12),(5.2,-3.12),(5.2,-2.69),(-5.2,-2.69)],INK,camera,-7)
text('Trump label','01 / TRUMP',(-5.02,-2.99,-6.98),.21,PAPER,camera)
text('Biden label','02 / BIDEN',(-1.65,-2.99,-6.98),.21,PAPER,camera)
text('joke','BAD DECISIONS. FAST HORSES.',(5.02,-2.98,-6.98),.15,PAPER,camera,'RIGHT')

def bone_y(rig,name,angle,f):
    pb=rig.pose.bones[name];rest=pb.bone.matrix_local.to_3x3();pb.rotation_mode='QUATERNION'
    pb.rotation_quaternion=(rest.inverted() @ Matrix.Rotation(angle,3,'Y') @ rest).to_quaternion();pb.keyframe_insert(data_path='rotation_quaternion',frame=f)
for f in range(1,97):
    t=(f-1)/24
    scroll.location.x=-t*3.0;scroll.keyframe_insert(data_path='location',frame=f)
    for idx,((hr,rig),(root,head,jaw,arm)) in enumerate(zip(horses,riders)):
        phase=t*math.tau*1.7+idx*1.1
        hr.location.z=.04*math.sin(phase*2);hr.keyframe_insert(data_path='location',frame=f)
        for side in ['L','R']:
            shift=.75 if side=='R' else 0
            a=phase+shift
            for n,ang in [(f'Bone_{side}',.35*math.sin(a)),(f'Bone_{side}.001',-.5*max(0,math.sin(a+.5))),(f'Bone_{side}.002',.20*math.sin(a)),(f'Bone_{side}.003',.35*math.sin(a+2.5)),(f'Bone_{side}.004',.5*max(0,math.sin(a+2.8))),(f'Bone_{side}.005',-.2*math.sin(a+2.8))]:bone_y(rig,n,ang,f)
        reaction=math.exp(-((f-55)/10)**4)
        head.rotation_euler.z=(.07*math.sin(phase*.5))+(-.50*reaction if idx else .09*reaction)
        head.location.y=.83-(.25*reaction if idx else 0)
        head.keyframe_insert(data_path='rotation_euler',frame=f);head.keyframe_insert(data_path='location',frame=f)
        jaw.location.y=-((.075 if idx else .13)*abs(math.sin(f*.75)))*reaction
        jaw.keyframe_insert(data_path='location',frame=f)
        arm.rotation_euler.z=(1.45*math.exp(-((f-35)/12)**4)) if idx==0 else .03*math.sin(phase)
        arm.keyframe_insert(data_path='rotation_euler',frame=f)
    if f<35:
        hat.location=(-.30,-1.70,3.12);hat.rotation_quaternion=face_orientation
    elif f<71:
        u=(f-35)/36;hat.location=Vector((-.30,-1.70,3.12)).lerp(Vector((1.5,2.1,2.35)),u);hat.location.z+=1.65*4*u*(1-u)
        hat.rotation_quaternion=face_orientation @ Matrix.Rotation(u*math.tau*1.3,4,'Z').to_quaternion()
    else:
        u=(f-71)/25;hat.location=(1.5-u*3,2.1,.12+(1-u)*2.1);hat.rotation_quaternion=face_orientation
    hat.keyframe_insert(data_path='location',frame=f);hat.keyframe_insert(data_path='rotation_quaternion',frame=f)
for f,name in [(1,'STIFF PUPPETS'),(35,'THROW'),(55,'HEAD HINGE / JAW FLAP'),(71,'HAT FALLS')]:scene.timeline_markers.new(name,frame=f)
scene['art_direction']='Photographic cutout faces and hinged jaws; rigid suit bodies; anatomical textured horses.'
scene['media']='Official photo textures on geometric cutout meshes. All motion is ordinary local Blender keyframes.'
import runpy
runpy.run_path(str(ROOT/'fix_staging.py'),run_name='__main__')
if (ROOT/'audio'/'cmon_man.wav').exists():
    runpy.run_path(str(ROOT/'add_recorded_dialogue.py'),run_name='__main__')
scene.frame_set(1)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'streakchat_cutout_v2.blend'))
start=time.perf_counter();scene.render.filepath=str(ROOT/'look_test.png');bpy.ops.render.render(write_still=True)
(ROOT/'look_timing.json').write_text(json.dumps({'frame':55,'seconds':time.perf_counter()-start,'resolution':[1440,900]},indent=2))
print('LOOK_TEST_RENDERED',flush=True)
runpy.run_path(str(ROOT/'finalize_cutout.py'),run_name='__main__')
