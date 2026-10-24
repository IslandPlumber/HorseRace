import bpy
from pathlib import Path
root=Path(__file__).resolve().parent
source=bpy.data.collections['ASSET • photographic cutout riders']
for name in ['Trump','Biden']:
    c=bpy.data.collections.get('ASSET • '+name+' photo puppet')
    if c is None:
        c=bpy.data.collections.new('ASSET • '+name+' photo puppet')
        bpy.context.scene.collection.children.link(c)
    for ob in list(source.objects):
        if ob.name.startswith(name):source.objects.unlink(ob);c.objects.link(ob)
    c.asset_mark();c.asset_data.description='Photo face and separate hinged jaw, stiff suit, simple keyed arm. See CREDITS.md.'
scene=bpy.context.scene
scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.eevee.taa_render_samples=48
shadowprop=scene.eevee.bl_rna.properties['shadow_pool_size']
scene.eevee.shadow_pool_size=128 if shadowprop.type=='INT' else '128'
scene['render_backend_hint']='On this tested PC use --gpu-backend vulkan. See README.md or the included launcher.'
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'streakchat_cutout_v2.blend'))
print('CUTOUT_FINALIZED',flush=True)
