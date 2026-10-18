#!/usr/bin/env python3
"""P1.5 rendered-pixel evidence — reads the ACTUAL PNG bytes (not computed
style) so every number in the critique is something the capture really shows.

For each capture: paper/ink luminance of named regions (5th/95th percentile of
the band), the approximate rendered contrast ratio of that band, and a full-frame
mean luminance. Regions are given in CSS px and scaled by the device pixel ratio
read from the capture width.
"""
import json
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CAPS = os.path.join(HERE, 'p15-captures')

def lum(px):
    r, g, b = px[0] / 255, px[1] / 255, px[2] / 255
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def ratio(l1, l2):
    hi, lo = max(l1, l2), min(l1, l2)
    return round((hi + 0.05) / (lo + 0.05), 2)

def band(img, x0, y0, x1, y1, dsf):
    px = img.load()
    vals = []
    for y in range(int(y0 * dsf), min(int(y1 * dsf), img.height), 2):
        for x in range(int(x0 * dsf), min(int(x1 * dsf), img.width), 2):
            vals.append(lum(px[x, y]))
    if not vals:
        return None
    vals.sort()
    paper = vals[int(len(vals) * 0.95)]
    ink = vals[int(len(vals) * 0.05)]
    return {'ink_lum': round(ink, 4), 'paper_lum': round(paper, 4), 'contrast': ratio(paper, ink),
            'mean': round(sum(vals) / len(vals), 4)}

def main():
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(CAPS) if f.endswith('.png'))
    out = {}
    for n in names:
        p = os.path.join(CAPS, n + '.png')
        if not os.path.exists(p):
            print(f'missing {p}')
            continue
        img = Image.open(p).convert('RGB')
        dsf = 2 if img.width > 1600 else 1  # captures are dsf=2
        w_css = img.width / dsf
        bands = {
            'frame': (0, 0, w_css, img.height / dsf),
            'toolbar': (0, 0, w_css, 40),
            'team_strip': (0, 44, 240, 62),
            'team_row_you': (0, 62, 240, 90),
            'team_meta_line': (0, 88, 240, 104),
            'team_empty_zone': (0, 240, 240, 600),
            'feed_header': (240, 46, 700, 70),
            'feed_body': (250, 120, 1000, 320),
            'right_body': (1150, 60, 1456, 300),
            'composer': (250, 740, 1000, 850),
            'dock': (250, 846, 1450, 880),
        }
        res = {}
        for k, (x0, y0, x1, y1) in bands.items():
            if x1 > w_css:
                x1 = w_css
            res[k] = band(img, x0, y0, x1, y1, dsf)
        # point samples of the three column backgrounds at mid-height
        px = img.load()
        pts = {'team_bg': (120, 400), 'center_bg': (600, 400), 'right_bg': (1300, 400)}
        for k, (x, y) in pts.items():
            if x * dsf < img.width:
                res[k + '_rgb'] = px[int(x * dsf), int(y * dsf)]
        if 'addpop' in n:
            res['addpop_bg_rgb'] = px[int(120 * dsf), int(700 * dsf)]
        out[n] = res
    print(json.dumps(out, indent=1))
    with open(os.path.join(CAPS, 'p15-pixel-evidence.json'), 'w') as fh:
        fh.write(json.dumps(out, indent=1))

main()
