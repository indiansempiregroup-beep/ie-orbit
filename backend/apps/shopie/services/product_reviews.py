from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db.models import Count, QuerySet

from apps.businesses.models import Business
from apps.customers.models import Customer
from apps.shopie.models import OrderStatus, ShopOrderLine, ShopProduct, ShopProductReview
from apps.tenancy.models import Tenant

REVIEWABLE_STATUSES = (
    OrderStatus.CONFIRMED,
    OrderStatus.READY,
    OrderStatus.COMPLETED,
)


def reviewer_label(customer: Customer) -> str:
    first = (customer.first_name or "").strip()
    last = (customer.last_name or "").strip()
    if first and last:
        return f"{first} {last[0]}."
    if first:
        return first
    display = (getattr(customer, "display_name", None) or "").strip()
    return display or "Customer"


class ProductReviewService:
    def list_reviews(
        self, *, tenant: Tenant, business: Business, product: ShopProduct
    ) -> QuerySet[ShopProductReview]:
        return (
            ShopProductReview.objects.filter(tenant=tenant, business=business, product=product)
            .select_related("customer")
            .order_by("-created_at")
        )

    def rating_breakdown(
        self, *, tenant: Tenant, business: Business, product: ShopProduct
    ) -> dict[str, int]:
        counts = {str(star): 0 for star in range(1, 6)}
        rows = (
            ShopProductReview.objects.filter(tenant=tenant, business=business, product=product)
            .values("rating")
            .annotate(total=Count("id"))
        )
        for row in rows:
            key = str(int(row["rating"]))
            if key in counts:
                counts[key] = int(row["total"] or 0)
        return counts

    def has_purchased(
        self, *, tenant: Tenant, business: Business, customer: Customer, product: ShopProduct
    ) -> bool:
        return ShopOrderLine.objects.filter(
            tenant=tenant,
            business=business,
            product=product,
            order__customer=customer,
            order__status__in=REVIEWABLE_STATUSES,
        ).exists()

    def get_customer_review(
        self, *, tenant: Tenant, product: ShopProduct, customer: Customer
    ) -> ShopProductReview | None:
        return (
            ShopProductReview.objects.filter(tenant=tenant, product=product, customer=customer)
            .select_related("customer")
            .first()
        )

    def create_review(
        self,
        *,
        tenant: Tenant,
        business: Business,
        product: ShopProduct,
        customer: Customer,
        rating: int,
        title: str = "",
        comment: str = "",
    ) -> ShopProductReview:
        if self.get_customer_review(tenant=tenant, product=product, customer=customer):
            raise ValidationError("You have already reviewed this product.")
        if rating < 1 or rating > 5:
            raise ValidationError("Rating must be between 1 and 5.")
        return ShopProductReview.objects.create(
            tenant=tenant,
            business=business,
            product=product,
            customer=customer,
            rating=rating,
            title=(title or "").strip()[:200],
            comment=(comment or "").strip(),
            verified_purchase=self.has_purchased(
                tenant=tenant, business=business, customer=customer, product=product
            ),
        )

    def update_review(
        self,
        *,
        tenant: Tenant,
        product: ShopProduct,
        customer: Customer,
        rating: int,
        title: str = "",
        comment: str = "",
    ) -> ShopProductReview:
        review = self.get_customer_review(tenant=tenant, product=product, customer=customer)
        if review is None:
            raise ValidationError("You have not reviewed this product yet.")
        if rating < 1 or rating > 5:
            raise ValidationError("Rating must be between 1 and 5.")
        review.rating = rating
        review.title = (title or "").strip()[:200]
        review.comment = (comment or "").strip()
        review.save(update_fields=["rating", "title", "comment", "updated_at", "version"])
        return review
