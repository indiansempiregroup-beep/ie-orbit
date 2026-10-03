from apps.analytics.services.analytics import AnalyticsService


def test_change_pct_treats_a_zero_baseline_as_unknown():
    service = AnalyticsService()
    assert service._change_pct(12, 0) is None
    assert service._change_pct(0, 0) == 0
    assert service._change_pct(12, 10) == 20.0
    assert service._change_pct(8, 10) == -20.0


def test_insights_do_not_call_a_flat_period_growth():
    service = AnalyticsService()
    insights = service._build_insights(
        summary={
            "bookings": 20,
            "cancelled": 1,
            "no_shows": 0,
            "cancellation_rate": 0.05,
            "no_show_rate": 0,
            "comparison": {
                "bookings_change_pct": 0,
                "revenue_change_pct": 2.0,
                "previous_period": {"bookings": 20, "estimated_revenue": 1000},
            },
        },
        revenue={
            "currency": "INR",
            "estimated_revenue": 1020,
            "by_service": [{"service_name": "Cut", "revenue": 400, "bookings": 8}],
        },
        growth={
            "customers_with_bookings": 10,
            "new_customers": 4,
            "returning_customers": 6,
            "repeat_rate": 0.6,
        },
        operations={
            "busiest_day": "Monday",
            "busiest_hour": "10:00",
            "by_weekday": [
                {"weekday_name": "Monday", "total": 4},
                {"weekday_name": "Tuesday", "total": 3},
                {"weekday_name": "Wednesday", "total": 3},
                {"weekday_name": "Thursday", "total": 3},
                {"weekday_name": "Friday", "total": 3},
                {"weekday_name": "Saturday", "total": 2},
                {"weekday_name": "Sunday", "total": 2},
            ],
            "by_staff": [],
        },
    )
    titles = [row["title"] for row in insights]
    assert "Bookings are steady" in titles
    assert "Estimated revenue is steady" in titles
    assert not any("up 0%" in title or "up 2.0%" in title for title in titles)
    # Monday is only 20% of bookings, so it is not called out as a peak.
    assert not any("busiest day" in title for title in titles)
    assert any(title.startswith("60% of guests came back") for title in titles)
    assert all("priority" not in row for row in insights)


def test_insights_rank_a_real_drop_ahead_of_a_healthy_repeat_rate():
    service = AnalyticsService()
    insights = service._build_insights(
        summary={
            "bookings": 8,
            "cancelled": 3,
            "no_shows": 1,
            "cancellation_rate": 0.375,
            "no_show_rate": 0.125,
            "comparison": {
                "bookings_change_pct": -40,
                "revenue_change_pct": -25,
                "previous_period": {"bookings": 14, "estimated_revenue": 2000},
            },
        },
        revenue={
            "currency": "INR",
            "estimated_revenue": 1500,
            "by_service": [
                {"service_name": "Colour", "revenue": 1100, "bookings": 4},
                {"service_name": "Cut", "revenue": 400, "bookings": 4},
            ],
        },
        growth={
            "customers_with_bookings": 8,
            "new_customers": 7,
            "returning_customers": 1,
            "repeat_rate": 0.125,
        },
        operations={
            "busiest_day": "Saturday",
            "busiest_hour": "11:00",
            "by_weekday": [
                {"weekday_name": "Saturday", "total": 6},
                {"weekday_name": "Sunday", "total": 2},
            ],
            "by_staff": [
                {
                    "staff_name": "Asha",
                    "bookings": 6,
                    "cancelled": 2,
                    "no_shows": 1,
                }
            ],
        },
    )
    assert insights[0]["type"] == "risk"
    titles = " ".join(row["title"] for row in insights)
    assert "down 40%" in titles
    assert "down 25%" in titles
    assert "Colour is 73% of estimated revenue" in titles
    assert "Asha is losing 50% of bookings" in titles
    assert "Saturday is your busiest day" in titles
    assert "Only 12% of guests came back" in titles


def test_commerce_insights_compare_with_the_previous_period():
    service = AnalyticsService()
    insights = service._commerce_insights(
        currency="INR",
        orders=8,
        cancelled=3,
        gmv=4000,
        previous_orders=16,
        previous_gmv=8000,
        returns=2,
        pending_returns=1,
        return_rate=0.25,
        refund_total=500,
        delivery_fee_total=600,
        by_day={
            "2026-10-01": {"day": "2026-10-01", "orders": 1, "gmv": 200},
            "2026-10-02": {"day": "2026-10-02", "orders": 1, "gmv": 300},
            "2026-10-03": {"day": "2026-10-03", "orders": 6, "gmv": 3500},
        },
    )
    titles = [row["title"] for row in insights]
    assert titles[0] == "1 return still pending"
    assert "Shop orders are down 50%" in titles
    assert "3 shop orders were cancelled" in titles
    assert "Delivery fees are 15% of GMV" in titles
    assert "Saturday was the strongest sales day" in titles


def test_pets_insights_call_out_birthdays_and_missing_photos():
    service = AnalyticsService()
    insights = service._pets_insights(
        {"total": 10, "birthdays_next_7d": 2, "birthdays_next_30d": 3, "with_photo": 4}
    )
    titles = [row["title"] for row in insights]
    assert titles[0] == "2 pet birthdays this week"
    assert "6 pets have no photo" in titles


def test_new_booking_period_is_not_called_a_repeat_failure():
    service = AnalyticsService()
    insights = service._build_insights(
        summary={
            "bookings": 8,
            "cancelled": 0,
            "no_shows": 0,
            "cancellation_rate": 0,
            "no_show_rate": 0,
            "comparison": {
                "bookings_change_pct": None,
                "revenue_change_pct": None,
                "previous_period": {"bookings": 0, "estimated_revenue": 0},
            },
        },
        revenue={
            "currency": "INR",
            "estimated_revenue": 1600,
            "by_service": [{"service_name": "Groom", "revenue": 1600, "bookings": 1}],
        },
        growth={
            "customers_with_bookings": 4,
            "new_customers": 4,
            "returning_customers": 0,
            "repeat_rate": 0,
        },
        operations={
            "busiest_day": "Thursday",
            "busiest_hour": "10:00",
            "by_weekday": [{"weekday_name": "Thursday", "total": 2}, {"weekday_name": "Friday", "total": 2}],
            "by_staff": [],
        },
    )
    titles = [row["title"] for row in insights]
    assert titles[0] == "Bookings started this period"
    assert "4 customers booked for the first time" in titles
    assert not any("0%" in title or "busiest" in title or "leads" in title for title in titles)


def test_forecast_note_flags_a_slowdown():
    service = AnalyticsService()
    note = service._forecast_note(
        momentum_pct=-18.0,
        based_on_bookings=40,
        projected_bookings=28,
        horizon_days=30,
    )
    assert "18%" in note
    assert "below a flat average" in note


def test_insights_cover_quiet_day_follow_up_aov_staff_and_forecast():
    service = AnalyticsService()
    insights = service._build_insights(
        summary={
            "bookings": 20,
            "cancelled": 0,
            "no_shows": 0,
            "cancellation_rate": 0,
            "no_show_rate": 0,
            "comparison": {
                "bookings_change_pct": 2.0,
                "revenue_change_pct": -12.0,
                "previous_period": {"bookings": 20, "estimated_revenue": 4000},
            },
        },
        revenue={
            "currency": "INR",
            "estimated_revenue": 3520,
            "by_service": [
                {"service_name": "Cut", "revenue": 2000, "bookings": 10},
                {"service_name": "Colour", "revenue": 1520, "bookings": 10},
            ],
        },
        growth={
            "customers_with_bookings": 10,
            "new_customers": 4,
            "returning_customers": 6,
            "repeat_rate": 0.6,
            "top_customers": [
                {"customer_name": "Priya", "bookings": 1, "revenue": 900, "is_returning": False},
                {"customer_name": "Asha", "bookings": 4, "revenue": 800, "is_returning": True},
            ],
        },
        operations={
            "busiest_day": "Saturday",
            "busiest_hour": "11:00",
            "by_weekday": [
                {"weekday": 0, "weekday_name": "Monday", "total": 1},
                {"weekday": 1, "weekday_name": "Tuesday", "total": 2},
                {"weekday": 2, "weekday_name": "Wednesday", "total": 2},
                {"weekday": 3, "weekday_name": "Thursday", "total": 2},
                {"weekday": 4, "weekday_name": "Friday", "total": 3},
                {"weekday": 5, "weekday_name": "Saturday", "total": 9},
                {"weekday": 6, "weekday_name": "Sunday", "total": 1},
            ],
            "by_staff": [
                {"staff_name": "Ravi", "bookings": 14, "cancelled": 0, "no_shows": 0},
                {"staff_name": "Meera", "bookings": 4, "cancelled": 0, "no_shows": 0},
                {"staff_name": "Jon", "bookings": 2, "cancelled": 0, "no_shows": 0},
            ],
        },
        forecast={
            "horizon_days": 30,
            "projected_bookings": 18,
            "projected_revenue": 3200,
            "momentum_pct": -12.0,
            "note": "The last two weeks are 12% behind the two before that, so the outlook sits below a flat average.",
            "currency": "INR",
        },
    )
    titles = [row["title"] for row in insights]
    assert "Average booking value is down 12%" in titles
    assert "Saturday is your busiest day" in titles
    assert "Monday is your quietest day" in titles
    assert "Priya booked once — follow up" in titles
    assert "Ravi carries 70% of bookings" in titles
    assert "Next 30 days: about 18 bookings" in titles
    assert insights[0]["type"] in {"revenue", "forecast", "customer", "demand"}


def test_commerce_insights_flag_ticket_size_when_orders_are_flat():
    service = AnalyticsService()
    insights = service._commerce_insights(
        currency="INR",
        orders=10,
        cancelled=0,
        gmv=8000,
        previous_orders=10,
        previous_gmv=10000,
        returns=0,
        pending_returns=0,
        return_rate=0,
        refund_total=0,
        delivery_fee_total=0,
        by_day={},
    )
    titles = [row["title"] for row in insights]
    assert "Shop orders are steady" in titles
    assert "Average order value is down 20%" in titles
