from __future__ import annotations

from apps.billing.services.gst import split_inclusive_gst


def test_split_inclusive_gst_intrastate() -> None:
    split = split_inclusive_gst(11800, gst_rate_percent=18, interstate=False)
    assert split["taxable_paise"] == 10000
    assert split["cgst_paise"] + split["sgst_paise"] == 1800
    assert split["igst_paise"] == 0
    assert split["amount_paise"] == 11800


def test_split_inclusive_gst_interstate() -> None:
    split = split_inclusive_gst(11800, gst_rate_percent=18, interstate=True)
    assert split["taxable_paise"] == 10000
    assert split["igst_paise"] == 1800
    assert split["cgst_paise"] == 0
    assert split["sgst_paise"] == 0


def test_split_inclusive_gst_zero() -> None:
    split = split_inclusive_gst(0, gst_rate_percent=18, interstate=False)
    assert split["taxable_paise"] == 0
    assert split["cgst_paise"] == 0
