import json,re,shutil
from pathlib import Path
root=Path(__file__).resolve().parent
shutil.copyfile(root/'frames'/'0001.png',root/'look_test.png')
page=root/'preview.html'
html=page.read_text(encoding='utf-8')
html=html.replace('streakchat_cutout_v2.mp4','streakchat_cutout_fixed.mp4')
html=html.replace('<button onclick="sample.currentTime=2.25;sample.pause()">Head and jaw reaction</button>',
    '<button onclick="sample.currentTime=0;sample.pause()">Cap on head</button>'
    '<button onclick="sample.currentTime=1.292;sample.pause()">Grab cap</button>'
    '<button onclick="sample.currentTime=1.667;sample.pause()">Throw</button>'
    '<button onclick="sample.currentTime=2.458;sample.pause()">Head and jaw reaction</button>')
page.write_text(html,encoding='utf-8')
metrics=json.loads((root/'animation_timing.json').read_text())
doc=root/'README.md'
text=doc.read_text(encoding='utf-8')
text=re.sub(r'in \*\*[\d.]+ seconds\*\*, averaging \*\*[\d.]+ seconds per frame\*\*',
    f'in **{metrics["total_seconds"]:.2f} seconds**, averaging **{metrics["mean_seconds_per_frame"]:.3f} seconds per frame**',text)
text=text.replace('- **streakchat_cutout_v2.mp4**:', '- **streakchat_cutout_v2.mp4** (also saved as **streakchat_cutout_fixed.mp4**):')
doc.write_text(text,encoding='utf-8')
print('Fixed preview updated',metrics['total_seconds'])
