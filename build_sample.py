"""Original deterministic Blender geometry, armatures, and keyed animation.

Run with Blender --background --factory-startup --python build_sample.py.
No network, image generation, external asset downloads, or site integration.
"""
import bpy
import math
import json
import os
import random
import time
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'renders'
OUT.mkdir(exist_ok=True)
random.seed(23)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name != 'Collection':
        bpy.data.collections.remove(c)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 144
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.film_transparent = False
scene.render.threads_mode = 'FIXED'
scene.render.threads = 6
scene.render.fps_base = 1
scene.render.image_settings.compression = 20
scene.eevee.taa_render_samples = 32
scene.eevee.use_raytracing = False
scene.world.color = (0.22, 0.30, 0.40)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.filepath = str(OUT / 'frame_')

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

ENV = collection('SET • racecourse')
TRUMP = collection('ASSET • Trump rider')
BIDEN = collection('ASSET • Biden rider')
HORSE_A = collection('ASSET • chestnut horse')
HORSE_B = collection('ASSET • gray horse')
PROPS = collection('PROPS • throwable cap')
UI = collection('GRAPHICS • broadcast')
LIGHT = collection('CAMERA & lighting')
current = ENV

def move(obj):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    current.objects.link(obj)
    return obj

def material(name, color, roughness=.5, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metallic
    return m

M = {}
colors = {
    'navy':(.022,.045,.11), 'suit_blue':(.055,.11,.22),
    'red':(.68,.025,.035), 'blue':(.025,.22,.70),
    'ivory':(.91,.90,.81), 'white':(.96,.98,1),
    'skin_trump':(.79,.39,.20), 'skin_biden':(.80,.60,.48),
    'skin_t_shade':(.57,.24,.12), 'skin_b_shade':(.55,.35,.26),
    'blond':(.82,.55,.15), 'hair_light':(.98,.77,.34),
    'silver':(.72,.78,.79), 'hair_white':(.93,.96,.94),
    'mouth':(.19,.055,.035), 'lip':(.57,.28,.21),
    'iris_blue':(.06,.28,.42), 'black':(.008,.012,.018),
    'chestnut':(.32,.105,.035), 'chestnut_light':(.48,.20,.07),
    'chestnut_dark':(.15,.035,.016), 'gray':(.46,.53,.57),
    'gray_light':(.62,.69,.71), 'gray_dark':(.18,.22,.26),
    'leather':(.045,.022,.013), 'hoof':(.032,.028,.027),
    'gold':(.88,.59,.17), 'track':(.33,.18,.09),
    'track_light':(.49,.30,.16), 'grass':(.12,.29,.16),
    'grass_light':(.24,.43,.20), 'teal':(.015,.28,.26),
    'pink':(.87,.24,.38), 'yellow':(.97,.70,.17),
}
for name, col in colors.items():
    M[name] = material(name, col, .42 if 'skin' in name else .58,
                       .65 if name == 'gold' else 0)
M['black'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.25

def finish(obj, name, mat):
    obj.name=name
    if mat:
        obj.data.materials.append(M[mat] if isinstance(mat,str) else mat)
    if obj.type == 'MESH':
        for p in obj.data.polygons:
            p.use_smooth=True
    return move(obj)

def ell(name, pos, scale, mat, seg=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=pos)
    o=bpy.context.object
    o.scale=scale
    return finish(o,name,mat)

def box(name, pos, scale, mat, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o=bpy.context.object
    o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat)
    if bevel:
        mod=o.modifiers.new('rounded edges','BEVEL')
        mod.width=bevel
        mod.segments=3
        o.modifiers.new('weighted normals','WEIGHTED_NORMAL')
    return o

def rod(name,a,b,radius,mat,radius2=None,vertices=12):
    a,b=Vector(a),Vector(b)
    mid=(a+b)/2
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius,
        radius2=radius if radius2 is None else radius2,depth=(a-b).length,location=mid)
    o=bpy.context.object
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat)

def curve(name, pts, radius, mat):
    cu=bpy.data.curves.new(name,'CURVE')
    cu.dimensions='3D'
    cu.resolution_u=10
    cu.bevel_depth=radius
    cu.bevel_resolution=3
    spl=cu.splines.new('BEZIER')
    spl.bezier_points.add(len(pts)-1)
    for p,co in zip(spl.bezier_points,pts):
        p.co=co
        p.handle_left_type=p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,cu)
    current.objects.link(o)
    cu.materials.append(M[mat])
    return o

def mesh(name, verts, faces, mat):
    me=bpy.data.meshes.new(name)
    me.from_pydata(verts,[],faces)
    me.update()
    o=bpy.data.objects.new(name,me)
    current.objects.link(o)
    return finish(o,name,mat)

def text(name, value, size, pos, mat, rotation=(0,0,0), parent=None, align='CENTER'):
    cu=bpy.data.curves.new(name,'FONT')
    cu.body=value
    cu.align_x=align
    cu.align_y='CENTER'
    cu.size=size
    cu.extrude=.001
    cu.bevel_depth=.0004
    o=bpy.data.objects.new(name,cu)
    current.objects.link(o)
    cu.materials.append(M[mat])
    o.location=pos
    o.rotation_euler=rotation
    o.parent=parent
    return o

def armature(name, bones):
    data=bpy.data.armatures.new(name)
    rig=bpy.data.objects.new(name,data)
    current.objects.link(rig)
    bpy.context.view_layer.objects.active=rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for n,h,t,p in bones:
        b=data.edit_bones.new(n)
        b.head=h
        b.tail=t
        if p:
            b.parent=data.edit_bones[p]
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.select_set(False)
    rig.show_in_front=True
    return rig

def bind(obj, rig, bone):
    # Rigid weights are deliberate: small, editable toy-style articulation.
    if obj.type != 'MESH':
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH')
        obj=bpy.context.object
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis=Matrix.Identity(4)
    obj.parent=rig
    group=obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    mod=obj.modifiers.new('rig • '+bone,'ARMATURE')
    mod.object=rig
    return obj

def horse(name, col, coat, lightcoat, darkcoat, lane, lead, number):
    global current
    current=col
    bones=[('body',(0,0,1.45),(.5,0,1.45),None),
        ('neck',(.65,0,1.7),(1.11,0,2.3),'body'),
        ('head',(1.11,0,2.3),(1.65,0,2.35),'neck'),
        ('tail',(-1.05,0,1.6),(-1.7,0,1.2),'body')]
    legs=[]
    for fore,x in [('front',.78),('rear',-.8)]:
        for side,y in [('near',-.29),('far',.29)]:
            key=fore+'_'+side
            h=(x,y,1.33)
            k=(x+(.02 if fore=='front' else -.12),y,.69)
            f=(x+.07,y,.18)
            bones.extend([(key+'_upper',h,k,'body'),(key+'_lower',k,f,key+'_upper'),
                          (key+'_hoof',f,(f[0]+.14,y,.09),key+'_lower')])
            legs.append((key,h,k,f,fore,side))
    rig=armature(name+' • gallop rig',bones)
    rig.location=(lead,lane,0)
    rig['asset_role']='reusable horse with rigid weighted limbs'
    rig['animation']='24-frame gallop repeated across 144-frame sample'
    def e(n,p,s,m,b='body'):
        return bind(ell(name+' '+n,p,s,m),rig,b)
    def c(n,p,r,m,b='body'):
        return bind(curve(name+' '+n,p,r,m),rig,b)
    e('barrel',(0,0,1.46),(1.13,.40,.49),coat)
    e('rump',(-.73,0,1.52),(.54,.43,.49),coat)
    e('shoulder',(.66,0,1.55),(.48,.44,.57),lightcoat)
    e('belly',(-.05,0,1.25),(.72,.35,.25),coat)
    # Lofted tapered neck avoids a stack-of-spheres silhouette.
    rings=[(.57,1.52,.35,.38),(.79,1.82,.30,.33),(1.0,2.17,.23,.28),(1.13,2.38,.19,.23)]
    vs=[]
    for x,z,rx,ry in rings:
        for j in range(20):
            a=j*math.tau/20
            vs.append((x+rx*math.cos(a),ry*math.sin(a),z))
    fs=[]
    for i in range(len(rings)-1):
        for j in range(20):
            fs.append((i*20+j,i*20+(j+1)%20,(i+1)*20+(j+1)%20,(i+1)*20+j))
    fs.extend([tuple(reversed(range(20))),tuple(range(60,80))])
    bind(mesh(name+' sculpted neck',vs,fs,coat),rig,'neck')
    e('face',(1.25,0,2.43),(.42,.21,.31),lightcoat,'head')
    e('long muzzle',(1.59,0,2.28),(.35,.20,.19),coat,'head')
    e('soft nose',(1.80,0,2.27),(.16,.20,.16),darkcoat,'head')
    for sy in [-1,1]:
        e('nostril',(1.84,sy*.176,2.30),(.065,.023,.044),'black','head')
        e('eye socket',(1.30,sy*.192,2.50),(.105,.025,.086),darkcoat,'head')
        e('eye',(1.33,sy*.213,2.50),(.060,.018,.059),'black','head')
        e('eye glint',(1.35,sy*.229,2.525),(.016,.008,.017),'white','head')
        ear=e('ear',(1.04,sy*.15,2.78),(.095,.068,.235),coat,'head')
        e('inner ear',(1.09,sy*.15,2.80),(.04,.043,.14),darkcoat,'head')
        c('cheek strap',[(1.03,sy*.232,2.59),(1.35,sy*.239,2.32),(1.68,sy*.208,2.22)],.025,'leather','head')
        c('noseband',[(1.64,sy*.20,2.40),(1.7,sy*.216,2.28),(1.67,sy*.18,2.14)],.025,'leather','head')
        e('bit ring',(1.59,sy*.223,2.19),(.056,.017,.056),'gold','head')
        c('reins',[(1.59,sy*.23,2.19),(1.05,sy*.43,2.12),(.58,sy*.35,2.49)],.014,'leather')
    # Blaze, mane, and tail provide recognizable horse silhouettes.
    e('white blaze',(1.48,-.005,2.57),(.19,.07,.065),'ivory','head')
    for i in range(10):
        z=1.77+i*.075
        x=.56+(z-1.77)*.6
        e('mane lock',(x-.11,-.005,z),(.18,.095,.14),darkcoat,'neck')
    for sy in [-.055,0,.055]:
        c('tail flow',[(-1.0,sy,1.67),(-1.40,sy,1.48),(-1.72,sy,1.07),(-1.93,sy,.99)],.075,darkcoat,'tail')
    for key,h,k,f,fore,side in legs:
        bind(rod(name+' '+key+' upper',h,k,.12,coat,.075),rig,key+'_upper')
        e(key+' knee',k,(.10,.095,.11),lightcoat,key+'_lower')
        bind(rod(name+' '+key+' shin',k,f,.065,coat,.05),rig,key+'_lower')
        e(key+' sock',(f[0],f[1],.28),(.065,.07,.16),'ivory',key+'_lower')
        bind(box(name+' '+key+' hoof',(f[0]+.035,f[1],.12),(.25,.17,.17),'hoof',.05),rig,key+'_hoof')
    saddlecolor='red' if number==1 else 'blue'
    e('saddlecloth',(-.13,0,1.90),(.66,.49,.12),saddlecolor)
    bind(box(name+' saddle',(-.23,0,2.02),(.73,.65,.14),'leather',.09),rig,'body')
    for sy in [-1,1]:
        plaque=text(name+' number',str(number),.33,(-.30,sy*.47,1.77),'white',
                    (math.pi/2 if sy==-1 else -math.pi/2,0,0))
        bind(plaque,rig,'body')
        c('girth',[(0,sy*.4,1.84),(.06,sy*.41,1.4),(.07,sy*.25,1.08)],.028,'leather')
    return rig,legs

horse_a,legs_a=horse('Chestnut',HORSE_A,'chestnut','chestnut_light','chestnut_dark',-1.45,-.55,1)
horse_b,legs_b=horse('Silver',HORSE_B,'gray','gray_light','gray_dark',1.45,.65,2)

def rider(name,col,skin,skinshade,hair,tie,horse):
    global current
    current=col
    # The rest pose faces +X, matching the horses. Bones are exposed for reuse.
    bones=[('hips',(-.23,0,2.16),(-.12,0,2.42),None),
           ('spine',(-.12,0,2.42),(.02,0,3.03),'hips'),
           ('head',(.02,0,3.03),(.02,0,3.65),'spine')]
    armpts={}
    for s,sy in [('near',-1),('far',1)]:
        sh=(.0,sy*.285,2.94)
        el=(.30,sy*.41,2.64)
        hand=(.61,sy*.31,2.49)
        armpts[s]=(sh,el,hand)
        bones.extend([(s+'_upperarm',sh,el,'spine'),(s+'_forearm',el,hand,s+'_upperarm')])
        hip=(-.23,sy*.22,2.2)
        knee=(.15,sy*.50,1.81)
        foot=(-.13,sy*.56,1.36)
        bones.extend([(s+'_thigh',hip,knee,'hips'),(s+'_shin',knee,foot,s+'_thigh')])
    rig=armature(name+' • rider rig',bones)
    rig.parent=horse
    rig['asset_role']='original stylized caricature; reusable keyed armature'
    def e(n,p,s,m,b='spine'):
        return bind(ell(name+' '+n,p,s,m),rig,b)
    def c(n,p,r,m,b='head'):
        return bind(curve(name+' '+n,p,r,m),rig,b)
    # Tailored jacket, shirt, lapels, tie, and a tiny lapel pin.
    torso=e('jacket',(-.11,0,2.67),(.28,.34,.43),'navy')
    e('white shirt',(.137,0,2.79),(.08,.145,.25),'white')
    for sy in [-1,1]:
        lapel=mesh(name+' jacket lapel',[(.22,sy*.05,2.64),(.16,sy*.19,2.99),(.20,sy*.08,2.95)],[(0,1,2)],'suit_blue')
        bind(lapel,rig,'spine')
        e('collar',(.18,sy*.075,2.98),(.06,.06,.055),'white')
    tieobj=mesh(name+' necktie',[(.224,-.038,2.92),(.224,.038,2.92),(.25,.052,2.66),(.25,0,2.60),(.25,-.052,2.66)],[(0,1,2,3,4)],tie)
    bind(tieobj,rig,'spine')
    e('tie knot',(.23,0,2.92),(.027,.043,.047),tie)
    e('lapel pin',(.17,-.21,2.91),(.03,.023,.024),'gold')
    e('neck',(.02,0,3.09),(.13,.13,.17),skin,'head')
    # Expressive head, cheeks, chin, protruding nose and ears, all original meshes.
    is_t=name=='Trump'
    hx=.045
    face=e('head sculpt',(hx,0,3.50),(.32 if is_t else .29,.32 if is_t else .29,.44 if is_t else .46),skin,'head')
    e('jaw',(.10,0,3.30),(.25,.26,.19),skin,'head')
    e('chin',(.295,0,3.26),(.095,.13,.09),skin,'head')
    for sy in [-1,1]:
        e('ear',(-.02,sy*.303,3.48),(.09,.058,.14),skin,'head')
        e('ear fold',(.015,sy*.347,3.49),(.038,.014,.075),skinshade,'head')
        e('cheek',(.25,sy*.17,3.43),(.105,.13,.13),skin,'head')
        e('lower eyelid',(.31,sy*.134,3.52),(.037,.102,.062),skinshade,'head')
        e('eye white',(.328,sy*.139,3.56),(.035,.086,.056),'white','head')
        e('iris',(.359,sy*.139,3.559),(.016,.036,.040),'iris_blue','head')
        e('pupil',(.372,sy*.139,3.56),(.008,.018,.026),'black','head')
        e('eye sparkle',(.380,sy*.151,3.575),(.006,.008,.009),'white','head')
        browpts=[(.325,sy*.06,3.65),(.34,sy*.14,3.68 if is_t else 3.66),(.295,sy*.23,3.64)]
        c('eyebrow',browpts,.027 if is_t else .024,hair)
        c('smile fold',[(.35,sy*.12,3.43),(.348,sy*.17,3.36),(.30,sy*.18,3.31)],.007,skinshade)
    e('nose bridge',(.34,0,3.53),(.092,.064,.14),skin,'head')
    e('nose tip',(.416,0,3.46),(.092,.087,.073),skin,'head')
    for sy in [-1,1]:
        e('nose wing',(.37,sy*.065,3.44),(.05,.04,.035),skin,'head')
        e('nostril',(.399,sy*.05,3.421),(.012,.024,.012),skinshade,'head')
    if is_t:
        c('mouth',[(.347,-.105,3.334),(.377,-.035,3.32),(.381,.03,3.32),(.347,.10,3.334)],.012,'mouth')
        e('lower lip',(.366,0,3.302),(.024,.077,.019),'lip','head')
    else:
        e('smile',(.351,0,3.338),(.028,.13,.049),'mouth','head')
        e('teeth',(.376,0,3.352),(.012,.104,.022),'ivory','head')
        c('lip edge',[(.345,-.12,3.33),(.371,0,3.304),(.345,.12,3.33)],.009,'lip')
    for dz,w in [(0,.17),(.048,.14)]:
        c('forehead crease',[(.295,-w,3.746+dz),(.32,0,3.76+dz),(.295,w,3.746+dz)],.0045,skinshade)
    if is_t:
        e('hair crown',(-.025,0,3.83),(.33,.32,.18),'blond','head')
        # Swept comb-over locks follow a common volume.
        for i in range(9):
            y=-.25+i*.06
            c('swept blond lock',[(-.26,y,3.84),(-.06,y-.015,4.0),(.19,y+.01,3.97),(.31,y+.025,3.85)],.036,'hair_light' if i%3==0 else 'blond')
        for sy in [-1,1]:
            e('sideburn',(-.03,sy*.28,3.67),(.16,.05,.17),'blond','head')
    else:
        # Receding silver hairline, side hair, and sparse swept wisps.
        e('back hair',(-.19,0,3.64),(.14,.28,.30),'silver','head')
        for sy in [-1,1]:
            e('silver temple',(-.05,sy*.268,3.67),(.19,.055,.22),'hair_white','head')
        for i in range(7):
            y=-.20+i*.067
            c('silver wisp',[(-.23,y,3.83),(-.14,y,3.95),(.015,y+.02,3.945),(.10,y+.025,3.91)],.019,'hair_white')
    for side,(sh,el,hand) in armpts.items():
        e(side+' shoulder',sh,(.16,.16,.16),'navy')
        bind(rod(name+' sleeve upper',sh,el,.14,'navy',.105),rig,side+'_upperarm')
        e(side+' elbow',el,(.108,.11,.11),'navy',side+'_forearm')
        bind(rod(name+' sleeve lower',el,hand,.105,'suit_blue',.075),rig,side+'_forearm')
        e(side+' shirt cuff',(hand[0]-.04,hand[1],hand[2]+.025),(.064,.085,.067),'white',side+'_forearm')
        e(side+' hand',hand,(.11,.076,.075),skin,side+'_forearm')
        sy=-1 if side=='near' else 1
        hip=(-.23,sy*.22,2.2); knee=(.15,sy*.50,1.81); foot=(-.13,sy*.56,1.36)
        bind(rod(name+' trousers upper',hip,knee,.17,'navy',.13),rig,side+'_thigh')
        e(side+' trouser knee',knee,(.13,.12,.13),'navy',side+'_shin')
        bind(rod(name+' trousers lower',knee,foot,.12,'navy',.08),rig,side+'_shin')
        e(side+' boot',(.01,sy*.56,1.33),(.23,.105,.105),'black',side+'_shin')
        c(side+' stirrup',[(-.20,sy*.59,1.41),(-.19,sy*.62,1.23),(.16,sy*.62,1.23),(.20,sy*.59,1.41)],.015,'gold','hips')
    return rig, armpts

trump,arms_t=rider('Trump',TRUMP,'skin_trump','skin_t_shade','blond','red',horse_a)
biden,arms_b=rider('Biden',BIDEN,'skin_biden','skin_b_shade','hair_white','blue',horse_b)

# Reusable cap geometry has its own root, independent from either character.
current=PROPS
hat=bpy.data.objects.new('CAP • animated throw root',None)
current.objects.link(hat)
hat['interaction']='held on head, grabbed, ballistic throw, Biden ducks, drops to track'
cap_parts=[]
cap_parts.append(ell('cap • crown',(0,0,.03),(.36,.345,.19),'red'))
cap_parts.append(ell('cap • curved brim',(.30,0,-.075),(.35,.35,.045),'red'))
cap_parts.append(ell('cap • top button',(0,0,.22),(.038,.038,.025),'red'))
for i in range(6):
    a=i*math.tau/6
    cap_parts.append(curve('cap • stitched panel',[(.33*math.cos(a),.32*math.sin(a),.01),(.23*math.cos(a),.23*math.sin(a),.17),(0,0,.216)],.004,'ivory'))
cap_parts.append(text('cap • SC badge','SC',.105,(.335,0,.06),'white',(math.pi/2,0,math.pi/2)))
for o in cap_parts:
    o.parent=hat

# A deliberately compact racecourse with graphic grass, rails, and a grandstand.
current=ENV
box('infield',(0,0,-.23),(70,42,.35),'grass',0)
box('dirt straight',(0,0,-.045),(70,7.4,.16),'track',.05)
scroll=bpy.data.objects.new('TRACK • moving scenery',None)
current.objects.link(scroll)
for lane in [-3.05,0,3.05]:
    for x in range(-18,26,3):
        o=box('track lane dash',(x,lane,.043),(.9,.035,.012),'track_light',0)
        o.parent=scroll
for i in range(160):
    x=random.uniform(-18,25); y=random.uniform(-3.5,3.5)
    o=ell('dirt fleck',(x,y,.043),(.06,.022,.006),'track_light',8,4)
    o.parent=scroll
for y in [-3.8,3.8]:
    for x in range(-22,30,2):
        o=box('rail post',(x,y,.54),(.09,.09,1.05),'ivory',.018)
        o.parent=scroll
    for z in [.64,.99]:
        o=box('white running rail',(0,y,z),(85,.065,.085),'ivory',.025)
    for x in range(-18,24,5):
        o=box('rail green banner',(x,y,.52),(1.9,.025,.42),'teal',.02)
        o.parent=scroll
        o=text('course branding','STREAKCHAT',.17,(x,y-.025,.52),'white',(math.pi/2,0,0))
        o.parent=scroll
# Back grandstand remains beyond the focus plane, with low-poly spectators.
for row in range(3):
    box('stand tier',(-1,6.5+row*.65,.2+row*.4),(42,.7,.6+row*.55),'navy',.05)
for i in range(90):
    x=-19+(i%30)*1.3
    row=i//30
    y=6.4+row*.65
    z=.85+row*.55
    mat=['red','blue','ivory','yellow','teal','pink'][i%6]
    ell('crowd body',(x,y,z),(.16,.15,.25),mat,8,6)
    ell('crowd head',(x,y,z+.30),(.12,.12,.14),'skin_biden',8,6)
for x in [-16,-9,8,15,22]:
    rod('tree trunk',(x,9,0),(x,9,2.3),.12,'chestnut_dark')
    for z,r in [(2,1),(2.7,.8),(3.3,.55)]:
        ell('graphic tree canopy',(x,9,z),(r,r,r),'grass_light',12,8)
# Finish stripe moves past the horses near the end of the shot.
finishroot=bpy.data.objects.new('FINISH • timed crossing',None)
current.objects.link(finishroot)
for yi in range(14):
    for xi in range(2):
        o=box('checkered finish',(xi*.18,yi*.51-3.3,.049),(.18,.51,.015),'ivory' if (yi+xi)%2 else 'black',0)
        o.parent=finishroot
for sy in [-1,1]:
    o=rod('finish pole',(0,sy*3.6,0),(0,sy*3.6,3.6),.06,'ivory')
    o.parent=finishroot
    o=box('finish flag',(.30,sy*3.6,3.37),(.65,.035,.37),'yellow',.02)
    o.parent=finishroot

# Lighting and broadcast framing.
current=LIGHT
def light(name,typ,pos,energy,color,size=5):
    data=bpy.data.lights.new(name,typ)
    data.energy=energy
    data.color=color
    if typ=='AREA':data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data)
    current.objects.link(o)
    o.location=pos
    o.rotation_euler=(Vector((0,0,1.7))-o.location).to_track_quat('-Z','Y').to_euler()
    return o
light('warm key','AREA',(2,-5,9),1500,(1,.83,.65),7)
light('sky fill','AREA',(3,5,8),1100,(.64,.80,1),6)
sun=light('late sun','SUN',(-3,-4,8),2,(1,.90,.73))
sun.data.angle=.12
camdata=bpy.data.cameras.new('Race camera')
cam=bpy.data.objects.new('Race camera',camdata)
current.objects.link(cam)
cam.location=(7.5,-12.8,6.5)
cam.rotation_euler=(Vector((.25,0,2.15))-cam.location).to_track_quat('-Z','Y').to_euler()
camdata.type='ORTHO'
camdata.ortho_scale=10.7
camdata.lens=48
scene.camera=cam

# Camera-space overlays are editable Blender objects, not baked imagery.
current=UI
aspect=scene.render.resolution_x/scene.render.resolution_y
halfwidth=camdata.ortho_scale/2
halfheight=halfwidth/aspect
def overlay_box(name,x,y,w,h,mat,z=-7):
    o=box(name,(0,0,0),(w,h,.008),mat,.02)
    o.parent=cam
    o.location=(x,y,z)
    o.rotation_euler=(0,0,0)
    return o
def overlay_text(name,value,x,y,size,mat='white',align='LEFT'):
    return text(name,value,size,(x,y,-6.97),mat,parent=cam,align=align)
overlay_box('brand pill',-3.69,2.58,2.6,.40,'navy')
overlay_text('brand','STREAKCHAT',-4.84,2.58,.25)
overlay_box('local badge',3.69,2.58,2.6,.40,'teal')
overlay_text('local badge text','LOCAL  /  3D TEST',2.54,2.58,.19)
overlay_text('episode title','THE HAT TRICK',-4.84,2.02,.30)
overlay_text('episode subtitle','TWO RIDERS. ONE BAD IDEA.',-4.84,1.70,.13,'ivory')
overlay_box('Trump nameplate',-3.55,-2.48,2.80,.50,'navy')
overlay_box('Trump marker',-4.85,-2.48,.10,.50,'red')
overlay_text('Trump caption','01   TRUMP',-4.63,-2.48,.23)
overlay_box('Biden nameplate',-.42,-2.48,2.80,.50,'navy')
overlay_box('Biden marker',-1.72,-2.48,.10,.50,'blue')
overlay_text('Biden caption','02   BIDEN',-1.50,-2.48,.23)
overlay_text('clip spec','6 SEC  /  EEVEE',4.9,-2.46,.15,'ivory','RIGHT')
cue=overlay_text('interaction cue','',0,-1.95,.25,'yellow','CENTER')
# Separate keyed graphics avoid a render-time handler dependency.
cue.data.body='HAT THROW!'
for f,hidden in [(1,True),(52,True),(53,False),(92,False),(93,True),(144,True)]:
    cue.hide_render=hidden
    cue.keyframe_insert(data_path='hide_render',frame=f)
    cue.hide_viewport=hidden
    cue.keyframe_insert(data_path='hide_viewport',frame=f)

def key(obj,path,f):obj.keyframe_insert(data_path=path,frame=f)
def pose_euler(rig,bone,f,rotation=(0,0,0),location=None):
    pb=rig.pose.bones[bone]
    pb.rotation_mode='XYZ'
    pb.rotation_euler=rotation
    key(pb,'rotation_euler',f)
    if location is not None:
        pb.location=location
        key(pb,'location',f)

def point_arm(rig,side,sh,el,hand,f):
    # Solve world directions against each bone's rest orientation.
    previous=None
    for bone,a,b in [(side+'_upperarm',sh,el),(side+'_forearm',el,hand)]:
        pb=rig.pose.bones[bone]
        rest=pb.bone.matrix_local.to_3x3()
        desired=(Vector(b)-Vector(a)).to_track_quat('Y','Z').to_matrix()
        world=desired
        if previous is None:
            parent_rot=rig.pose.bones['spine'].matrix.to_3x3() @ rig.data.bones['spine'].matrix_local.to_3x3().inverted()
        else:
            parent_rot=previous
        local=rest.inverted() @ parent_rot.inverted() @ world
        pb.rotation_mode='QUATERNION'
        pb.rotation_quaternion=local.to_quaternion()
        key(pb,'rotation_quaternion',f)
        previous=world @ rest.inverted()

# Every animation is baked as ordinary keyframes; no scripts needed to play .blend.
for f in range(1,145):
    t=(f-1)/24
    for idx,(rig,legs) in enumerate([(horse_a,legs_a),(horse_b,legs_b)]):
        phase=t*math.tau*1.8+idx*1.45
        bounce=.065*math.sin(phase*2)
        pose_euler(rig,'body',f,(.014*math.sin(phase),.035*math.sin(phase),0),(0,0,bounce))
        pose_euler(rig,'neck',f,(0,.045*math.sin(phase+.5),0))
        pose_euler(rig,'head',f,(0,-.035*math.sin(phase),0))
        pose_euler(rig,'tail',f,(.12*math.sin(phase),.13*math.sin(phase+1),.1*math.sin(phase*.5)))
        for k,h,kn,ft,fore,side in legs:
            ph=phase+(0 if fore=='front' else 2.6)+(.6 if side=='far' else 0)
            # Local X is approximately horse-world Y for these vertical limb bones.
            pose_euler(rig,k+'_upper',f,(.60*math.sin(ph),0,0))
            pose_euler(rig,k+'_lower',f,(.15+.65*max(0,math.sin(ph+.7)),0,0))
            pose_euler(rig,k+'_hoof',f,(-.15*math.sin(ph),0,0))
        lead=(-.55 if idx==0 else .65)+(.16*math.sin(t*.8+idx))
        rig.location.x=lead
        key(rig,'location',f)
        rider_rig=trump if idx==0 else biden
        rider_rig.location.z=bounce*.55
        key(rider_rig,'location',f)
        duck=math.exp(-((f-79)/10)**4)*.58 if idx==1 else 0
        pose_euler(rider_rig,'spine',f,(0,.045*math.sin(phase+.4)+duck,0))
        pose_euler(rider_rig,'head',f,(0,-.045*math.sin(phase+.4)-duck*.2,.05*math.sin(t*.7)))
        for side in ['near','far']:
            pose_euler(rider_rig,side+'_thigh',f,(.035*math.sin(phase),0,0))
            pose_euler(rider_rig,side+'_shin',f,(-.04*math.sin(phase),0,0))
    scroll.location.x=-t*3.4
    key(scroll,'location',f)
    finishroot.location.x=(5.25-t)*3.4
    key(finishroot,'location',f)
    # Trump lifts his visible arm, winds up across his body, and releases at frame 61.
    sh,el,hand=arms_t['near']
    def mix(a,b,u):return tuple(x+(y-x)*u for x,y in zip(a,b))
    if f<30:
        ee,hh=el,hand
    elif f<42:
        u=(f-30)/12;ee=mix(el,(.12,-.52,3.22),u);hh=mix(hand,(.12,-.20,3.94),u)
    elif f<52:
        u=(f-42)/10;ee=mix((.12,-.52,3.22),(-.24,-.53,3.28),u);hh=mix((.12,-.20,3.94),(-.40,-.24,3.90),u)
    elif f<62:
        u=(f-52)/10;ee=mix((-.24,-.53,3.28),(.18,-.13,3.31),u);hh=mix((-.40,-.24,3.90),(.54,.40,3.61),u)
    elif f<85:
        u=(f-62)/23;ee=mix((.18,-.13,3.31),el,u);hh=mix((.54,.40,3.61),hand,u)
    else:ee,hh=el,hand
    point_arm(trump,'near',sh,ee,hh,f)
    # Cap goes from head to hand to a cross-lane ballistic arc.
    if f<42:
        p=Vector((horse_a.location.x+.02,-1.45,4.005+trump.location.z))
        rot=(0,0,0)
    elif f<62:
        p=Vector((horse_a.location.x+hh[0],-1.45+hh[1],hh[2]+.09))
        rot=(.10*(f-42),.04*(f-42),0)
    elif f<=96:
        u=(f-62)/34
        start=Vector((0.01,-1.05,3.70))
        end=Vector((1.06,2.0,1.0))
        p=start.lerp(end,u)
        p.z+=1.8*4*u*(1-u)
        rot=(u*math.tau*1.5,u*math.tau,u*.8)
    elif f<109:
        u=(f-96)/13;p=Vector((1.06-u*1.1,2.,1.0*(1-u)+.12))
        rot=(math.pi*.12,0,u)
    else:
        p=Vector((-.04-(f-109)*3.4/24,2.,.12));rot=(math.pi*.12,0,1)
    hat.location=p
    hat.rotation_euler=rot
    key(hat,'location',f);key(hat,'rotation_euler',f)

for frame,name in [(1,'RACE'),(30,'REACH FOR CAP'),(42,'GRAB'),(52,'WIND UP'),(62,'RELEASE'),(79,'BIDEN DUCKS'),(96,'HAT LANDS'),(126,'FINISH')]:
    scene.timeline_markers.new(name,frame=frame)
for o in bpy.data.objects:
    if o.animation_data and o.animation_data.action:
        o.animation_data.action.name=o.name+' • sample action'
        # Default Bezier at densely baked frame intervals is safe and editable.
for c,desc in [(TRUMP,'Trump caricature rider; navy suit, orange complexion, blond comb-over'),
               (BIDEN,'Biden caricature rider; silver receding hair, blue tie'),
               (HORSE_A,'Chestnut horse with articulated four-leg gallop'),
               (HORSE_B,'Gray horse with articulated four-leg gallop')]:
    c.asset_mark()
    c.asset_data.description=desc
scene['project']='StreakChat • isolated local Blender proof of concept'
scene['source']='Original procedural meshes and keyed armatures. No AI-generated media.'
scene['shot']='6 seconds / 24 fps / two horses / throw and duck / Eevee'
scene['reuse']='Append ASSET collections from this blend; keyed rigs use no external files.'
scene.frame_set(1)
# Open the saved file looking through its camera.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'streakchat_two_horse.blend'))
print('BUILD_DONE',json.dumps({'objects':len(bpy.data.objects),'mesh_objects':sum(o.type=='MESH' for o in bpy.data.objects),'frames':144,'resolution':[960,540]}),flush=True)
import runpy
runpy.run_path(str(ROOT/'refine_sample.py'),run_name='__main__')
runpy.run_path(str(ROOT/'finalize_project.py'),run_name='__main__')
