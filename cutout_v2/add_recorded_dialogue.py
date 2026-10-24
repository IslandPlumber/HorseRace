"""Add the actual recording and drive the cutout jaw from its volume envelope."""
import bpy,json,math
from pathlib import Path
root=Path(__file__).resolve().parent
scene=bpy.context.scene
envelope=json.loads((root/'audio'/'cmon_man_envelope.json').read_text())
jaw=bpy.data.objects['Biden • jaw']
for f,value in enumerate(envelope['frames'],1):
    jaw.location.y=-(.115*math.sqrt(value)) if value>.045 else 0
    jaw.keyframe_insert(data_path='location',frame=f)

editor=scene.sequence_editor_create()
for strip in list(editor.strips):
    if strip.name=='Biden • recorded Cmon man':editor.strips.remove(strip)
speech=editor.strips.new_sound('Biden • recorded Cmon man',str(root/'audio'/'cmon_man.wav'),channel=1,frame_start=43)
speech.volume=1
if hasattr(speech.sound,'pack'):speech.sound.pack()
scene.render.use_sequencer=False

ui=bpy.data.collections['GRAPHICS • minimal']
for name in ['dialogue • caption','dialogue • caption card']:
    old=bpy.data.objects.get(name)
    if old:bpy.data.objects.remove(old,do_unlink=True)
data=bpy.data.curves.new('dialogue • caption','FONT')
data.body="BIDEN: C'MON, MAN!";data.size=.24;data.align_x='CENTER';data.align_y='CENTER'
caption=bpy.data.objects.new('dialogue • caption',data);ui.objects.link(caption)
caption.parent=scene.camera;caption.location=(0,-2.40,-6.96)
data.materials.append(bpy.data.materials['graphic cream'])
me=bpy.data.meshes.new('dialogue • caption card')
me.from_pydata([(-1.60,-2.60,-7),(1.60,-2.60,-7),(1.60,-2.20,-7),(-1.60,-2.20,-7)],[],[(0,1,2,3)])
card=bpy.data.objects.new('dialogue • caption card',me);ui.objects.link(card);card.parent=scene.camera
me.materials.append(bpy.data.materials['graphic ink'])
for ob in [caption,card]:
    for frame,hidden in [(1,True),(42,True),(43,False),(70,False),(71,True),(96,True)]:
        ob.hide_render=hidden;ob.keyframe_insert(data_path='hide_render',frame=frame)
        ob.hide_viewport=hidden;ob.keyframe_insert(data_path='hide_viewport',frame=frame)
scene['dialogue_source']='https://www.youtube.com/watch?v=3qUgMGN04wU • original English recording, source 37.34–38.44 seconds'
scene['dialogue_timing']='Cmon man starts at 1.75 sec, after the frame-41 hat release. Separate hairy-legs clip saved in audio/.'
scene.timeline_markers.new('BIDEN: CMON MAN • ORIGINAL RECORDING',frame=43)
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'streakchat_cutout_v2.blend'))
print('RECORDED_DIALOGUE_ADDED',flush=True)
