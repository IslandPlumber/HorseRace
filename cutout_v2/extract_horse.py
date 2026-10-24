"""Normalize the CC0 horse mesh and rebuild its old Blender materials."""
import bpy,math,json
from pathlib import Path
from mathutils import Matrix,Vector

root=Path(__file__).resolve().parent
body=bpy.data.objects['Plane']
rig=bpy.data.objects['Armature']
rig.data.pose_position='REST'
bpy.context.view_layer.update()
parts=[o for o in bpy.data.objects if o.type=='MESH']
oldrigworld=rig.matrix_world.copy()
worldbody=[body.matrix_world @ Vector(p) for p in body.bound_box]
minz=min(v.z for v in worldbody)
centerx=sum(v.x for v in worldbody)/8
centery=sum(v.y for v in worldbody)/8
normalize=Matrix.Scale(.285,4) @ Matrix.Rotation(math.pi/2,4,'Z') @ Matrix.Translation((-centerx,-centery,-minz))
for ob in parts:
    # Normalize both skin and skeleton into the same shared object space.
    world=ob.matrix_world.copy()
    ob.modifiers.clear()
    ob.parent=None
    ob.data.transform(normalize @ world)
    ob.matrix_world=Matrix.Identity(4)
    for poly in ob.data.polygons:poly.use_smooth=True
rig.data.transform(normalize @ oldrigworld)
rig.matrix_world=Matrix.Identity(4)
rig.name='Horse • anatomical rig'
rig.data.pose_position='POSE'
for ob in parts:
    if ob==body:
        mod=ob.modifiers.new('original weighted horse rig','ARMATURE');mod.object=rig
    else:
        center=sum((Vector(p) for p in ob.bound_box),Vector())/8
        bone='Bone.004' if center.x<-.8 else 'Bone.002'
        group=ob.vertex_groups.new(name=bone)
        group.add(list(range(len(ob.data.vertices))),1,'REPLACE')
        mod=ob.modifiers.new('rigid mane, tail, or eye attachment','ARMATURE');mod.object=rig

def textured(name,image,normal=None,rough=.8):
    mat=bpy.data.materials.new(name)
    tree=mat.node_tree
    tree.nodes.clear()
    bs=tree.nodes.new('ShaderNodeBsdfPrincipled')
    bs.inputs['Roughness'].default_value=rough
    tex=tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images[image]
    tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    if normal:
        nt=tree.nodes.new('ShaderNodeTexImage');nt.image=bpy.data.images[normal]
        nt.image.colorspace_settings.name='Non-Color'
        nm=tree.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.4
        tree.links.new(nt.outputs['Color'],nm.inputs['Color']);tree.links.new(nm.outputs['Normal'],bs.inputs['Normal'])
    output=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(bs.outputs['BSDF'],output.inputs['Surface'])
    return mat
coat=textured('Horse • original painted coat','HorseMain4k00.png','HorseMain4k00Norm00.p')
hair=textured('Horse • mane and tail','Hair12Main2k.png','Hair12Main2kNorm.png')
eye=textured('Horse • small dark eyes','eye_texture.bmp.001',rough=.34)
for ob in parts:
    ob.data.materials.clear()
    ob.data.materials.append(coat if ob==body else eye if ob.name.startswith('Sphere') else hair)
    if ob==body:
        sub=ob.modifiers.new('gentle surface subdivision','SUBSURF');sub.levels=1;sub.render_levels=1
lib=bpy.data.collections.new('CC0 • anatomical horse')
for ob in parts+[rig]:
    for c in list(ob.users_collection):c.objects.unlink(ob)
    lib.objects.link(ob)
lib.asset_mark()
lib.asset_data.description='CC0 horse by Lyndon Daniels; rig by ChadM. Source retained separately.'
bpy.data.libraries.write(str(root/'horse_asset.blend'),{lib},fake_user=True,compress=True)
print('HORSE_EXTRACTED',json.dumps({'dimensions':list(body.dimensions),'bounds':[list(normalize @ v) for v in worldbody]}),flush=True)
