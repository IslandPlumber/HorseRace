"""Export reusable, skinned game assets locally without changing the source blend."""
import bpy
import json
from pathlib import Path
from mathutils import Matrix

root=Path(__file__).resolve().parent
out=root/'assets'
out.mkdir(exist_ok=True)
scene=bpy.context.scene
scene.frame_set(1)

items=[('ASSET • Trump rider','trump_rider','Trump • rider rig'),
       ('ASSET • Biden rider','biden_rider','Biden • rider rig'),
       ('ASSET • chestnut horse','chestnut_horse','Chestnut • gallop rig'),
       ('ASSET • gray horse','gray_horse','Silver • gallop rig'),
       ('PROPS • throwable cap','red_cap','CAP • animated throw root')]
report=[]
for colname,filename,rootname in items:
    bpy.ops.object.select_all(action='DESELECT')
    col=bpy.data.collections[colname]
    members=list(col.all_objects)
    rootobj=bpy.data.objects[rootname]
    oldparent=rootobj.parent
    oldloc=rootobj.location.copy()
    oldanim=rootobj.animation_data.action if rootobj.animation_data else None
    rootobj.parent=None
    rootobj.location=(0,0,0)
    # Root motion is shot-specific. Preserve bone animation, remove root travel in exports.
    if rootobj.type=='EMPTY':
        rootobj.animation_data_clear()
        rootobj.rotation_euler=(0,0,0)
    elif rootobj.animation_data:
        # Temporarily mute root translation via a copied action; armature bones remain animated.
        rootobj.animation_data.action=oldanim.copy()
        action=rootobj.animation_data.action
        if hasattr(action,'layers'):
            for layer in action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for fc in list(bag.fcurves):
                            if fc.data_path=='location':bag.fcurves.remove(fc)
    for ob in members:
        ob.hide_set(False)
        ob.select_set(True)
    bpy.context.view_layer.objects.active=rootobj
    bpy.context.view_layer.update()
    # glTF requires meshes; convert the cap's text and curve stitching.
    for ob in list(members):
        if ob.type in {'CURVE','FONT'}:
            bpy.ops.object.select_all(action='DESELECT')
            ob.select_set(True)
            bpy.context.view_layer.objects.active=ob
            bpy.ops.object.convert(target='MESH')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in col.all_objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=rootobj
    target=out/(filename+'.glb')
    kwargs=dict(filepath=str(target),export_format='GLB',use_selection=True,
        export_animations=rootobj.type=='ARMATURE',export_frame_range=True,
        export_force_sampling=True,export_skins=True,export_cameras=False,export_lights=False)
    props=bpy.ops.export_scene.gltf.get_rna_type().properties
    if 'export_animation_mode' in props:kwargs['export_animation_mode']='ACTIVE_ACTIONS'
    if 'export_yup' in props:kwargs['export_yup']=True
    bpy.ops.export_scene.gltf(**kwargs)
    report.append({'file':target.name,'bytes':target.stat().st_size,'has_armature':rootobj.type=='ARMATURE'})
    rootobj.parent=oldparent
    rootobj.location=oldloc
    if oldanim and rootobj.animation_data:rootobj.animation_data.action=oldanim
(out/'export_manifest.json').write_text(json.dumps(report,indent=2))
print('ASSETS_EXPORTED',json.dumps(report),flush=True)
