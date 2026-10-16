#!/usr/bin/env python3
"""把 public/cars/*.jpg 抠成透明背景的 WebP，输出到 public/cars/cut/。

为什么需要抠图：设计要求「车在白色车台上居中，背景统一或不存在」。
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

筛图（自选素材时用，落盘之前先判断这张图能不能用）：

    .cutout-venv/bin/python scripts/cutout-cars.py --check --src public/cars
    .cutout-venv/bin/python scripts/cutout-cars.py --check ~/Downloads/*.jpg --preview /tmp/cut

检查项与阈值见下方 CHECK 常量。有 FAIL/WARN 时退出码为 1，方便批量筛。
`--preview DIR` 另存白底合成图，用来肉眼确认。
"""
from __future__ import annotations

import argparse
import math
import sys
import urllib.request
from collections import Counter
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


def infer(sess, img: Image.Image, size: int):
    """跑模型 + 后处理，返回 (prob, mask, comp_sizes)。

    **不写盘**，cut() 与 --check 共用这一条路径 —— 否则检查出来的指标
    反映的就不是真正落盘的那个产物了。

    comp_sizes 是大→小排好的连通域面积，用来看背景里有没有第二坨东西。
    """
    ow, oh = img.size

    x = np.asarray(img.resize((size, size), Image.LANCZOS), dtype=np.float32) / 255.0
    x = np.transpose((x - MEAN) / STD, (2, 0, 1))[None].astype(np.float32)

    pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    pred = (pred - pred.min()) / (pred.max() - pred.min() + 1e-8)

    prob = np.asarray(
        Image.fromarray((pred * 255).astype(np.uint8)).resize((ow, oh), Image.LANCZOS),
        dtype=np.float32,
    )
    binary = prob > 128

    lab, n = ndimage.label(binary, structure=np.ones((3, 3)))
    sizes = np.sort(ndimage.sum(binary, lab, range(1, n + 1)))[::-1] if n else np.zeros(0)

    return prob, fill_small_holes(largest_component(binary)), sizes


def alpha_of(prob: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """掩膜外的概率一律清零，再羽化。返回值就是最终写进 WebP 的 alpha（uint8）。"""
    a = np.where(mask, prob, 0.0)
    return np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)))


def cut(sess, in_path: Path, out_path: Path, size: int, max_w: int) -> tuple[int, int]:
    img = Image.open(in_path).convert('RGB')
    prob, mask, _ = infer(sess, img, size)

    out = img.convert('RGBA')
    out.putalpha(Image.fromarray(alpha_of(prob, mask)))
    out = out.crop(out.getbbox())

    if out.width > max_w:
        out = out.resize((max_w, round(out.height * max_w / out.width)), Image.LANCZOS)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path, 'WEBP', quality=88, method=6)
    return out.size


SOURCE_SUFFIXES = ('.jpg', '.jpeg', '.png', '.webp')

# ---------------------------------------------------------------- --check 阈值
# 首屏车台 + 面积归一的目标，与 src/lib/fit.ts 的常量保持一致。
# 改 fit.ts 的 STAGE_H / STAGE_FILL 时这里要同步，否则预估的渲染尺寸会对不上。
STAGE_W, STAGE_H, STAGE_FILL = 1000.0, 333.0, 0.5

SEMI_MAX = 0.03         # 半透明像素占比上限。现有 13 张基准 1–2%，超过就是边缘发虚
SECOND_BLOB_MAX = 0.15  # 第二大连通域 / 最大连通域。超过说明背景里还有一坨大的
RATIO_RANGE = (1.2, 3.0)  # 抠出来主体的长宽比，超出就不像车侧身
COVER_MIN = 0.12        # 主体占画面比，太小说明这张图分辨率被浪费
BIG_EDGE_MIN = 2880     # M2 详情页大图（1440 CSS px @DPR2）需要的设备像素
EDGE_BAND = 2           # 判定「贴边」时看画幅最外几像素


def audit(sess, path: Path, size: int, preview_dir: Path | None = None) -> dict:
    """判断一张候选图能不能当首屏素材。指标全部算在**真正落盘的 alpha** 上。"""
    img = Image.open(path).convert('RGB')
    prob, mask, sizes = infer(sess, img, size)
    alpha = alpha_of(prob, mask)

    h, w = alpha.shape
    solid = alpha > 128
    ys, xs = np.where(solid)

    row = {'file': path.name, 'px': f'{w}x{h}', 'ratio': 0.0, 'cover': 0.0,
           'semi': 0.0, 'blobs': int(len(sizes)), 'render': '—',
           'verdict': 'FAIL', 'notes': ['抠不出主体 —— 换图']}
    if not len(xs):
        return row

    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    ratio = bw / bh

    edge = int(
        solid[:EDGE_BAND].sum() + solid[-EDGE_BAND:].sum()
        + solid[:, :EDGE_BAND].sum() + solid[:, -EDGE_BAND:].sum()
    )
    semi = float(((alpha > 4) & (alpha < 200)).mean())
    cover = float(solid.mean())
    second = float(sizes[1] / sizes[0]) if len(sizes) > 1 and sizes[0] else 0.0

    notes, level = [], 'OK'

    def flag(lv: str, msg: str) -> None:
        nonlocal level
        notes.append(msg)
        if ('OK', 'INFO', 'WARN', 'FAIL').index(lv) > ('OK', 'INFO', 'WARN', 'FAIL').index(level):
            level = lv

    if edge:
        flag('FAIL', f'主体贴边（{edge}px），车会被切掉')
    if len(sizes) > 1 and second > SECOND_BLOB_MAX:
        flag('WARN', f'背景有 {len(sizes)} 个块，第二大占 {second:.0%}，可能选错主体')
    if not RATIO_RANGE[0] <= ratio <= RATIO_RANGE[1]:
        flag('WARN', f'长宽比 {ratio:.2f} 不像车侧身')
    if semi > SEMI_MAX:
        flag('WARN', f'半透明像素 {semi:.1%} 偏高（基准 1–2%），边缘发虚')
    if cover < COVER_MIN:
        flag('INFO', f'主体只占画面 {cover:.0%}，分辨率被浪费')
    if max(w, h) < BIG_EDGE_MIN:
        flag('INFO', f'长边 {max(w, h)}px < M2 详情页需要的 {BIG_EDGE_MIN}px')

    # 首屏渲染尺寸预估：与 src/lib/fit.ts 的 fitByArea() 同一套公式
    rh = math.sqrt(STAGE_W * STAGE_H * STAGE_FILL / ratio)
    rw = rh * ratio
    if rh > STAGE_H:
        rw *= STAGE_H / rh
        rh = STAGE_H

    if preview_dir:
        rgba = img.convert('RGBA')
        rgba.putalpha(Image.fromarray(alpha))
        rgba = rgba.crop((x0, y0, x1 + 1, y1 + 1))
        flat = Image.new('RGB', rgba.size, 'white')
        flat.paste(rgba, (0, 0), rgba)
        if flat.width > 900:
            flat = flat.resize((900, round(flat.height * 900 / flat.width)), Image.LANCZOS)
        preview_dir.mkdir(parents=True, exist_ok=True)
        flat.save(preview_dir / f'{path.stem}-check.jpg', 'JPEG', quality=88)

    return {'file': path.name, 'px': f'{w}x{h}', 'ratio': ratio, 'cover': cover,
            'semi': semi, 'blobs': int(len(sizes)), 'render': f'{rw:.0f}x{rh:.0f}',
            'verdict': level, 'notes': notes}


def run_check(sess, paths: list[Path], size: int, model: str, preview_dir: Path | None) -> int:
    total = len(paths)
    print(f'\n检查 {total} 张候选图（模型 {model}）')
    if preview_dir:
        print(f'白底预览 -> {preview_dir}')

    rows = [audit(sess, p, size, preview_dir) for p in paths]
    rank = {'FAIL': 0, 'WARN': 1, 'INFO': 2, 'OK': 3}
    rows.sort(key=lambda r: (rank[r['verdict']], r['file']))

    print(f"\n  {'文件':<30}{'尺寸':>11}{'比例':>7}{'占比':>7}{'半透明':>8}{'块':>4}{'首屏渲染':>11}  判定")
    for r in rows:
        print(f"  {r['file'][:29]:<30}{r['px']:>11}{r['ratio']:>7.2f}{r['cover']:>7.0%}"
              f"{r['semi']:>8.1%}{r['blobs']:>4}{r['render']:>11}  {r['verdict']}")
        for note in r['notes']:
            print(f"      └─ {note}")

    counts = Counter(r['verdict'] for r in rows)
    print(f"\n  OK {counts['OK']} / 提示 {counts['INFO']} / 警告 {counts['WARN']} / 不可用 {counts['FAIL']}"
          f"  （共 {total} 张）")

    if counts['FAIL']:
        print('  有不可用的图，替换后再跑。')
    elif counts['WARN']:
        print('  有警告项，建议看看预览图再决定。')
    return 1 if counts['FAIL'] or counts['WARN'] else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='u2netp', choices=list(MODELS))
    ap.add_argument('--src', default='public/cars')
    ap.add_argument('--out', default='public/cars/cut')
    ap.add_argument('--max-width', type=int, default=1600)
    ap.add_argument('--check', action='store_true',
                    help='只检查候选图能不能用，不落盘（退出码 1 = 有问题）')
    ap.add_argument('--preview', metavar='DIR', help='--check 时另存白底合成图到 DIR')
    ap.add_argument('files', nargs='*', help='--check 时指定图片，缺省用 --src 目录')
    args = ap.parse_args()

    src, out = Path(args.src), Path(args.out)

    if args.check:
        paths = [Path(f) for f in args.files]
        if not paths:
            if not src.is_dir():
                sys.exit(f'源目录不存在: {src}')
            paths = sorted(p for p in src.iterdir() if p.suffix.lower() in SOURCE_SUFFIXES)
        missing = [p for p in paths if not p.is_file()]
        if missing:
            sys.exit('找不到文件: ' + '、'.join(str(p) for p in missing))
        if not paths:
            sys.exit(f'{src} 下没有可检查的图片')

        model, size = ensure_model(args.model)
        sess = ort.InferenceSession(str(model), providers=['CPUExecutionProvider'])
        return run_check(sess, paths, size, args.model,
                         Path(args.preview) if args.preview else None)

    if not src.is_dir():
        sys.exit(f'源目录不存在: {src}')

    model, size = ensure_model(args.model)
    sess = ort.InferenceSession(str(model), providers=['CPUExecutionProvider'])

    total = 0
    for f in sorted(p for p in src.iterdir() if p.suffix.lower() in SOURCE_SUFFIXES):
        dst = out / f'{f.stem}.webp'
        w, h = cut(sess, f, dst, size, args.max_width)
        kb = dst.stat().st_size // 1024
        total += kb
        print(f'  {f.stem:28s} {w}x{h}  {kb:4d}KB')

    print(f'\n{len(list(out.glob("*.webp")))} 个文件，共 {total / 1024:.1f}MB -> {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
