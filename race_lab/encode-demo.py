"""Convert the actual browser recording into a seekable review MP4 and verify it."""
import json
import subprocess
from pathlib import Path

import imageio_ffmpeg

review = Path(__file__).resolve().parent / "review"
target = review / "race-system-demo.mp4"
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),"-v","error","-y","-i",
    str(review/"race-system-demo.webm"),"-c:v","libx264","-crf","20",
    "-pix_fmt","yuv420p","-movflags","+faststart",str(target)],check=True)
frames = imageio_ffmpeg.read_frames(str(target))
metadata = next(frames)
count = sum(1 for _ in frames)
assert metadata["size"] == (1440,1100)
assert metadata["duration"] >= 26 and count >= 650
recorded = json.loads((review/"recorded-races.json").read_text())
assert len(recorded["races"])==2
assert recorded["races"][0]["outcome"][0] != recorded["races"][1]["outcome"][0]
report = {"decoded_frames":count,"resolution":list(metadata["size"]),
    "encoded_fps":metadata["fps"],"duration_seconds":metadata["duration"],
    "bytes":target.stat().st_size,"recorded_races":recorded["races"],
    "note":"Actual Chromium playback recording; encoding FPS is not a runtime performance benchmark."}
(review/"demo-validation.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({k:report[k] for k in ["decoded_frames","resolution","duration_seconds","bytes"]}))
