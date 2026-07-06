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
