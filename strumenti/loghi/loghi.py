# Proposta di loghi per tutte le app Kairos: un simbolo per app dentro la stessa cornice, con il nome scritto.
# Disegni generati qui (nessuna immagine presa da internet). Carattere: Chakra Petch (licenza aperta OFL).
#   python3 loghi.py <cartella dei caratteri> <cartella di uscita>
# Esce: il foglio con tutti i loghi, e per ogni app (cartella app/<sigla>/):
#   ic_launcher_{48,72,96,144,192}.png  icona di avvio quadrata (mipmap mdpi…xxxhdpi), senza trasparenza
#   banner.png                          banner TV 320x180 con simbolo e nome (drawable-xhdpi)
#   store.webp                          icona per l'elenco del Kairos Store (192x192, senza cornice: la ritaglia lo Store)
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
FONT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
S = 1024  # il simbolo si disegna grande e poi si riduce (bordi lisci)
k = S / 512.
APPS = [  # sigla, nome, colore 1, colore 2
    ("pro", "PRO", (255, 201, 77), (255, 122, 61)), ("tv", "TV", (92, 225, 255), (41, 121, 255)),
    ("premium", "PREMIUM", (179, 140, 255), (255, 95, 215)), ("lite", "LITE", (44, 245, 177), (182, 255, 107)),
    ("xc", "XC", (255, 106, 31), (255, 45, 111)), ("plus", "PLUS", (91, 140, 255), (156, 107, 255)),
    ("nova", "NOVA", (232, 244, 255), (255, 61, 203)), ("ultimate", "ULTIMATE", (255, 77, 109), (255, 209, 102)),
    ("store", "STORE", (25, 195, 214), (92, 225, 255)), ("portal", "PORTAL", (92, 225, 255), (156, 140, 255)),
    ("smart", "SMART", (92, 225, 255), (245, 139, 221)),
]

def P(pts): return [(x * k, y * k) for x, y in pts]
def line(d, pts, w):
    w = int(w * k); d.line(P(pts), fill=255, width=w, joint="curve")
    for x, y in pts: d.ellipse([x * k - w / 2, y * k - w / 2, x * k + w / 2, y * k + w / 2], fill=255)
def ring(d, cx, cy, r, w): d.ellipse([(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k], outline=255, width=int(w * k))
def poly_out(d, pts, w): line(d, pts + pts[:1], w)

def simbolo(name):
    m = Image.new("L", (S, S), 0); d = ImageDraw.Draw(m)
    if name == "pro":
        poly_out(d, [(256 + 176 * math.cos(math.radians(a)), 256 + 176 * math.sin(math.radians(a))) for a in range(-90, 270, 60)], 30)
        d.polygon(P([(212, 176), (346, 256), (212, 336)]), fill=255)
    elif name == "tv":
        d.rounded_rectangle([92 * k, 150 * k, 420 * k, 366 * k], radius=30 * k, outline=255, width=int(30 * k))
        line(d, [(190, 410), (322, 410)], 30); line(d, [(202, 84), (256, 146), (310, 84)], 26)
        d.polygon(P([(226, 214), (300, 258), (226, 302)]), fill=255)
    elif name == "premium":
        poly_out(d, [(256, 84), (428, 214), (256, 430), (84, 214)], 30)
        line(d, [(84, 214), (428, 214)], 18); line(d, [(186, 214), (256, 84), (326, 214)], 18); line(d, [(186, 214), (256, 430), (326, 214)], 18)
    elif name == "lite":
        d.polygon(P([(300, 66), (126, 290), (236, 290), (204, 446), (386, 214), (272, 214)]), fill=255)
    elif name == "xc":
        line(d, [(92, 132), (240, 380)], 44); line(d, [(240, 132), (92, 380)], 44)
        d.arc([252 * k, 132 * k, 500 * k, 380 * k], 52, 308, fill=255, width=int(44 * k))
    elif name == "plus":
        ring(d, 256, 256, 180, 28); line(d, [(256, 164), (256, 348)], 44); line(d, [(164, 256), (348, 256)], 44)
    elif name == "nova":
        d.polygon(P([(256, 44), (292, 220), (468, 256), (292, 292), (256, 468), (220, 292), (44, 256), (220, 220)]), fill=255)
        ring(d, 256, 256, 150, 10)
        for a in (45, 135, 225, 315): x, y = 256 + 196 * math.cos(math.radians(a)), 256 + 196 * math.sin(math.radians(a)); d.ellipse([(x - 12) * k, (y - 12) * k, (x + 12) * k, (y + 12) * k], fill=255)
    elif name == "ultimate":
        line(d, [(146, 150), (146, 300)], 46); line(d, [(366, 150), (366, 300)], 46)
        d.arc([123 * k, 168 * k, 389 * k, 434 * k], 0, 180, fill=255, width=int(46 * k))
        d.polygon(P([(256, 60), (286, 104), (256, 148), (226, 104)]), fill=255)
    elif name == "store":
        for x, y in ((104, 104), (276, 104), (104, 276)): d.rounded_rectangle([x * k, y * k, (x + 132) * k, (y + 132) * k], radius=22 * k, outline=255, width=int(28 * k))
        line(d, [(342, 280), (342, 398)], 32); line(d, [(292, 350), (342, 400), (392, 350)], 32)
    elif name == "portal":
        o = Image.new("L", (S, S), 0); ImageDraw.Draw(o).ellipse([22 * k, 164 * k, 490 * k, 348 * k], outline=255, width=int(16 * k))
        m.paste(o.rotate(20, resample=Image.BICUBIC)); d = ImageDraw.Draw(m)
        d.polygon(P([(194, 124), (372, 124), (372, 344), (328, 388), (150, 388), (150, 168)]), fill=0)
        poly_out(d, [(194, 124), (372, 124), (372, 344), (328, 388), (150, 388), (150, 168)], 22)
        line(d, [(222, 190), (222, 322)], 30); line(d, [(302, 190), (232, 256), (302, 322)], 30)
    else:  # smart
        for x in (74, 202, 330): d.polygon(P([(x + 76, 96), (x + 172 if x < 330 else x + 140, 96), (x + 96 if x < 330 else x + 64, 416), (x, 416)]), fill=255)
    return m

def _fondo(c1):
    yy, xx = np.mgrid[0:S, 0:S].astype(float)
    d2 = np.hypot((xx - S * .5) / S, (yy - S * .6) / S)
    tb = np.clip(d2 / .72, 0, 1)[..., None]
    base = (np.array(c1) * .16 + np.array([8, 10, 18])) * (1 - tb) + np.array([4, 5, 10.]) * tb
    return Image.fromarray(base.astype(np.uint8)).convert("RGBA")
def _sfumatura(c1, c2):
    yy, xx = np.mgrid[0:S, 0:S].astype(float)
    t = np.clip((xx + yy) / (2 * S), 0, 1)[..., None]
    return Image.fromarray((np.array(c1) * (1 - t) + np.array(c2) * t).astype(np.uint8)).convert("RGBA")

def _disegno(app, scala=.72, cornice=True, margine=14):
    """fondo scuro + simbolo luminoso (+ cornice arrotondata), a S x S, senza ritaglio"""
    name, _, c1, c2 = app
    im, g = _fondo(c1), _sfumatura(c1, c2)
    inner = simbolo(name).resize((int(S * scala), int(S * scala)), Image.LANCZOS)
    m = Image.new("L", (S, S), 0); m.paste(inner, ((S - inner.width) // 2, (S - inner.height) // 2))
    glow = m.filter(ImageFilter.GaussianBlur(S * .035))
    im.paste(g, (0, 0), Image.eval(glow, lambda v: int(v * .75)))
    im.paste(g, (0, 0), m)
    core = Image.eval(m.filter(ImageFilter.GaussianBlur(2)), lambda v: int(v * .28)); im.paste(Image.new("RGBA", (S, S), (255, 255, 255, 255)), (0, 0), core)
    if cornice:  # quadrato arrotondato con il bordo luminoso
        fr = Image.new("L", (S, S), 0); ImageDraw.Draw(fr).rounded_rectangle([margine, margine, S - margine, S - margine], radius=int(S * .2), outline=255, width=12)
        im.paste(g, (0, 0), Image.eval(fr.filter(ImageFilter.GaussianBlur(10)), lambda v: int(v * .7))); im.paste(g, (0, 0), fr)
    return im

def icona(app, px):
    """il logo come nel foglio: cornice sul bordo, angoli trasparenti"""
    im = _disegno(app)
    mask = Image.new("L", (S, S), 0); ImageDraw.Draw(mask).rounded_rectangle([8, 8, S - 8, S - 8], radius=int(S * .2), fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0)); out.paste(im, (0, 0), mask)
    return out.resize((px, px), Image.LANCZOS)

def avvio(app, px):
    """icona di avvio: quadrata e piena (niente trasparenza), con la cornice un po' dentro; fuori dalla cornice resta scuro"""
    im = _disegno(app, scala=.66, margine=44)
    out = Image.new("RGBA", (S, S), (4, 5, 10, 255))
    mask = Image.new("L", (S, S), 0); ImageDraw.Draw(mask).rounded_rectangle([38, 38, S - 38, S - 38], radius=int(S * .2), fill=255)
    out.paste(im, (0, 0), mask)
    # il bagliore della cornice sfuma anche fuori, come nel foglio
    name, _, c1, c2 = app
    fr = Image.new("L", (S, S), 0); ImageDraw.Draw(fr).rounded_rectangle([44, 44, S - 44, S - 44], radius=int(S * .2), outline=255, width=12)
    out.paste(_sfumatura(c1, c2), (0, 0), Image.eval(fr.filter(ImageFilter.GaussianBlur(16)), lambda v: int(v * .45)))
    out.paste(_sfumatura(c1, c2), (0, 0), fr)
    return out.convert("RGB").resize((px, px), Image.LANCZOS)

def store(app, px=192):
    """icona per l'elenco dello Store: piena e senza cornice (angoli e bagliore li mette la scheda dello Store)"""
    return _disegno(app, scala=.68, cornice=False).convert("RGB").resize((px, px), Image.LANCZOS)

def scritta(d, x, y, s, f, col, passo):
    for ch in s:
        d.text((x, y), ch, font=f, fill=col); x += d.textlength(ch, font=f) + passo
    return x
def larga(d, s, f, passo): return sum(d.textlength(ch, font=f) + passo for ch in s) - passo

def banner(app, w=320, h=180):
    """banner per la schermata Home delle TV: simbolo a sinistra, KAIROS e nome dell'app a destra"""
    name, label, c1, c2 = app
    K = 4; W, H = w * K, h * K
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    t = np.clip(np.hypot((xx - W * .22) / W, (yy - H * .5) / H * .7) / .75, 0, 1)[..., None]
    bg = (np.array(c1) * .13 + np.array([8, 10, 18])) * (1 - t) + np.array([4, 5, 10.]) * t
    im = Image.fromarray(bg.astype(np.uint8)).convert("RGBA")
    ic = icona(app, int(H * .62)); im.paste(ic, (int(W * .065), (H - ic.height) // 2), ic)
    d = ImageDraw.Draw(im)
    x0, largo = int(W * .445), int(W * .46)
    fk = ImageFont.truetype(os.path.join(FONT, "chakra_semibold.ttf"), int(H * .195))
    scritta(d, x0, int(H * .235), "KAIROS", fk, (255, 255, 255), int(H * .026))
    d.rectangle([x0 + 4, int(H * .505), x0 + int(W * .12), int(H * .505) + max(4, K * 2)], fill=c1)
    px, passo = int(H * .195), int(H * .05)
    while True:
        fn = ImageFont.truetype(os.path.join(FONT, "chakra_medium.ttf"), px)
        if larga(d, label, fn, passo) <= largo or px < 40: break
        px -= 4; passo = max(int(H * .012), passo - 3)
    scritta(d, x0, int(H * .55), label, fn, tuple(int(a * .62 + b * .38) for a, b in zip(c1, (255, 255, 255))), passo)
    return im.convert("RGB").resize((w, h), Image.LANCZOS)

f1 = ImageFont.truetype(os.path.join(FONT, "chakra_semibold.ttf"), 78)
f2 = ImageFont.truetype(os.path.join(FONT, "chakra_light.ttf"), 78)
CW, CH, COLS = 800, 300, 3
rows = (len(APPS) + COLS - 1) // COLS
sheet = Image.new("RGB", (CW * COLS + 80, CH * rows + 80), (6, 7, 12))
for i, app in enumerate(APPS):
    name, label, c1, c2 = app
    x0, y0 = 40 + (i % COLS) * CW, 40 + (i // COLS) * CH
    ic = icona(app, 232)
    sheet.paste(ic, (x0 + 10, y0 + 34), ic)
    ic.save(os.path.join(OUT, "kairos-%s.png" % name))
    icona(app, 512).save(os.path.join(OUT, "kairos-%s-512.png" % name))
    d = ImageDraw.Draw(sheet)
    scritta(d, x0 + 270, y0 + 50, "KAIROS", f1, (255, 255, 255), 12)
    d.rectangle([x0 + 274, y0 + 152, x0 + 274 + 150, y0 + 156], fill=c1)
    fs = f2 if d.textlength(label, font=f2) + 30 * len(label) < 500 else ImageFont.truetype(os.path.join(FONT, "chakra_light.ttf"), 60)
    scritta(d, x0 + 270, y0 + 166, label, fs, tuple(int(a * .55 + b * .45) for a, b in zip(c1, (255, 255, 255))), 16 if fs is f2 else 10)
sheet.save(os.path.join(OUT, "loghi-kairos-proposta.jpg"), quality=92)
print("fatto", sheet.size)

# file per le app e per lo Store
for app in APPS:
    dd = os.path.join(OUT, "app", app[0]); os.makedirs(dd, exist_ok=True)
    for px in (48, 72, 96, 144, 192): avvio(app, px).save(os.path.join(dd, "ic_launcher_%d.png" % px), optimize=True)
    avvio(app, 512).save(os.path.join(dd, "ic_launcher_512.png"), optimize=True)
    banner(app).save(os.path.join(dd, "banner.png"), optimize=True)
    store(app).save(os.path.join(dd, "store.webp"), quality=90, method=6)
print("file per le app:", len(APPS))
