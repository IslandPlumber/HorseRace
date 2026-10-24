import json,struct
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent
for f in range(1,97):
    with Image.open(root/'frames'/f'{f:04d}.png') as im:
        assert im.size==(1280,800),(f,im.size)
        im.verify()
data=(root/'streakchat_cutout_v2.mp4').read_bytes()
def boxes(a,b):
    while a+8<=b:
        n,t=struct.unpack_from('>I4s',data,a)
        assert n>=8 and a+n<=b
        yield t,a+8,a+n
        a+=n
info={}
for t,s,e in boxes(0,len(data)):
    if t==b'moov':
        for t1,s1,e1 in boxes(s,e):
            if t1==b'mvhd':
                at=s1+(20 if data[s1]==1 else 12)
                rate=struct.unpack_from('>I',data,at)[0]
                duration=struct.unpack_from('>Q' if data[s1]==1 else '>I',data,at+4)[0]
                info['seconds']=duration/rate
            if t1==b'trak':
                for t2,s2,e2 in boxes(s1,e1):
                    if t2==b'tkhd':
                        w,h=struct.unpack_from('>II',data,e2-8)
                        if w:info['resolution']=[w/65536,h/65536]
# AAC encoder padding can extend the container by a fraction of one video frame.
assert abs(info['seconds']-4)<.05 and info['resolution']==[1280,800],info
info.update({'verified_frames':96,'video_bytes':len(data)})
(root/'validation.json').write_text(json.dumps(info,indent=2))
print(json.dumps(info,indent=2))
