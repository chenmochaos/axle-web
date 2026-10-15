#!/usr/bin/env python3
"""把 public/cars/*.jpg 抠成透明背景的 WebP，输出到 public/cars/cut/。

为什么需要抠图：设计要求「车在纯黑舞台上居中，背景统一或不存在」。
图库照片全是「平光记录照」，背景各不相同（幕墙、马路、路人），
无论怎么裁切都无法统一。抠成透明 PNG/WebP 后，背景由界面统一提供。

为什么不用 rembg：rembg 会拖进 opencv / scikit-image / pymatting 一堆重依赖。
U2Net 的前后处理只有几十行，直接用 onnxruntime 跑更可控。

依赖（不污染系统 Python，单独建 venv）：
    python3 -m venv .cutout-venv
    .cutout-venv/bin/pip install onnxruntime numpy pillow scipy
    .cutout-venv/bin/python scripts/cutout-cars.py

模型首次运行自动下载（u2netp，4.6MB）到 ~/.cache/hmdp-cutout/。
模型输入固定 320×320 —— 这是 U2Net 系列的硬限制，不是配置问题，
边缘质量靠后处理（羽化 + 最大连通域）补。

换更好的模型：`--model isnet-general-use`，边缘更锐，但要下 176MB。
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

try:
    import numpy as np
    import onnxruntime as ort
    from PIL import Image, ImageFilter
    from scipy import ndimage
except ImportError as e:  # pragma: no cover - 环境问题，给出可操作的提示
    sys.exit(
        f'缺少依赖: {e.name}\n'
        '  python3 -m venv .cutout-venv\n'
        '  .cutout-venv/bin/pip install onnxruntime numpy pillow scipy'
    )

MODELS = {
    'u2netp': ('u2netp.onnx', 320, 4_574_861),
    'u2net': ('u2net.onnx', 320, 175_997_296),
    'isnet-general-use': ('isnet-general-use.onnx', 1024, 179_875_953),
}
CACHE = Path.home() / '.cache' / 'hmdp-cutout'
MIRROR = 'https://huggingface.co/tomjackson2023/rembg/resolve/main/{name}'

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def ensure_model(key: str) -> tuple[Path, int]:
    name, size, expect = MODELS[key]
    path = CACHE / name
    if not path.exists() or path.stat().st_size < expect * 0.95:
        CACHE.mkdir(parents=True, exist_ok=True)
        url = MIRROR.format(name=name)
        print(f'下载模型 {name} …')
        urllib.request.urlretrieve(url, path)
    return path, size


def largest_component(mask: np.ndarray) -> np.ndarray:
    """只保留最大连通域，去掉背景残留的孤立色块。"""
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n <= 1:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab == int(np.argmax(sizes)) + 1


def fill_small_holes(mask: np.ndarray) -> np.ndarray:
    """填掉车身内部的小镂空，但保留车窗这类大面积透光区。"""
    filled = ndimage.binary_fill_holes(mask)
    holes = filled & ~mask
    lab, n = ndimage.label(holes, structure=np.ones((3, 3)))
    if n == 0:
        return mask
    sizes = ndimage.sum(holes, lab, range(1, n + 1))
    return filled if sizes.max() < mask.sum() * 0.15 else mask


def cut(sess, in_path: Path, out_path: Path, size: int, max_w: int) -> tuple[int, int]:
    img = Image.open(in_path).convert('RGB')
    ow, oh = img.size

    x = np.asarray(img.resize((size, size), Image.LANCZOS), dtype=np.float32) / 255.0
    x = np.transpose((x - MEAN) / STD, (2, 0, 1))[None].astype(np.float32)

    pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    pred = (pred - pred.min()) / (pred.max() - pred.min() + 1e-8)

    prob = np.asarray(
        Image.fromarray((pred * 255).astype(np.uint8)).resize((ow, oh), Image.LANCZOS),
        dtype=np.float32,
    )
    mask = fill_small_holes(largest_component(prob > 128))

    alpha = np.where(mask, prob, 0.0)
    alpha = np.asarray(Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)))

    out = img.convert('RGBA')
    out.putalpha(Image.fromarray(alpha.astype(np.uint8)))
    out = out.crop(out.getbbox())

    if out.width > max_w:
        out = out.resize((max_w, round(out.height * max_w / out.width)), Image.LANCZOS)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path, 'WEBP', quality=88, method=6)
    return out.size


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='u2netp', choices=list(MODELS))
    ap.add_argument('--src', default='public/cars')
    ap.add_argument('--out', default='public/cars/cut')
    ap.add_argument('--max-width', type=int, default=1600)
    args = ap.parse_args()

    src, out = Path(args.src), Path(args.out)
    if not src.is_dir():
        sys.exit(f'源目录不存在: {src}')

    model, size = ensure_model(args.model)
    sess = ort.InferenceSession(str(model), providers=['CPUExecutionProvider'])

    total = 0
    for jpg in sorted(src.glob('*.jpg')):
        dst = out / f'{jpg.stem}.webp'
        w, h = cut(sess, jpg, dst, size, args.max_width)
        kb = dst.stat().st_size // 1024
        total += kb
        print(f'  {jpg.stem:28s} {w}x{h}  {kb:4d}KB')

    print(f'\n{len(list(out.glob("*.webp")))} 个文件，共 {total / 1024:.1f}MB -> {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
