"""Add Bernie's folded arms and mittens as an actual photo-cutout rider."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(__file__).resolve().parent;scene=bpy.context.scene;scene.frame_set(1)
horse_col=bpy.data.collections.new('ASSET • Bernie horse');scene.collection.children.link(horse_col)
puppet_col=bpy.data.collections.new('ASSET • Bernie photo puppet');scene.collection.children.link(puppet_col)
source_root=bpy.data.objects['HORSE 2 • root'];mapping={}
for original in [source_root]+list(source_root.children_recursive):
    ob=original.copy()
    if original.data:ob.data=original.data.copy()
    ob.name=original.name.replace('Biden','Bernie') if 'Biden' in original.name else 'Bernie • '+original.name
    collection=puppet_col if any('Biden photo puppet' in c.name for c in original.users_collection) else horse_col
    collection.objects.link(ob);mapping[original]=ob
for original,ob in mapping.items():
    ob.parent=mapping.get(original.parent,original.parent)
    for mod in ob.modifiers:
        if mod.type=='ARMATURE' and mod.object in mapping:mod.object=mapping[mod.object]
    for con in ob.constraints:
        if hasattr(con,'target') and con.target in mapping:con.target=mapping[con.target]
    if 'horse_index' in ob:ob['horse_index']=3
horse=mapping[source_root];horse.name='HORSE 4 • root';horse.animation_data_clear()
for frame in range(1,97):
    phase=(frame-1)/24*math.tau*1.7+3.3
    horse.location=(3.0,-4.65,.04*math.sin(phase*2));horse.keyframe_insert(data_path='location',frame=frame)
body=mapping[bpy.data.objects['Biden • puppet body']]
for ob in list(body.children_recursive):bpy.data.objects.remove(ob,do_unlink=True)
body['animation_design']='Static photographic parka, folded arms and mittens; fitted horse-side legs.'
image=bpy.data.images.load(str(root/'sources'/'bernie_mittens.jpg'));image.pack()
material=bpy.data.materials.new('Bernie • inauguration photograph');tree=material.node_tree;tree.nodes.clear()
tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image
emit=tree.nodes.new('ShaderNodeEmission');emit.inputs['Strength'].default_value=.92
tree.links.new(tex.outputs['Color'],emit.inputs['Color'])
out=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(emit.outputs[0],out.inputs['Surface'])
def cutout(name,points,height,parent,depth):
    # Coordinates use a 2048 × 1152 reference; UVs address the untouched 4K photo.
    minx=min(x for x,y in points);maxx=max(x for x,y in points)
    miny=min(y for x,y in points);maxy=max(y for x,y in points)
    scale=height/(maxy-miny);cx=(minx+maxx)/2
    data=bpy.data.meshes.new(name);data.from_pydata([((x-cx)*scale,(maxy-y)*scale,depth) for x,y in points],[],[tuple(range(len(points)))])
    data.update();data.materials.append(material);uv=data.uv_layers.new(name='unaltered inauguration photo')
    for loop in data.loops:
        x,y=points[loop.vertex_index];uv.data[loop.index].uv=(x/2048,1-y/1152)
    ob=bpy.data.objects.new(name,data);puppet_col.objects.link(ob);ob.parent=parent
    solid=ob.modifiers.new('thin cutout board','SOLIDIFY');solid.thickness=.008
    return ob
coat_points=[(833,226),(852,225),(870,272),(902,304),(957,311),(985,292),(1003,246),(1028,217),
    (1041,252),(1096,275),(1126,317),(1143,365),(1160,421),(1166,474),(1155,516),
    (1125,546),(1090,559),(1067,569),(1038,578),(798,578),(764,566),(730,542),(708,510),
    (697,477),(700,447),(712,404),(733,349),(756,310),(792,281),(823,260)]
cutout('Bernie • parka and actual crossed mittens',coat_points,1.03,body,.035)
head=bpy.data.objects.new('Bernie • head hinge',None);puppet_col.objects.link(head);head.parent=body;head.location=(0,.92,.065)
head_points=[(914,93),(942,92),(968,102),(988,119),(999,143),(1007,171),(1008,196),
    (1015,198),(1015,215),(1009,237),(1001,257),(994,280),(973,297),(951,307),(925,308),
    (901,298),(881,281),(871,260),(862,247),(855,227),(854,208),(850,198),(854,177),
    (857,151),(867,129),(882,111),(898,100)]
face=cutout('Bernie • masked inauguration face',head_points,1.48,head,.022)
face['source']='https://knowyourmeme.com/memes/bernie-sanders-wearing-mittens-sitting-in-a-chair/'
head['animation_design']='Silent masked head; no idle mouth animation.'

# Distinct charcoal horse and a muted green saddle blanket.
horse_body=next(o for o in horse.children if o.type=='MESH' and len(o.data.vertices)>3000)
coat=horse_body.data.materials[0].copy();coat.name='Horse • Bernie charcoal coat'
tree=coat.node_tree;bs=tree.nodes.get('Principled BSDF')
link=next(l for l in tree.links if l.to_socket==bs.inputs['Base Color']);source=link.from_socket;tree.links.remove(link)
mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.83;mix.inputs[2].default_value=(.11,.12,.12,1)
tree.links.new(source,mix.inputs[1]);tree.links.new(mix.outputs[0],bs.inputs['Base Color']);horse_body.data.materials[0]=coat
accent=bpy.data.materials['muted blue'].copy();accent.name='Bernie • moss saddle'
accent.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.12,.17,.10,1)
for ob in puppet_col.objects:
    if ob.type=='MESH' and 'fitted saddle blanket' in ob.name:ob.data.materials[0]=accent
rig=next(ob for ob in horse.children if ob.type=='ARMATURE');rig.animation_data_clear()
for frame in range(1,97):
    phase=(frame-1)/24*math.tau*3.6+3.3
    for side in ['L','R']:
        a=phase+(.75 if side=='R' else 0)
        for name,angle in [(f'Bone_{side}',.35*math.sin(a)),(f'Bone_{side}.001',-.5*max(0,math.sin(a+.5))),
            (f'Bone_{side}.002',.20*math.sin(a)),(f'Bone_{side}.003',.35*math.sin(a+2.5)),
            (f'Bone_{side}.004',.5*max(0,math.sin(a+2.8))),(f'Bone_{side}.005',-.2*math.sin(a+2.8))]:
            pb=rig.pose.bones[name];rest=pb.bone.matrix_local.to_3x3();pb.rotation_mode='QUATERNION'
            pb.rotation_quaternion=(rest.inverted()@Matrix.Rotation(angle,3,'Y')@rest).to_quaternion()
            pb.keyframe_insert(data_path='rotation_quaternion',frame=frame)
rig['gait_cycles_per_second']=3.6
for col in [horse_col,puppet_col]:col.asset_mark()
puppet_col.asset_data.description='Bernie in his inauguration parka and mittens, with a silent masked face and fitted riding legs. See CREDITS.md.'

# Pull straight back to preserve the angle and all existing cap/head alignment.
camera=scene.camera;aim=Vector((1.1,1.55,1.70));up=camera.rotation_euler.to_quaternion()@Vector((0,1,0))
camera.location=aim+(camera.location-aim)*1.28-up*.85
dirt=bpy.data.objects['racing dirt'];dirt.dimensions.y=14.7;dirt.location.y=-.15
for ob in bpy.data.objects['TRACK • moving set'].children:
    if ob.location.y<=-5.5:ob.location.y-=1.5
scene['four_lane_track']=True
ui=bpy.data.collections['GRAPHICS • minimal']
bpy.data.objects['look label'].data.body='LOCAL / FOUR-RIDER TEST'
for ob in list(ui.objects):
    if ob.name.endswith('label') and ob.name not in ['look label']:bpy.data.objects.remove(ob,do_unlink=True)
scale=(6*camera.data.sensor_width/camera.data.lens)/18.5
for name,value,x in [('Trump','01 / TRUMP',-8.58),('Biden','02 / BIDEN',-5.40),('McConnell','03 / McCONNELL',-2.30),('Bernie','04 / BERNIE',1.70)]:
    data=bpy.data.curves.new(name+' label','FONT');data.body=value;data.size=.29;data.materials.append(bpy.data.materials['graphic cream'])
    ob=bpy.data.objects.new(name+' label',data);ui.objects.link(ob);ob.parent=camera;ob.location=(x*scale,-4.73*scale,-5.996);ob.scale=(scale,scale,scale)
bpy.data.objects['joke'].data.body='12-RIDER FIELD IN DEVELOPMENT';bpy.data.objects['joke'].data.size=.15
scene['rider_count']=4;scene['target_field_size']=12
scene['new_rider']='Bernie: actual parka and mittens photo on stiff mesh pieces; no invented face or voice.'
scene.frame_set(1);scene.render.use_sequencer=False;bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(root/'streakchat_four_riders.blend'))
for frame,file in [(1,'look_test.png'),(64,'reaction_test.png')]:
    scene.frame_set(frame);scene.render.filepath=str(root/file);bpy.ops.render.render(write_still=True)
print('FOUR_RIDERS_BUILT',flush=True)
