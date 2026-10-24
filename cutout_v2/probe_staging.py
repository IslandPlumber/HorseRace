import bpy,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
scene=bpy.context.scene;scene.frame_set(1)
result=[]
for name in ['HORSE 1 • root','HORSE 2 • root']:
    root=bpy.data.objects[name]
    body=next(o for o in root.children if o.type=='MESH' and len(o.data.vertices)>3000)
    tree=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
    hits=[]
    for x in [-.6,-.4,-.2,0,.2]:
        p,n,i,d=tree.ray_cast(Vector((x,0,5)),Vector((0,0,-1)))
        hits.append({'x':x,'point':list(p) if p is not None else None})
    result.append({'root':name,'body':body.name,'back':hits})
print('SEAT_PROBE',json.dumps(result),flush=True)
