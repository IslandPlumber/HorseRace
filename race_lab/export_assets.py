"""Extract browser-ready, self-contained actors; never save the source Blender file.

blender -b cutout_v8/streakchat_seven_riders.blend --python-exit-code 1 --python race_lab/export_assets.py
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / 'cutout_v8/streakchat_seven_riders.blend'
OUT = ROOT / 'assets'
ACTORS = [('trump','Trump'),('biden','Biden'),('mcconnell','McConnell'),('bernie','Bernie'),('elon','Elon'),('gordon','Gordon'),('snoop','Snoop')]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def action_curves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def read_glb(path):
    data = path.read_bytes()
    magic,version,length = struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and length==len(data)
    size,kind = struct.unpack_from('<II',data,12)
    assert kind==0x4e4f534a
    return json.loads(data[20:20+size])


def select(members,active):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in members:
        ob.hide_set(False)
        ob.hide_render=False
        ob.select_set(True)
    bpy.context.view_layer.objects.active=active


def bake_legacy_coat(members,actor_id):
    """Bake unsupported color nodes to a portable runtime diffuse texture."""
    for ob in members:
        if ob.type!='MESH':continue
        for mat in ob.data.materials:
            if not mat or 'coat' not in mat.name:continue
            nodes=mat.node_tree.nodes
            if not any(n.type in {'MIX_RGB','HUE_SAT'} for n in nodes):continue
            assert len(ob.data.materials)==1,(ob.name,'Unexpected coat material slots')
            bs=nodes.get('Principled BSDF')
            color=next(l.from_socket for l in mat.node_tree.links if l.to_socket==bs.inputs['Base Color'])
            output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
            image=bpy.data.images.new(f'{actor_id} portable painted coat',width=512,height=512,alpha=False)
            target=nodes.new('ShaderNodeTexImage')
            target.image=image
            nodes.active=target
            emit=nodes.new('ShaderNodeEmission')
            mat.node_tree.links.new(color,emit.inputs['Color'])
            mat.node_tree.links.new(emit.outputs[0],output.inputs['Surface'])
            scene=bpy.context.scene
            scene.render.engine='CYCLES'
            scene.cycles.device='CPU'
            scene.cycles.samples=1
            scene.render.threads_mode='FIXED'
            scene.render.threads=4
            select([ob],ob)
            result=bpy.ops.object.bake(type='EMIT',width=512,height=512,margin=4,use_clear=True)
            assert result=={'FINISHED'},result
            mat.node_tree.links.new(bs.outputs[0],output.inputs['Surface'])
            nodes.remove(emit)
            mat.node_tree.links.new(target.outputs['Color'],bs.inputs['Base Color'])
            image.pack()
            print('PORTABLE_COAT_BAKED',actor_id,flush=True)


def export_actor(index,actor_id,name):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene=bpy.context.scene
    scene.frame_start=1
    scene.frame_end=97
    scene.render.fps=24
    scene.frame_set(1)
    hr=bpy.data.objects[f'HORSE {index} • root']
    members=[hr]+list(hr.children_recursive)
    for ob in members:
        for modifier in ob.modifiers:
            if modifier.type=='ARMATURE':
                assert modifier.object in members,(actor_id,ob.name,'External armature dependency')
    hr.animation_data_clear()
    hr.location=(0,0,0)
    hr['actor_id']=actor_id
    hr['asset_kind']='reusable horse and photo-cutout rider'
    hr['source_version']='cutout_v8'
    # Quiet Trump/Biden puppets: their hat throw/duck and speech belong to the
    # original scene, not to the reusable horse locomotion clip.
    if actor_id in {'trump','biden'}:
        for ob in members:
            if ob.type!='ARMATURE':
                ob.animation_data_clear()
    # The cap stays attached to Trump's head in the reusable quiet pose.
    if actor_id=='trump':
        cap=bpy.data.objects['red cap • throwable root']
        cap.animation_data_clear()
        cap.parent=bpy.data.objects['Trump • head hinge']
        cap.matrix_parent_inverse=Matrix.Identity(4)
        cap.location=(.015,1.47,.10)
        cap.rotation_mode='QUATERNION'
        cap.rotation_quaternion=Quaternion((1,0,0,0))
        members += [cap]+list(cap.children_recursive)
        for ob in [cap]+list(cap.children_recursive):ob.animation_data_clear()
    bpy.context.view_layer.update()
    # Close each personal/gait loop at an exact four-second sample boundary.
    for ob in members:
        if ob.type=='ARMATURE':
            for bone in ob.pose.bones:
                for path in ['location','rotation_quaternion','scale']:
                    bone.keyframe_insert(data_path=path,frame=97)
        elif ob.animation_data and ob.animation_data.action:
            paths={curve.data_path for curve in action_curves(ob.animation_data.action)}
            for path in paths:
                if path in {'location','rotation_euler','rotation_quaternion','scale'}:
                    ob.keyframe_insert(data_path=path,frame=97)
    # Keep photos/textures sharp enough for a game view while bounding downloads.
    used_images=set()
    for ob in members:
        if ob.type=='MESH':
            for mat in ob.data.materials:
                if mat and mat.use_nodes:
                    for node in mat.node_tree.nodes:
                        if node.type=='TEX_IMAGE' and node.image:used_images.add(node.image)
    for image in used_images:
        w,h=image.size
        if max(w,h)>1024:
            ratio=1024/max(w,h)
            image.scale(max(1,round(w*ratio)),max(1,round(h*ratio)))
    bake_legacy_coat(members,actor_id)
    # Convert curves/text, maintaining the cap's lettering and leather tack.
    for ob in list(members):
        if ob.type in {'CURVE','FONT'}:
            select([ob],ob)
            bpy.ops.object.convert(target='MESH')
    members=[hr]+list(hr.children_recursive)
    scene.frame_set(1)
    bpy.context.view_layer.update()
    graph=bpy.context.evaluated_depsgraph_get()
    points=[]
    for ob in members:
        if ob.type=='MESH':
            evaluated=ob.evaluated_get(graph)
            points.extend(evaluated.matrix_world@Vector(c) for c in evaluated.bound_box)
    bounds=[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]
    assert all(math.isfinite(v) for pair in bounds for v in pair)
    select(members,hr)
    target=OUT/f'{actor_id}.glb'
    kwargs=dict(filepath=str(target),export_format='GLB',use_selection=True,
                export_animations=True,export_frame_range=True,export_force_sampling=True,
                export_skins=True,export_cameras=False,export_lights=False,export_yup=True,
                export_tangents=True,
                export_animation_mode='SCENE',export_anim_scene_split_object=False,
                export_anim_slide_to_zero=True,export_bake_animation=True,
                export_extras=True,export_unused_images=False,export_image_quality=85,
                export_image_format='JPEG',export_apply=True)
    props=bpy.ops.export_scene.gltf.get_rna_type().properties
    kwargs={k:v for k,v in kwargs.items() if k in props}
    result=bpy.ops.export_scene.gltf(**kwargs)
    assert result=={'FINISHED'},result
    gltf=read_glb(target)
    assert gltf.get('meshes') and gltf.get('skins') and gltf.get('animations'),actor_id
    assert len(gltf['animations'])==1
    assert not gltf.get('cameras')
    root_index=next(i for i,n in enumerate(gltf['nodes']) if n.get('extras',{}).get('actor_id')==actor_id)
    assert gltf['nodes'][root_index].get('translation',[0,0,0])==[0,0,0]
    assert not any(c['target']['node']==root_index for c in gltf['animations'][0]['channels'])
    assert all('bufferView' in img and 'uri' not in img for img in gltf.get('images',[]))
    animations=[]
    for animation in gltf.get('animations',[]):
        animation['name']='gait'
        times=[]
        for sampler in animation['samplers']:
            times.extend(gltf['accessors'][sampler['input']].get('max',[]))
        animations.append({'name':'gait','duration_seconds':max(times),'channels':len(animation['channels'])})
        assert abs(max(times)-4)<.001
    # These source eye spheres intentionally use a dark material without useful
    # UVs. Blender's exporter emits an invalid texCoord:-1 for their old texture.
    for mat in gltf.get('materials',[]):
        if 'small dark eyes' in mat.get('name',''):
            pbr=mat.setdefault('pbrMetallicRoughness',{})
            pbr.pop('baseColorTexture',None)
            pbr['baseColorFactor']=[.012,.008,.008,1]
    # Rename the scene clip in the GLB JSON without touching any buffer offsets.
    # JSON chunk padding can change; BIN chunk contents and bufferViews stay intact.
    data=target.read_bytes()
    old_size=struct.unpack_from('<I',data,12)[0]
    tail=data[20+old_size:]
    encoded=json.dumps(gltf,separators=(',',':'),ensure_ascii=True).encode()
    encoded+=b' '*((-len(encoded))%4)
    target.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+tail)
    return {'id':actor_id,'name':name,'file':f'assets/{actor_id}.glb','bytes':target.stat().st_size,
            'sha256':digest(target),'meshes':len(gltf['meshes']),'nodes':len(gltf['nodes']),
            'skins':len(gltf['skins']),'embedded_images':len(gltf.get('images',[])),
            'animations':animations,'blender_bounds_xyz':bounds,
            'bounds_xyz':[[*bounds[0]],[*bounds[2]],[-bounds[1][1],-bounds[1][0]]],
            'quiet_puppet':actor_id in {'trump','biden'},
            'root_motion':'None; race definition controls progress and lane'}


def main():
    OUT.mkdir(exist_ok=True,parents=True)
    original=digest(SOURCE)
    actors=[]
    selected=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    for index,(actor_id,name) in enumerate(ACTORS,1):
        if selected and actor_id not in selected:continue
        actor=export_actor(index,actor_id,name)
        actors.append(actor)
        print('ACTOR_EXPORTED',json.dumps(actor),flush=True)
    assert digest(SOURCE)==original,'Source scene changed'
    manifest={'source':'../cutout_v8/streakchat_seven_riders.blend','source_sha256':original,
              'source_unchanged':True,'blender_version':bpy.app.version_string,
              'coordinates':'glTF +Y up, horse forward +X; root at track distance/lane origin',
              'clip':'gait: four-second reusable action; scene-specific hat throw, duck and speech stripped',
              'credits':['../cutout_v8/CREDITS.md','../cutout_v7/CREDITS.md','../cutout_v6/CREDITS.md','../cutout_v5/CREDITS.md'],
              'actors':actors}
    destination=ROOT/('asset-manifest.partial.json' if selected else 'asset-manifest.json')
    temporary=destination.with_suffix(destination.suffix+'.tmp')
    temporary.write_text(json.dumps(manifest,indent=2)+'\n')
    temporary.replace(destination)
    print('REUSABLE_ASSETS_EXPORTED',len(actors),sum(a['bytes'] for a in actors),flush=True)


main()
