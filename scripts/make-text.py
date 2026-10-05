#!/usr/bin/env python

from argparse import ArgumentParser

def generate(s, start, end):

    box_size = 100
    width = len(s) * box_size
    extra = (box_size / 5) * 2
    big_font = box_size * 0.6;
    small_font = big_font / 2;

    substring = range(start or 0, end or len(s)) if start or end else range(0,0)

    print(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {box_size + extra}">')

    print(f'''
  <style>
    .box {{ fill: none; stroke: #aaa; stroke-width: 2; }}
    .shaded {{ fill: #ddd; }}
    text {{ font-family: Arial, sans-serif; font-size: {big_font}px; text-anchor: middle; dominant-baseline: central; }}
    text.index {{ font-size: {small_font}px; }}
  </style>

''')

    for i, c in enumerate(s):
        boxclass = "box shaded" if i in substring else "box"

        print(f'  <rect class="{boxclass}" x="{i * box_size}" y="0" width="{box_size}" height="{box_size}" />')
        print(f'  <text x="{i * box_size + box_size / 2}" y="{box_size / 2}">{c}</text>')
        print(f'  <text class="index" x="{i * box_size + box_size / 2}" y="{box_size + extra / 2}">{i}</text>')
        print()


    print('''

</svg>
''')


if __name__ == "__main__":

    parser = ArgumentParser(
        prog="make-text",
        description="Make an SVG of a string with a possible substring.",
    )

    parser.add_argument("text", help="Text to show")
    parser.add_argument("-s", "--start", type=int, help="Start of substring")
    parser.add_argument("-e", "--end", type=int, help="End of substring")

    args = parser.parse_args()

    print(args)

    generate(args.text, args.start, args.end)
