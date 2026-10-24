import bpy,json
from mathutils import Vector
info=[]
for o in bpy.data.objects:
    item={'name':o.name,'type':o.type,'location':list(o.location),'scale':list(o.scale),'dimensions':list(o.dimensions),'parent':o.parent.name if o.parent else None}
    if o.type=='MESH':
        item['vertices']=len(o.data.vertices)
        item['materials']=[m.name if m else None for m in o.data.materials]
        item['modifiers']=[{'type':m.type,'object':m.object.name if hasattr(m,'object') and m.object else None} for m in o.modifiers]
    if o.type=='ARMATURE':item['bones']=[{'name':b.name,'head':list(b.head_local),'tail':list(b.tail_local)} for b in o.data.bones]
    info.append(item)
print('HORSE_DATA',json.dumps({'objects':info,'images':[{'name':im.name,'size':list(im.size),'packed':bool(im.packed_file)} for im in bpy.data.images],'actions':[a.name for a in bpy.data.actions]}),flush=True)
