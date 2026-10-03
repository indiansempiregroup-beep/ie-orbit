from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest

from apps.bookings.models import BookingLineItem, BookingStatus
from apps.bookings.services.bookings import BookingService
from apps.customers.models import CustomerLoyaltyAccount, CustomerLoyaltyLedger
from apps.customers.tests.test_loyalty import _make_booking, loyalty_setup
from apps.shopie.models import ShopBooksVoucher, VoucherType
from apps.shopie.services.books import BooksService
from apps.shopie.services.shop_documents import ShopDocumentService


def _complete_paid(setup, booking, *, method="cash", amount_paid=None, payment_proof_url=None):
    payment = {"payment_method": method}
    if amount_paid is not None:
        payment["amount_paid"] = amount_paid
    if method == "upi":
        payment["payment_proof_url"] = payment_proof_url or "https://cdn.example.com/booking-upi-proof.png"
    return BookingService().transition(
        booking=booking,
        to_status=BookingStatus.COMPLETED,
        actor=setup["owner"],
        reason="Done",
        payment=payment,
    )


@pytest.mark.django_db
def test_completed_booking_posts_books_sale(loyalty_setup):
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-INV-1")
    start = booking.start_at
    BookingLineItem.objects.create(
        tenant=setup["tenant"],
        booking=booking,
        service_id=setup["service"].id,
        staff_id=setup["staff"].id,
        start_at=start,
        end_at=start + timedelta(hours=1),
        duration_minutes=60,
        sort_order=0,
        price_snapshot=Decimal("500.00"),
    )

    _complete_paid(setup, booking)

    voucher = BooksService.books_voucher_for_booking(
        tenant=setup["tenant"],
        business=setup["business"],
        booking_id=booking.id,
    )
    assert voucher is not None
    assert voucher.voucher_type == VoucherType.SALE
    assert voucher.metadata.get("source_booking_id") == str(booking.id)
    assert voucher.total == Decimal("500.00")
    assert voucher.amount_paid == Decimal("500.00")
    assert (voucher.metadata.get("payment") or {}).get("method") == "cash"

    # Idempotent
    again = BooksService().create_sale_from_booking(
        tenant=setup["tenant"],
        business=setup["business"],
        booking=booking,
    )
    assert again.id == voucher.id
    assert ShopBooksVoucher.objects.filter(metadata__source_booking_id=str(booking.id)).count() == 1


@pytest.mark.django_db
def test_booking_invoice_falls_back_to_service_pricing(loyalty_setup):
    """Migrated / older line items often have price_snapshot=0 — use catalog price."""
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-INV-0", status=BookingStatus.COMPLETED)
    start = booking.start_at
    BookingLineItem.objects.create(
        tenant=setup["tenant"],
        booking=booking,
        service_id=setup["service"].id,
        staff_id=setup["staff"].id,
        start_at=start,
        end_at=start + timedelta(hours=1),
        duration_minutes=60,
        sort_order=0,
        price_snapshot=Decimal("0.00"),
    )

    voucher = BooksService().create_sale_from_booking(
        tenant=setup["tenant"],
        business=setup["business"],
        booking=booking,
    )
    assert voucher is not None
    # loyalty_setup ServicePricing.base_price is 500
    assert voucher.total == Decimal("500.00")


@pytest.mark.django_db
def test_booking_invoice_loyalty_uses_service_points_not_spend(loyalty_setup):
    """Booking earn is per-service; books sale must not apply shop spend-rate points."""
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-INV-LOYAL")
    start = booking.start_at
    BookingLineItem.objects.create(
        tenant=setup["tenant"],
        booking=booking,
        service_id=setup["service"].id,
        staff_id=setup["staff"].id,
        start_at=start,
        end_at=start + timedelta(hours=1),
        duration_minutes=60,
        sort_order=0,
        price_snapshot=Decimal("500.00"),
    )

    _complete_paid(setup, booking)

    account = CustomerLoyaltyAccount.objects.get(customer=setup["customer"])
    # Service loyalty_points_earn=50 — not ₹500 × earn_points_per_100/100 (=5).
    assert account.points_balance == 50
    assert CustomerLoyaltyLedger.objects.filter(booking_id=booking.id, points_delta=50).exists()
    assert not CustomerLoyaltyLedger.objects.filter(
        voucher_id__isnull=False, points_delta__gt=0, customer=setup["customer"]
    ).exists()

    voucher = BooksService.books_voucher_for_booking(
        tenant=setup["tenant"],
        business=setup["business"],
        booking_id=booking.id,
    )
    assert voucher is not None
    billing = (voucher.metadata or {}).get("billing") or {}
    assert int(billing.get("points_earned") or 0) == 50

    payload = ShopDocumentService().build_payload(
        tenant=setup["tenant"],
        business=setup["business"],
        kind="sale",
        document_id=voucher.id,
    )
    assert int(payload.get("points_earned") or 0) == 50
    assert int(payload.get("points_to_earn") or 0) == 0


@pytest.mark.django_db
def test_complete_requires_payment_method_for_priced_booking(loyalty_setup):
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-INV-NOPAY")
    start = booking.start_at
    BookingLineItem.objects.create(
        tenant=setup["tenant"],
        booking=booking,
        service_id=setup["service"].id,
        staff_id=setup["staff"].id,
        start_at=start,
        end_at=start + timedelta(hours=1),
        duration_minutes=60,
        sort_order=0,
        price_snapshot=Decimal("500.00"),
    )
    with pytest.raises(Exception) as exc:
        BookingService().transition(
            booking=booking,
            to_status=BookingStatus.COMPLETED,
            actor=setup["owner"],
            reason="Done",
        )
    assert "payment_method" in str(exc.value).lower() or "cash" in str(exc.value).lower()


@pytest.mark.django_db
def test_complete_partial_upi_posts_due(loyalty_setup):
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-INV-PARTIAL")
    start = booking.start_at
    BookingLineItem.objects.create(
        tenant=setup["tenant"],
        booking=booking,
        service_id=setup["service"].id,
        staff_id=setup["staff"].id,
        start_at=start,
        end_at=start + timedelta(hours=1),
        duration_minutes=60,
        sort_order=0,
        price_snapshot=Decimal("500.00"),
    )

    _complete_paid(setup, booking, method="upi", amount_paid=Decimal("200.00"))
    booking.refresh_from_db()
    payment = (booking.metadata or {}).get("payment") or {}
    assert payment.get("method") == "upi"
    assert payment.get("status") == "partially_paid"
    assert Decimal(str(payment.get("amount_paid"))) == Decimal("200.00")
    assert Decimal(str(payment.get("amount_due"))) == Decimal("300.00")
    assert payment.get("payment_proof_url")

    voucher = BooksService.books_voucher_for_booking(
        tenant=setup["tenant"],
        business=setup["business"],
        booking_id=booking.id,
    )
    assert voucher is not None
    assert voucher.amount_paid == Decimal("200.00")
    assert (voucher.metadata.get("payment") or {}).get("method") == "upi"


@pytest.mark.django_db
def test_complete_upi_requires_payment_proof(loyalty_setup):
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-INV-UPI-NOPROOF")
    start = booking.start_at
    BookingLineItem.objects.create(
        tenant=setup["tenant"],
        booking=booking,
        service_id=setup["service"].id,
        staff_id=setup["staff"].id,
        start_at=start,
        end_at=start + timedelta(hours=1),
        duration_minutes=60,
        sort_order=0,
        price_snapshot=Decimal("500.00"),
    )
    with pytest.raises(Exception) as exc:
        BookingService().transition(
            booking=booking,
            to_status=BookingStatus.COMPLETED,
            actor=setup["owner"],
            reason="Done",
            payment={"payment_method": "upi", "amount_paid": Decimal("500.00")},
        )
    assert "proof" in str(exc.value).lower() or "screenshot" in str(exc.value).lower()


@pytest.mark.django_db
def test_complete_credit_zero_paid(loyalty_setup):
    setup = loyalty_setup
    booking = _make_booking(setup, number="BK-INV-CREDIT")
    start = booking.start_at
    BookingLineItem.objects.create(
        tenant=setup["tenant"],
        booking=booking,
        service_id=setup["service"].id,
        staff_id=setup["staff"].id,
        start_at=start,
        end_at=start + timedelta(hours=1),
        duration_minutes=60,
        sort_order=0,
        price_snapshot=Decimal("500.00"),
    )

    _complete_paid(setup, booking, method="borrow", amount_paid=Decimal("0.00"))
    voucher = BooksService.books_voucher_for_booking(
        tenant=setup["tenant"],
        business=setup["business"],
        booking_id=booking.id,
    )
    assert voucher is not None
    assert voucher.amount_paid == Decimal("0.00")
    assert (voucher.metadata.get("payment") or {}).get("method") == "borrow"
    assert (voucher.metadata.get("payment") or {}).get("status") == "due"
