# IE Orbit Test Scenarios

Markdown export of `IE_Orbit_TewstScenarios_v1.xlsx`. QA may update the Excel file; sync changes here when scenarios change.

---

## Test Scenarios

| Sr.No. | Test Scenario | Test Case | Status |
|--------|---------------|-----------|--------|
| | Home Page | Test to verify that the "Home" link is working fine | |
| | | Test to verify that the "Features" link is working fine | |
| | | Test to verify that the "Pricing" link is working fine | |
| | | Test to verify that the "About" link is working fine | |
| | | Test to verify that the "Contact" link is working fine | |
| | | Test to verify that the "FAQ" link is working fine | |
| | | Test to verifythat all the links in the footer section are working fine | |
| | | Test to verify that the "Start Free Trial" link is working fine | |
| | | Test to verify that the "sign In" link is working fine | |
| | Account Creation | Test to verify that user can create an acccount | |
| | | Test to verify that user can log-in to an existing acccount | |
| | | Test to verifuy that user cannot login with an invalid credentials | |
| | | Test to verify that user can login using an existing google account | |
| | | Test to verify that user cannot create an account without entering mandatory fileds | PASS |
| | | Test to verify that "Use Current location" functionality is working fine | FAIL |
| | | Test to verify that business address search bar is working fine | FAIL |
| | | Test to verify that "cancel" button on account creation form should redirect user to the home page | FAIL |
| | | Test to verify that "request demo" link is working | FAIL |
| | | Test to verify that "Forgit password" fnctionality is working fine | |
| | | test to verify that "Email" address field is ciompulsory on the forget password link | |
| | | Test to verify that an invalid email address entered in "Emal" address textbox shpild return proper errror message when we enter an invalid email address | FAIL |
| | | Test to verify that "Back to Sign In" link is working fine | PASS |
| | | Test to verify that the "Privacy policy" link is working fine | PASS |

---

## Suggestions

| Sr.No. | Suggestions |
|--------|-------------|
| 1 | mention asteric sign for fileds which re compulsory |
| 2 | include phone numerber on the contact page |
| 3 | On the FAQ page -> Help tag appears like a button |
| 4 | Always open links in a new tab and redirect to it |
| 5 | "use Current loctaion" functionality is not working |
| 6 | Apply validation on business phone number - > on acount creation form |
| 7 | Please disable the country, state textboxes |
| 8 | Please clear the cache when user refreshes or again visist the "Craete Account" page |
| 9 | Please upgrade the "privacy policy" section |
| 10 | Please remove the Strat free trial option |
| 11 | There are 2 links "create account" and "create workspace". Please remove "create workspace" link |
| 12 | Include Business Address verification |

---

## Mapping to FINDINGS.md

| Test / suggestion | Finding ID |
|-------------------|------------|
| Use Current location FAIL | QA-001 |
| Phone validation | QA-002 |
| Mandatory field markers | QA-003 |
| Business address search FAIL | QA-004 |
| Cancel button FAIL | QA-005 |
| Request demo FAIL | QA-006 |
| Cache not cleared | QA-007 |
| Invalid email error FAIL | QA-008 |
| Forgot password pass | QA-009 |
| Suggestions #2–12 | QA-010 through QA-017 |
