"""
Buat animasi "hujan kode" bertema IT sebagai APNG yang berputar tanpa henti (latar untuk gaya Flex `latar`).

Pakai:  python3 scripts/make-coderain.py [keluaran.png] [ukuran=320] [warna=hijau|biru|ungu|oranye]
Butuh:  pip install pillow
Hasil:  default assets/latar-coderain.png (sekitar 460 KB pada 320 px). PERHATIAN: Flex hanya memutar APNG sampai 300 KB;
        kecilkan ukuran (mis. 200) atau pakai scripts/gif-to-apng.ts. Unggah ke hostingmu (https), lalu pakai URL-nya:
        tab flex Judul | Isi | gaya:latar | gif:https://...
"""
import random
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else "assets/latar-coderain.png"
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 320
PALETTE = {
    "hijau": (0.08, 1.0, 0.55),
    "biru": (0.15, 0.65, 1.0),
    "ungu": (0.75, 0.35, 1.0),
    "oranye": (1.0, 0.6, 0.15),
}
RGB = PALETTE[sys.argv[3] if len(sys.argv) > 3 else "hijau"]

CELL, TAIL = 16, 9
COLS = ROWS = SIZE // CELL
L = ROWS + TAIL  # satu siklus penuh; semua kecepatan bilangan bulat agar putaran mulus
rng = random.Random(7)
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 14)
glyphs = "01{}</>;=#$&*+-"
grid = [[rng.choice(glyphs) for _ in range(ROWS)] for _ in range(COLS)]
cols = [{"start": rng.randrange(L), "speed": rng.choice([1, 1, 2, 3])} for _ in range(COLS)]


def frame(f: int) -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), (3, 10, 8))
    draw = ImageDraw.Draw(img)
    for c in range(COLS):
        head = (cols[c]["start"] + cols[c]["speed"] * f) % L
        for r in range(ROWS):
            dist = (head - r) % L
            if dist >= TAIL:
                continue
            if dist == 0:
                color = (225, 255, 235)
            else:
                fade = 1 - dist / TAIL
                color = tuple(int(255 * channel * fade) for channel in RGB)
            draw.text((c * CELL + 2, r * CELL), grid[c][r], font=font, fill=color)
    return img


frames = [frame(f) for f in range(L)]
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=70, loop=0, format="PNG")
print(f"{OUT}: {len(frames)} frame, berulang tanpa henti")
