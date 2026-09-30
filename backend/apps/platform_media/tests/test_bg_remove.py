from __future__ import annotations

from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from apps.platform_media.utils.images import (
    BackgroundRemoveUnavailable,
    prepare_product_or_service_image,
    remove_image_background_pil,
)


def _rgb_png(size=(200, 150), color=(40, 120, 200)) -> BytesIO:
    image = Image.new("RGB", size, color)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def test_prepare_without_rembg_still_letterboxes():
    buffer = prepare_product_or_service_image(
        _rgb_png(),
        prepare_product_canvas=True,
        remove_background=False,
        canvas_size=400,
    )
    out = Image.open(buffer)
    assert out.size == (400, 400)
    assert out.mode == "RGBA"
    assert out.getpixel((0, 0))[3] == 0


def test_prepare_service_crop_only_keeps_natural_size():
    buffer = prepare_product_or_service_image(
        _rgb_png((400, 400)),
        crop_box=(100, 100, 300, 300),
        prepare_product_canvas=False,
        remove_background=False,
    )
    out = Image.open(buffer)
    assert out.size == (200, 200)
    assert out.mode == "RGBA"


@patch("apps.platform_media.utils.images.remove_image_background_pil")
def test_prepare_with_rembg_then_canvas(mock_rembg: MagicMock):
    def _fake_cutout(image: Image.Image) -> Image.Image:
        cut = Image.new("RGBA", image.size, (10, 20, 30, 255))
        return cut

    mock_rembg.side_effect = _fake_cutout
    buffer = prepare_product_or_service_image(
        _rgb_png((100, 80)),
        remove_background=True,
        prepare_product_canvas=True,
        canvas_size=300,
    )
    out = Image.open(buffer)
    assert out.size == (300, 300)
    mock_rembg.assert_called_once()


@patch("apps.platform_media.utils.images._get_rembg_session")
def test_remove_background_unavailable_when_rembg_missing(mock_session: MagicMock):
    mock_session.side_effect = BackgroundRemoveUnavailable("Background removal is not available.")
    with pytest.raises(BackgroundRemoveUnavailable):
        remove_image_background_pil(Image.new("RGB", (32, 32), (1, 2, 3)))
