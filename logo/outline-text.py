# /// script
# requires-python = ">=3.13"
# dependencies = ["fonttools", "uharfbuzz"]
# ///
"""Convert the logo's <text> wordmark to outlined <path>s so it renders
the same everywhere, independent of the reader's installed fonts.

  uv run logo/outline-text.py logo/bhsawesome-logo.svg VarelaRound-Regular.ttf \\
      logo/bhsawesome-logo-varela.svg 135 165

Args: source svg, font file, output svg, font size, baseline y (optional).
Varela Round is at https://github.com/google/fonts/raw/main/ofl/varelaround/VarelaRound-Regular.ttf
"""
import re, sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

src, fontfile, out = sys.argv[1:4]
FONT_SIZE, LETTER_SPACING = float(sys.argv[4]), -3

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
    y, fill, text = float(sys.argv[5]) if len(sys.argv) > 5 else float(m[2]), m[3], m[4]
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
    return f'<path fill="{fill}" d="{pen.getCommands()}"/><!-- {text} -->'

svg = re.sub(r'<text x="([\d.]+)"\s+y="([\d.]+)" fill="([^"]+)">([^<]+)</text>', outline, svg)
svg = re.sub(r'\s*<style>.*?</style>', '', svg, flags=re.S)
svg = svg.replace('<g class="wordmark">', f'<g class="wordmark">\n    <!-- Varela Round (SIL OFL), {FONT_SIZE:g}px, letter-spacing -3px, converted to outlines -->')
open(out, 'w').write(svg)
print('end x', pen_x)
