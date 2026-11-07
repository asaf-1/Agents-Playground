#!/usr/bin/env python3
"""Turn recorded frames into the README's GIFs and the presentation PNGs.

record.js takes one screenshot per step of each story and writes a
frames.json beside them. This puts a caption bar on every frame, joins them
into one GIF per story, and saves each story's key frames as 1600px PNGs.

    python scripts/media/make-gifs.py .artifacts/media docs/assets [story ...]

Needs Pillow (pip install pillow). Fails, rather than writing, if a GIF comes
out over the size cap: a README is not the place for a 10 MB animation.
"""

# Type hints are read as text, so the newer syntax works on older Python.
from __future__ import annotations

# JSON, the command line, and paths.
import json
import sys
from pathlib import Path

# Pillow, for drawing and saving images.
from PIL import Image, ImageDraw, ImageFont

# Sizes: the GIF and PNG widths, the caption bar's height, each frame's time,
# and the GIF size cap.
GIF_WIDTH = 1100
PNG_WIDTH = 1600
CAPTION_HEIGHT = 56
FRAME_MS = 2300
MAX_GIF_BYTES = 3_000_000

# Playground Bank's colours: the caption bar is the brand violet.
BAR = (44, 22, 92)
BAR_EDGE = (124, 58, 237)
TEXT = (255, 255, 255)

# Fonts to try; the first that loads wins.
FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeuisb.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "DejaVuSans.ttf",
]


# The first font that loads at this size, or Pillow's default.
def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


# A frame scaled to a width, with the caption bar above it.
def captioned(image: Image.Image, caption: str, width: int) -> Image.Image:
    # Scale the screenshot.
    ratio = width / image.width
    body = image.convert("RGB").resize(
        (width, round(image.height * ratio)), Image.Resampling.LANCZOS
    )
    # The bar, scaled with the width, and the screenshot under it.
    bar = round(CAPTION_HEIGHT * width / GIF_WIDTH)
    out = Image.new("RGB", (width, body.height + bar), BAR)
    out.paste(body, (0, bar))

    # Draw the bar's edge and the caption.
    draw = ImageDraw.Draw(out)
    draw.rectangle([0, bar - 3, width, bar], fill=BAR_EDGE)
    face = font(round(21 * width / GIF_WIDTH))
    top = (bar - 3 - face.size) // 2 - 2
    draw.text((round(22 * width / GIF_WIDTH), top), caption, fill=TEXT, font=face)

    return out


# One story: a GIF of its frames, and a PNG of each key frame.
def make_story(frames_dir: Path, assets: Path) -> None:
    # The story's frames.json.
    manifest = json.loads((frames_dir / "frames.json").read_text(encoding="utf8"))
    story = manifest["story"]
    frames = []
    durations = []

    # Each frame captioned for the GIF, and held for its time.
    for frame in manifest["frames"]:
        image = Image.open(frames_dir / frame["file"])
        frames.append(captioned(image, frame["caption"], GIF_WIDTH))
        durations.append(FRAME_MS * int(frame.get("hold", 1)))

        # A key frame is also saved as a PNG.
        if frame.get("key"):
            png = assets / f"{frame['key']}.png"
            captioned(image, frame["caption"], PNG_WIDTH).save(png, optimize=True)
            print(f"  {png.name} {png.stat().st_size // 1024} KB")

    # One palette per frame, from the frame itself: a dark UI with gradients
    # bands badly on a shared palette.
    paletted = [
        frame.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        for frame in frames
    ]
    # Save the frames as one looping GIF.
    gif = assets / f"{story}.gif"
    paletted[0].save(
        gif,
        save_all=True,
        append_images=paletted[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=1,
    )

    # Its size.
    size = gif.stat().st_size
    print(f"  {gif.name} {len(frames)} frames, {size // 1024} KB")

    # Over the cap: delete it and fail.
    if size > MAX_GIF_BYTES:
        gif.unlink()
        raise SystemExit(
            f"{gif.name} is {size // 1024} KB, over the {MAX_GIF_BYTES // 1024} KB cap. "
            "Use fewer frames or a smaller GIF_WIDTH."
        )


# The README's one GIF: every story in this order, at a size a README can carry.
COMBINED_NAME = "see-it"
COMBINED_ORDER = ["bank-tour", "practice-mode", "bank-cards", "developer-keys", "runner", "runner-reports"]
COMBINED_WIDTH = 900
MAX_COMBINED_BYTES = 4_000_000


# The README's GIF: every story's frames, one after another.
def make_combined(frames_root: Path, assets: Path) -> None:
    frames = []
    durations = []

    # Each story's frames, captioned at this width.
    for name in COMBINED_ORDER:
        manifest = json.loads((frames_root / name / "frames.json").read_text(encoding="utf8"))
        for frame in manifest["frames"]:
            image = Image.open(frames_root / name / frame["file"])
            frames.append(captioned(image, frame["caption"], COMBINED_WIDTH))
            durations.append(FRAME_MS * int(frame.get("hold", 1)))

    # One palette per frame, then save them as one looping GIF.
    paletted = [
        frame.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        for frame in frames
    ]
    gif = assets / f"{COMBINED_NAME}.gif"
    paletted[0].save(
        gif,
        save_all=True,
        append_images=paletted[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=1,
    )

    # Its size.
    size = gif.stat().st_size
    print(f"  {gif.name} {len(frames)} frames, {size // 1024} KB")

    # Over the cap: delete it and fail.
    if size > MAX_COMBINED_BYTES:
        gif.unlink()
        raise SystemExit(
            f"{gif.name} is {size // 1024} KB, over the {MAX_COMBINED_BYTES // 1024} KB cap. "
            "Use a smaller COMBINED_WIDTH."
        )


# Make every story's GIF, then the combined one.
def main(argv: list[str]) -> int:
    # Too few arguments: show how to run it.
    if len(argv) < 2:
        print(__doc__)
        return 2

    # The frames folder, where to write, and which stories.
    frames_root = Path(argv[0])
    assets = Path(argv[1])
    wanted = argv[2:]
    assets.mkdir(parents=True, exist_ok=True)

    # The stories recorded so far, or only the ones asked for.
    stories = sorted(path for path in frames_root.iterdir() if (path / "frames.json").exists())
    if wanted:
        stories = [path for path in stories if path.name in wanted]

    # None: say so.
    if not stories:
        print(f"no recorded stories under {frames_root}")
        return 1

    # Each story's GIF and PNGs.
    for story in stories:
        print(f"[gif] {story.name}")
        make_story(story, assets)

    # The README shows one GIF: every story, one after another.
    if all((frames_root / name / "frames.json").exists() for name in COMBINED_ORDER):
        print(f"[gif] {COMBINED_NAME} (every story in turn)")
        make_combined(frames_root, assets)

    return 0


# Run when started directly.
if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
