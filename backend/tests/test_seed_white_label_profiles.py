@pytest.mark.django_db
def test_seed_white_label_profiles_command_creates_pilot_flavors() -> None:
    from django.core.management import call_command

    from apps.businesses.models import WhiteLabelProfile

    call_command("seed_white_label_profiles", "--create-pilot")
    assert WhiteLabelProfile.objects.filter(flavor_key="demo-MAIN").exists()
    assert WhiteLabelProfile.objects.filter(flavor_key="empire-salon-main").exists()
