from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO


@dataclass(frozen=True)
class ImageMetadata:
    width: int | None = None
    height: int | None = None
    format: str | None = None
    mode: str | None = None

    def as_dict(self) -> dict[str, str | int | None]:
        return {
            "width": self.width,
            "height": self.height,
            "format": self.format,
            "mode": self.mode,
        }


def extract_image_metadata(file_obj: object) -> ImageMetadata:
    Image = _image_module()
    position = file_obj.tell() if hasattr(file_obj, "tell") else None
    try:
        image = Image.open(file_obj)
        return ImageMetadata(
            width=image.width,
            height=image.height,
            format=image.format,
            mode=image.mode,
        )
    finally:
        if position is not None:
            file_obj.seek(position)


def thumbnail_image(file_obj: object, *, size: tuple[int, int] = (300, 300)) -> BytesIO:
    Image = _image_module()
    image = Image.open(file_obj)
    image.thumbnail(size)
    return _to_buffer(image, image.format or "JPEG")


def resize_image(file_obj: object, *, size: tuple[int, int]) -> BytesIO:
    Image = _image_module()
    image = Image.open(file_obj)
    resized = image.resize(size)
    return _to_buffer(resized, image.format or "JPEG")


def crop_image(file_obj: object, *, box: tuple[int, int, int, int]) -> BytesIO:
    Image = _image_module()
    image = Image.open(file_obj)
    cropped = image.crop(box)
    return _to_buffer(cropped, image.format or "JPEG")


def compress_image(file_obj: object, *, quality: int = 85) -> BytesIO:
    Image = _image_module()
    image = Image.open(file_obj)
    return _to_buffer(image, image.format or "JPEG", quality=quality, optimize=True)


PRODUCT_CANVAS_SIZE = 1200


def letterbox_to_product_canvas(
    image: object,
    *,
    canvas_size: int = PRODUCT_CANVAS_SIZE,
) -> object:
    """Center an RGBA PIL image on a transparent square without stretching."""
    Image = _image_module()
    resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.LANCZOS)
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    if image.width > canvas_size or image.height > canvas_size:
        image.thumbnail((canvas_size, canvas_size), resample)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    offset = ((canvas_size - image.width) // 2, (canvas_size - image.height) // 2)
    canvas.paste(image, offset, image)
    return canvas


def fit_to_product_canvas(
    file_obj: object,
    *,
    canvas_size: int = PRODUCT_CANVAS_SIZE,
    crop_box: tuple[int, int, int, int] | None = None,
) -> BytesIO:
    """Crop (optional), then center on a transparent square PNG without stretching.

    Free-aspect crops keep their proportions. Content is only scaled *down* if larger
    than the canvas; smaller crops keep their pixel size and get transparent padding.
    EXIF orientation is applied first so phone photos crop as the user sees them.
    """
    position = file_obj.tell() if hasattr(file_obj, "tell") else None
    try:
        image = open_image_exif(file_obj)
        if crop_box:
            image = crop_pil_image(image, crop_box)
        canvas = letterbox_to_product_canvas(image, canvas_size=canvas_size)
        buffer = BytesIO()
        canvas.save(buffer, format="PNG", optimize=True)
        buffer.seek(0)
        return buffer
    finally:
        if position is not None:
            file_obj.seek(position)


def open_image_exif(file_obj: object) -> object:
    """Open a PIL image and apply EXIF orientation."""
    Image = _image_module()
    try:
        from PIL import ImageOps
    except ImportError:  # pragma: no cover
        ImageOps = None
    image = Image.open(file_obj)
    image.load()
    if ImageOps is not None:
        image = ImageOps.exif_transpose(image) or image
    return image


def crop_pil_image(image: object, crop_box: tuple[int, int, int, int]) -> object:
    left, top, right, bottom = crop_box
    left = max(0, min(int(left), image.width))
    top = max(0, min(int(top), image.height))
    right = max(left + 1, min(int(right), image.width))
    bottom = max(top + 1, min(int(bottom), image.height))
    return image.crop((left, top, right, bottom))


def prepare_product_or_service_image(
    file_obj: object,
    *,
    crop_box: tuple[int, int, int, int] | None = None,
    remove_background: bool = False,
    prepare_product_canvas: bool = False,
    canvas_size: int = PRODUCT_CANVAS_SIZE,
) -> BytesIO:
    """EXIF → optional crop → optional rembg → optional product canvas → PNG."""
    position = file_obj.tell() if hasattr(file_obj, "tell") else None
    try:
        image = open_image_exif(file_obj)
        if crop_box:
            image = crop_pil_image(image, crop_box)
        if remove_background:
            image = remove_image_background_pil(image)
        elif image.mode != "RGBA":
            image = image.convert("RGBA")
        if prepare_product_canvas:
            image = letterbox_to_product_canvas(image, canvas_size=canvas_size)
        buffer = BytesIO()
        image.save(buffer, format="PNG", optimize=True)
        buffer.seek(0)
        return buffer
    finally:
        if position is not None:
            file_obj.seek(position)


def remove_image_background(file_obj: object) -> BytesIO:
    """Remove background via rembg (u2netp). Raises BackgroundRemoveUnavailable on failure."""
    position = file_obj.tell() if hasattr(file_obj, "tell") else None
    try:
        image = open_image_exif(file_obj)
        cutout = remove_image_background_pil(image)
        buffer = BytesIO()
        cutout.save(buffer, format="PNG", optimize=True)
        buffer.seek(0)
        return buffer
    finally:
        if position is not None:
            file_obj.seek(position)


class BackgroundRemoveUnavailable(RuntimeError):
    """Raised when rembg is not installed or inference fails."""


_rembg_lock = None
_rembg_session = None


def _get_rembg_lock():
    global _rembg_lock
    if _rembg_lock is None:
        import threading

        _rembg_lock = threading.Lock()
    return _rembg_lock


def _get_rembg_session():
    global _rembg_session
    if _rembg_session is not None:
        return _rembg_session
    try:
        from rembg import new_session
    except ImportError as exc:  # pragma: no cover
        raise BackgroundRemoveUnavailable(
            "Background removal is not available on this server."
        ) from exc
    _rembg_session = new_session("u2netp")
    return _rembg_session


def remove_image_background_pil(image: object) -> object:
    """Run rembg on a PIL image; serialize with a process-wide lock (RAM)."""
    Image = _image_module()
    try:
        from rembg import remove
    except ImportError as exc:  # pragma: no cover
        raise BackgroundRemoveUnavailable(
            "Background removal is not available on this server."
        ) from exc

    if image.mode not in {"RGB", "RGBA"}:
        image = image.convert("RGBA")

    # Cap input size so phone photos do not OOM / hang the upload request.
    max_edge = 1280
    if image.width > max_edge or image.height > max_edge:
        resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.LANCZOS)
        image = image.copy()
        image.thumbnail((max_edge, max_edge), resample)

    source = BytesIO()
    image.save(source, format="PNG")
    source.seek(0)
    lock = _get_rembg_lock()
    try:
        with lock:
            session = _get_rembg_session()
            result_bytes = remove(source.getvalue(), session=session)
    except BackgroundRemoveUnavailable:
        raise
    except MemoryError as exc:
        raise BackgroundRemoveUnavailable(
            "Background removal ran out of memory. Try a smaller photo or turn off Remove background."
        ) from exc
    except Exception as exc:
        raise BackgroundRemoveUnavailable(
            "Background removal failed. Try again or upload without removing the background."
        ) from exc
    cutout = Image.open(BytesIO(result_bytes))
    cutout.load()
    if cutout.mode != "RGBA":
        cutout = cutout.convert("RGBA")
    return cutout


def export_webp_variant(
    file_obj: object,
    *,
    max_size: tuple[int, int],
    quality: int = 80,
) -> BytesIO:
    Image = _image_module()
    position = file_obj.tell() if hasattr(file_obj, "tell") else None
    try:
        image = Image.open(file_obj)
        image.thumbnail(max_size)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGB")
        buffer = BytesIO()
        save_options: dict[str, object] = {"quality": quality, "method": 6}
        if image.mode == "RGB":
            save_options["optimize"] = True
        image.save(buffer, format="WEBP", **save_options)
        buffer.seek(0)
        return buffer
    finally:
        if position is not None:
            file_obj.seek(position)


def _to_buffer(image: object, image_format: str, **save_options: object) -> BytesIO:
    buffer = BytesIO()
    if image.mode in {"RGBA", "P"} and image_format.upper() in {"JPG", "JPEG"}:
        image = image.convert("RGB")
    image.save(buffer, format=image_format, **save_options)
    buffer.seek(0)
    return buffer


def _image_module() -> object:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required for platform media image processing.") from exc
    return Image
