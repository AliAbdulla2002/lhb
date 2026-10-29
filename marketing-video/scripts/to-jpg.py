# Converts the raw PNG captures to the JPGs the video uses, cropping the tall scroll shots.
import os
from PIL import Image

d = os.path.join(os.path.dirname(__file__), "..", "public", "screens") + os.sep
crops = {"menu-full": ("menu-scroll", 9000), "product-full": ("product-scroll", 4200), "pickup-after": ("pickup-after", 2500)}
for f in sorted(os.listdir(d)):
    if not f.endswith(".png"):
        continue
    name = f[:-4]
    im = Image.open(d + f).convert("RGB")
    out, h = crops.get(name, (name, im.height))
    im.crop((0, 0, im.width, min(im.height, h))).save(d + out + ".jpg", quality=88)
    os.remove(d + f)
print("ok")
