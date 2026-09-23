# /// script
# requires-python = ">=3.13"
# dependencies = ["fonttools", "uharfbuzz"]
# ///
"""Convert the logo's <text> wordmark to outlined <path>s so it renders
the same everywhere, independent of the reader's installed fonts.

  uv run logo/outline-text.py logo/bhsawesome-logo-old.svg VarelaRound-Regular.ttf \\
      logo/bhsawesome-logo.svg --stroke 7 --letter-spacing -3 \\
      --viewbox '13 0 1087 221'

--stroke adds a same-color round-joined stroke to embolden a font that
has no bold weight; it widens each glyph by the stroke width, so raise
--letter-spacing to match.

--viewbox crops the canvas to the artwork (plus the ~8px margin the
old PNG logo had) so it fills the banner's box.
Varela Round is at https://github.com/google/fonts/raw/main/ofl/varelaround/VarelaRound-Regular.ttf
"""
import argparse, re
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('fontfile')
ap.add_argument('out')
ap.add_argument('--size', type=float, default=150, help='font size in px')
ap.add_argument('--baseline', type=float, help="override the <text>s' y")
ap.add_argument('--letter-spacing', type=float, default=-3)
ap.add_argument('--viewbox', help='crop to "x y w h" (also sets width/height)')
ap.add_argument('--stroke', type=float, default=0, help='embolden by this stroke width')
args = ap.parse_args()
src, fontfile, out = args.src, args.fontfile, args.out
FONT_SIZE, LETTER_SPACING = args.size, args.letter_spacing

svg = open(src).read()
font = TTFont(fontfile)
glyphset = font.getGlyphSet()
order = font.getGlyphOrder()
upem = font['head'].unitsPerEm
scale = FONT_SIZE / upem
face = hb.Face(open(fontfile, 'rb').read())
hbfont = hb.Font(face)

pen_x = None
def outline(m):
    global pen_x
    y, fill, text = args.baseline if args.baseline is not None else float(m[2]), m[3], m[4]
    # Flow the colored runs as one word (the source x's were tuned for
    # another font's widths); only the first run's x is honored.
    x = float(m[1]) if pen_x is None else pen_x
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {"kern": True, "liga": True})
    pen = SVGPathPen(glyphset, ntos=lambda v: f"{v:.2f}".rstrip('0').rstrip('.'))
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        gx = x + pos.x_offset * scale
        gy = y - pos.y_offset * scale
        glyphset[order[info.codepoint]].draw(
            TransformPen(pen, (scale, 0, 0, -scale, gx, gy)))
        x += pos.x_advance * scale + LETTER_SPACING
    pen_x = x
    stroke = f' stroke="{fill}" stroke-width="{args.stroke:g}" stroke-linejoin="round"' if args.stroke else ''
    return f'<path fill="{fill}"{stroke} d="{pen.getCommands()}"/><!-- {text} -->'

svg = re.sub(r'<text x="([\d.]+)"\s+y="([\d.]+)" fill="([^"]+)">([^<]+)</text>', outline, svg)
if args.viewbox:
    _, _, w, h = args.viewbox.split()
    svg = re.sub(r'<svg([^>]*?) width="[^"]*" height="[^"]*" viewBox="[^"]*"',
                 f'<svg\\1 width="{w}" height="{h}" viewBox="{args.viewbox}"', svg, count=1)
svg = re.sub(r'\s*<style>.*?</style>', '', svg, flags=re.S)
svg = svg.replace('<g class="wordmark">', f'<g class="wordmark">\n    <!-- Varela Round (SIL OFL), {FONT_SIZE:g}px, letter-spacing {LETTER_SPACING:g}px, stroke {args.stroke:g}, converted to outlines -->')
open(out, 'w').write(svg)
print('end x', pen_x)
