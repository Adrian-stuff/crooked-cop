# Renders the board's rail and station art to PNGs in public/assets/board.
# Geometry and colours mirror src/components/Board.tsx and shared/map.ts.
# Usage: python3 scripts/gen-board-assets.py   (needs Pillow)
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/assets/board'
SCALE = 2  # output px per board unit
SS = 4  # supersampling factor for anti-aliasing

LINES = {
    'blue': '#13b5ec',
    'purple': '#9b4fe0',
    'red': '#ff3b55',
    'lime': '#c6ff1a',
    'orange': '#ff6a1a',
    'pink': '#ff3eb5',
    'green': '#2bea1f',
}
WHITE, INK, GOLD = '#ffffff', '#111111', '#f7e11b'
BOARD = '#0f1116'  # --board in src/index.css


def rgba(hex_, a=255):
    h = hex_.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


# The 28% glow pre-blended onto the board colour, so overlapping rail pieces don't stack up.
def glow_of(color):
    c, b = rgba(color), rgba(BOARD)
    return tuple(round(b[i] + (c[i] - b[i]) * 0.28) for i in range(3)) + (255,)


def canvas(w, h):
    k = SCALE * SS
    img = Image.new('RGBA', (w * k, h * k), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img), k


def finish(img, name):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize((img.width // SS, img.height // SS), Image.LANCZOS).save(path)
    print(path.relative_to(ROOT))


def disc(d, k, cx, cy, r, fill):
    d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], fill=fill)


def layer(size):
    return Image.new('RGBA', size, (0, 0, 0, 0))


# Straight, horizontally stretchable rail: 30u glow band under a solid 15u core.
def rail(color):
    w, h = 64, 32
    img, d, k = canvas(w, h)
    d.rectangle([0, (h - 30) / 2 * k, w * k, (h + 30) / 2 * k], fill=glow_of(color))
    d.rectangle([0, (h - 15) / 2 * k, w * k, (h + 15) / 2 * k], fill=rgba(color))
    return img


# Rounded end cap: the right half of the rail's cross-section spun round, flat edge at x=0.
def rail_end(color):
    w, h = 16, 32
    img, d, k = canvas(w, h)
    disc(d, k, 0, h / 2, 15, glow_of(color))
    disc(d, k, 0, h / 2, 7.5, rgba(color))
    return img


# Plain station: r14 white disc with a 4u dark stroke (outer edge r16).
def draw_station(d, k, c):
    disc(d, k, c, c, 16, rgba(INK))
    disc(d, k, c, c, 12, rgba(WHITE))


# Interchange: white / dark / white rings at r24, r19, r13.
def draw_interchange(d, k, c):
    disc(d, k, c, c, 24, rgba(WHITE))
    disc(d, k, c, c, 19, rgba(INK))
    disc(d, k, c, c, 13, rgba(WHITE))


def tile(size, *painters):
    img, d, k = canvas(size, size)
    for p in painters:
        p(img, d, k, size / 2)
    return img


def exit_ring(img, d, k, c):
    # 8u gold ring centred on r30 (r26–r34).
    ring = layer(img.size)
    rd = ImageDraw.Draw(ring)
    disc(rd, k, c, c, 34, rgba(GOLD))
    disc(rd, k, c, c, 26, (0, 0, 0, 0))
    img.alpha_composite(ring)


def artifact(img, d, k, c):
    icon = Image.open(ROOT / 'public/assets/icons/artifact.png').convert('RGBA')
    px = 30 * k
    icon = icon.resize((px, px), Image.LANCZOS)
    img.alpha_composite(icon, (int((c - 15) * k), int((c - 15) * k)))


if __name__ == '__main__':
    for name, color in LINES.items():
        finish(rail(color), f'rails/rail-{name}.png')
        finish(rail_end(color), f'rails/rail-end-{name}.png')
    finish(tile(36, lambda i, d, k, c: draw_station(d, k, c)), 'tiles/station.png')
    finish(tile(52, lambda i, d, k, c: draw_interchange(d, k, c)), 'tiles/interchange.png')
    finish(tile(72, exit_ring, lambda i, d, k, c: draw_station(d, k, c)), 'tiles/exit-station.png')
    finish(tile(36, lambda i, d, k, c: draw_station(d, k, c), artifact), 'tiles/artifact.png')
