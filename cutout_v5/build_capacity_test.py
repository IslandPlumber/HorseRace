"""A labelled 12-horse layout test: four built riders, eight open casting slots."""
import bpy,math,time,json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
root=Path(__file__).resolve().parent;scene=bpy.context.scene;scene.frame_set(1)
originals=[bpy.data.objects[f'HORSE {i+1} • root'] for i in range(4)]
horse_roots=list(originals);capacity=bpy.data.collections.new('CAPACITY TEST • open rider slots');scene.collection.children.link(capacity)
for row in [1,2]:
    for lane,original_root in enumerate(originals):
        index=len(horse_roots)+1
        horse_collection=original_root.users_collection[0]
        mapping={}
        for original in [original_root]+list(original_root.children_recursive):
            # Keep the real anatomical horse and tack; no copied celebrity faces
            # or floating trouser parts stand in for the eight unbuilt riders.
            if original!=original_root and horse_collection not in original.users_collection:continue
            ob=original.copy();ob.name=f'SLOT {index:02} • '+original.name
            if original.type=='ARMATURE':ob.data=original.data.copy()
            capacity.objects.link(ob);mapping[original]=ob
        for original,ob in mapping.items():
            ob.parent=mapping.get(original.parent,original.parent)
            for mod in ob.modifiers:
                if mod.type=='ARMATURE' and mod.object in mapping:mod.object=mapping[mod.object]
        hr=mapping[original_root];hr.name=f'HORSE {index} • root';hr.animation_data_clear()
        hr.location=original_root.location.copy();hr.location.x-=row*4.8
        hr['casting_status']='OPEN — horse capacity test only';horse_roots.append(hr)
        data=bpy.data.curves.new(f'Open rider slot {index}','FONT');data.body=f'{index:02} / OPEN';data.size=.23;data.align_x='CENTER'
        data.materials.append(bpy.data.materials['graphic cream'])
        label=bpy.data.objects.new(f'Open rider slot {index}',data);capacity.objects.link(label);label.parent=hr
        label.location=(-.42,0,3.25);label.rotation_euler=scene.camera.rotation_euler
camera=scene.camera
aim=Vector((-3.0,0,1.6));up=camera.rotation_euler.to_quaternion()@Vector((0,1,0))
camera.location=aim+Vector((12,-29,21))*1.62-up*.4
right=camera.rotation_euler.to_quaternion()@Vector((1,0,0))
q=camera.rotation_euler.to_quaternion()
# Reserve full-height photo-board space above every saddle, including the eight
# seats whose photos have not been chosen or built. Fit both heads and feet.
fit_points=[]
for hr in horse_roots:
    body=next(o for o in hr.children if o.type=='MESH' and len(o.data.vertices)>3000)
    bpy.context.view_layer.update();ob=body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    fit_points.extend(ob.matrix_world@Vector(c) for c in ob.bound_box)
    seat=hr.matrix_world@Vector((-.42,-.04,2.46))
    fit_points.extend(seat+q@Vector((x,y,.08)) for x in [-.74,.74] for y in [.85,2.66])
for attempt in range(12):
    bpy.context.view_layer.update();ps=[world_to_camera_view(scene,camera,p) for p in fit_points]
    x0=min(p.x for p in ps);x1=max(p.x for p in ps);y0=min(p.y for p in ps);y1=max(p.y for p in ps)
    if .029<x0<x1<.971 and .109<y0<y1<.901:break
    zoom=max(1,(x1-x0)/.94,(y1-y0)/.79)*1.005
    camera.location=aim+(camera.location-aim)*zoom
    width=(camera.location-aim).length*camera.data.sensor_width/camera.data.lens
    camera.location+=right*((x0+x1)/2-.5)*width+up*((y0+y1)/2-.505)*width/(16/9)
else:raise RuntimeError(('Unable to fit twelve future riders',x0,y0,x1,y1))
bpy.data.objects['look label'].data.body='12 HORSES / 4 RIDERS BUILT / 8 OPEN'
ui=bpy.data.collections['GRAPHICS • minimal']
for ob in list(ui.objects):
    if ob.name.endswith('label') and ob.name!='look label':bpy.data.objects.remove(ob,do_unlink=True)
bpy.data.objects['joke'].data.body='CAPACITY TEST • EIGHT RIDERS STILL TO BUILD'
bpy.data.objects['joke'].data.size=.22
scene['rider_count']=4;scene['horse_count']=12;scene['casting_status']='Four finished riders. Eight open numbered horses; casting proposals in roster.json.'
scene.frame_set(1);bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
bounds=[]
for hr in horse_roots:
    body=next(o for o in hr.children if o.type=='MESH' and len(o.data.vertices)>3000)
    ob=body.evaluated_get(graph);ps=[world_to_camera_view(scene,camera,ob.matrix_world@Vector(c)) for c in ob.bound_box]
    box=[min(p.x for p in ps),min(p.y for p in ps),max(p.x for p in ps),max(p.y for p in ps)]
    bounds.append({'horse':hr.name,'screen_bounds':box})
assert all(.01<b['screen_bounds'][0]<b['screen_bounds'][2]<.99 and .10<b['screen_bounds'][1]<b['screen_bounds'][3]<.91 for b in bounds),bounds
scene.frame_set(1);bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(root/'field_12_capacity.blend'))
scene.render.filepath=str(root/'field_12_capacity.png');start=time.perf_counter();bpy.ops.render.render(write_still=True)
report={'horses':12,'finished_riders':4,'open_rider_slots':8,'render_seconds':time.perf_counter()-start,
    'resolution':[1600,900],'bounds':bounds,'full_height_future_rider_bounds':[x0,y0,x1,y1],
    'purpose':'Layout capacity including full head-height envelopes. Eight riders are not built yet.'}
(root/'capacity_validation.json').write_text(json.dumps(report,indent=2))
print('CAPACITY_TEST_PASSED',json.dumps(report),flush=True)
