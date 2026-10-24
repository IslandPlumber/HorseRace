"""Extend the approved local cutout scene with a reusable McConnell rider."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.frame_set(1)
horse_col=bpy.data.collections.new('ASSET • McConnell horse')
puppet_col=bpy.data.collections.new('ASSET • McConnell photo puppet')
scene.collection.children.link(horse_col);scene.collection.children.link(puppet_col)
original_root=bpy.data.objects['HORSE 2 • root']
originals=[original_root]+list(original_root.children_recursive)
mapping={}
for original in originals:
    ob=original.copy()
    if original.data:ob.data=original.data.copy()
    ob.name=original.name.replace('Biden','McConnell') if 'Biden' in original.name else 'McConnell • '+original.name
    target=puppet_col if any('Biden photo puppet' in c.name for c in original.users_collection) else horse_col
    target.objects.link(ob);mapping[original]=ob
for original,ob in mapping.items():
    ob.parent=mapping.get(original.parent,original.parent)
    for mod in ob.modifiers:
        if mod.type=='ARMATURE' and mod.object in mapping:mod.object=mapping[mod.object]
    for con in ob.constraints:
        if hasattr(con,'target') and con.target in mapping:con.target=mapping[con.target]
    if 'horse_index' in ob:ob['horse_index']=2
hr=mapping[original_root];hr.name='HORSE 3 • root';hr.animation_data_clear()
for frame in range(1,97):
    phase=(frame-1)/24*math.tau*1.7+2.2
    hr.location=(3.55,4.65,.04*math.sin(phase*2))
    hr.keyframe_insert(data_path='location',frame=frame)

body=mapping[bpy.data.objects['Biden • puppet body']]
head=mapping[bpy.data.objects['Biden • head hinge']]
head.animation_data_clear();head.location=(0,.83,.065);head.rotation_euler=(0,0,0)
for child in list(head.children):bpy.data.objects.remove(child,do_unlink=True)
arm=mapping[bpy.data.objects['Biden • throwing arm hinge']]
arm.animation_data_clear();arm.rotation_euler=(0,0,0)
head['animation_design']='Blank stare remains completely still relative to the stiff torso.'

# Outline the actual September car meme photo with mesh geometry. The original
# JPEG is preserved untouched; no invented facial detail or generated image.
points=[(438,137),(507,130),(564,137),(620,144),(677,154),(730,178),
        (775,210),(811,254),(837,304),(847,347),(869,376),(873,409),
        (860,440),(870,467),(886,493),(891,518),(881,537),(858,546),
        (846,568),(837,591),(839,616),(827,639),(821,670),(813,704),
        (798,731),(772,746),(733,751),(711,772),(695,798),(577,797),
        (540,766),(504,729),(465,691),(422,649),(383,603),(358,559),
        (341,510),(331,455),(330,399),(334,341),(344,290),(363,239),
        (390,194),(414,163)]
rw,rh=1280,820
minx=min(p[0] for p in points);maxx=max(p[0] for p in points)
miny=min(p[1] for p in points);maxy=max(p[1] for p in points)
scale=1.60/(maxy-miny);cx=(minx+maxx)/2
image=bpy.data.images.load(str(ROOT/'sources'/'mcconnell_car.jpg'));image.pack()
material=bpy.data.materials.new('McConnell • September blank stare photograph')
tree=material.node_tree;tree.nodes.clear()
tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image
emit=tree.nodes.new('ShaderNodeEmission');emit.inputs['Strength'].default_value=.92
tree.links.new(tex.outputs['Color'],emit.inputs['Color'])
out=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(emit.outputs[0],out.inputs['Surface'])
me=bpy.data.meshes.new('McConnell • profile photo cutout')
me.from_pydata([((x-cx)*scale,(maxy-y)*scale,.022) for x,y in points],[],[tuple(range(len(points)))])
me.update();me.materials.append(material)
uv=me.uv_layers.new(name='original meme photograph')
for loop in me.loops:
    x,y=points[loop.vertex_index];uv.data[loop.index].uv=(x/rw,1-y/rh)
face=bpy.data.objects.new('McConnell • blank stare face',me);puppet_col.objects.link(face);face.parent=head
solid=face.modifiers.new('thin photo board','SOLIDIFY');solid.thickness=.008
face['source']='https://knowyourmeme.com/memes/mitch-mcconnell-blankly-staring-in-car'

# Third horse uses the same reusable anatomical rig, with a dark bay coat.
horse_body=next(o for o in hr.children if o.type=='MESH' and len(o.data.vertices)>3000)
trump_horse=bpy.data.objects['HORSE 1 • root']
trump_body=next(o for o in trump_horse.children if o.type=='MESH' and len(o.data.vertices)>3000)
coat=trump_body.data.materials[0].copy();coat.name='Horse • McConnell dark bay coat'
tree=coat.node_tree;bs=tree.nodes.get('Principled BSDF')
link=next(l for l in tree.links if l.to_socket==bs.inputs['Base Color'])
source=link.from_socket;tree.links.remove(link)
mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY'
mix.inputs[0].default_value=.74;mix.inputs[2].default_value=(.24,.145,.09,1)
tree.links.new(source,mix.inputs[1]);tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
horse_body.data.materials[0]=coat
accent=bpy.data.materials['muted blue'].copy();accent.name='McConnell • faded olive tie and saddle'
accent.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.19,.20,.105,1)
for ob in puppet_col.objects:
    if ob.type=='MESH' and ('tie' in ob.name or 'fitted saddle blanket' in ob.name):ob.data.materials[0]=accent
horse_col.asset_mark();horse_col.asset_data.description='Reusable rigged anatomical horse with dark bay coat and fitted saddle.'
puppet_col.asset_mark();puppet_col.asset_data.description='September 2026 blank-stare photo, stiff suit, fitted trousers and boots. See CREDITS.md.'

# Keep the existing head/hat/hand world animation intact while pulling back.
camera=scene.camera
camera.location+=Vector((1.20,1.55,.10));camera.data.ortho_scale=14.8
scene.render.resolution_x=1600;scene.render.resolution_y=900
scene.render.resolution_percentage=100;scene.render.fps=24
scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=48
prop=scene.eevee.bl_rna.properties['shadow_pool_size']
scene.eevee.shadow_pool_size=128 if prop.type=='INT' else '128'
scene.eevee.use_raytracing=False
scene.eevee.shadow_resolution_scale=.65
dirt=bpy.data.objects['racing dirt'];dirt.dimensions.y=13.0;dirt.location.y=.7
scroll=bpy.data.objects['TRACK • moving set']
for ob in scroll.children:
    if ob.location.y>=3.8:ob.location.y+=3.3
    elif ob.location.y<=-3.8:ob.location.y-=1.7
    elif ob.name.startswith('hoof mark'):
        for spline in ob.data.splines:
            for p in spline.bezier_points:
                p.co.y=p.co.y*1.5+.7
                p.handle_left.y=p.handle_left.y*1.5+.7
                p.handle_right.y=p.handle_right.y*1.5+.7

# Refit broadcast graphics to the wider 16:9 canvas.
ui=bpy.data.collections['GRAPHICS • minimal']
for ob in list(ui.objects):bpy.data.objects.remove(ob,do_unlink=True)
def text(name,value,x,y,size,align='LEFT'):
    data=bpy.data.curves.new(name,'FONT');data.body=value;data.size=size;data.align_x=align
    data.materials.append(bpy.data.materials['graphic cream'])
    ob=bpy.data.objects.new(name,data);ui.objects.link(ob);ob.parent=camera;ob.location=(x,y,-6.96)
    return ob
def card(name,x0,y0,x1,y1):
    data=bpy.data.meshes.new(name);data.from_pydata([(x0,y0,-7),(x1,y0,-7),(x1,y1,-7),(x0,y1,-7)],[],[(0,1,2,3)])
    data.materials.append(bpy.data.materials['graphic ink'])
    ob=bpy.data.objects.new(name,data);ui.objects.link(ob);ob.parent=camera;return ob
card('header card',-7.02,3.47,-3.50,3.94)
text('brand','STREAKCHAT',-6.80,3.60,.29)
text('look label','LOCAL / THREE-RIDER TEST',6.9,3.62,.18,'RIGHT')
card('footer card',-7.02,-3.95,7.02,-3.40)
text('Trump label','01 / TRUMP',-6.80,-3.76,.23)
text('Biden label','02 / BIDEN',-3.70,-3.76,.23)
text('McConnell label','03 / McCONNELL',-.65,-3.76,.23)
text('joke','BAD DECISIONS. FAST HORSES.',6.80,-3.74,.16,'RIGHT')
caption=text('dialogue • caption',"BIDEN: C'MON, MAN!",0,-3.00,.29,'CENTER')
caption_card=card('dialogue • caption card',-1.98,-3.14,1.98,-2.68)
for ob in [caption,caption_card]:
    for f,hidden in [(1,True),(42,True),(43,False),(70,False),(71,True),(96,True)]:
        ob.hide_render=hidden;ob.hide_viewport=hidden
        ob.keyframe_insert(data_path='hide_render',frame=f);ob.keyframe_insert(data_path='hide_viewport',frame=f)
scene['wide_revision']='31% wider camera, widened track, three reusable horses/riders; McConnell keeps his blank stare.'
scene['mitch_source']='September 2026 blankly staring in car meme; untouched JPEG texture outlined by mesh.'
scene.frame_set(1)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
scene.render.use_sequencer=False
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'streakchat_three_riders.blend'))
scene.render.filepath=str(ROOT/'look_test.png');bpy.ops.render.render(write_still=True)
scene.frame_set(60);scene.render.filepath=str(ROOT/'reaction_test.png');bpy.ops.render.render(write_still=True)
print('WIDE_RACE_BUILT',flush=True)
