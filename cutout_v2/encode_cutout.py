import bpy,time,json
from pathlib import Path
root=Path(__file__).resolve().parent
scene=bpy.context.scene
scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.fps=24;scene.frame_start=1;scene.frame_end=96
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.sequencer_colorspace_settings.name='sRGB'
editor=scene.sequence_editor_create()
strip=editor.strips.new_image('Cutout race',str(root/'frames'/'0001.png'),channel=1,frame_start=1)
for f in range(2,97):strip.elements.append(f'{f:04d}.png')
speechfile=root/'audio'/'cmon_man.wav'
if speechfile.exists():
    speech=editor.strips.new_sound('Biden • actual recorded quote',str(speechfile),channel=2,frame_start=43)
    speech.volume=1
scene.render.image_settings.media_type='VIDEO';scene.render.image_settings.file_format='FFMPEG'
scene.render.ffmpeg.format='MPEG4';scene.render.ffmpeg.codec='H264';scene.render.ffmpeg.constant_rate_factor='HIGH'
if speechfile.exists():
    scene.render.ffmpeg.audio_codec='AAC';scene.render.ffmpeg.audio_bitrate=192;scene.render.ffmpeg.audio_mixrate=48000
scene.render.filepath=str(root/'streakchat_cutout_v2.mp4')
bpy.ops.render.render(animation=True)
print('CUTOUT_ENCODED',flush=True)
from shutil import copyfile
copyfile(root/'streakchat_cutout_v2.mp4',root/'streakchat_cutout_fixed.mp4')
if speechfile.exists():copyfile(root/'streakchat_cutout_v2.mp4',root/'streakchat_cmon_man.mp4')
