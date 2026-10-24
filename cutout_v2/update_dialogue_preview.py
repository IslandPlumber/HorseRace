from pathlib import Path
root=Path(__file__).resolve().parent
path=root/'preview.html'
html=path.read_text(encoding='utf-8')
html=html.replace('streakchat_cutout_fixed.mp4','streakchat_cmon_man.mp4')
if 'id="recorded-audio"' not in html:
    section='''<section id="recorded-audio"><h2>Original recorded sound clips</h2>
<p>C’mon, man!</p><audio id="cmon" controls preload="metadata" src="audio/cmon_man.wav"></audio>
<p>I got hairy legs</p><audio id="hairy" controls preload="metadata" src="audio/hairy_legs.wav"></audio>
<p><a href="https://youtu.be/3qUgMGN04wU?t=35" target="_blank" rel="noopener">Your source video</a></p></section>'''
    html=html.replace('<p id="timing">',section+'<p id="timing">')
html=html.replace('separate face and jaw pieces, rigid suits, and textured horses.',
    'separate face and jaw pieces, rigid suits, textured horses, and the actual recorded “C’mon, man!” at the hat throw.')
path.write_text(html,encoding='utf-8')
print('Recorded audio preview updated')
