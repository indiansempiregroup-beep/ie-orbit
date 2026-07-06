# Example Model Implementation

The following example demonstrates how future milestones should use the database foundation. It is not active source code.

```python
from django.db import models

from apps.core.db.constraints import active_unique_constraint
from apps.core.models import TenantModel


class ExampleTenantRecord(TenantModel):
    name = models.CharField(max_length=120)

    class Meta:
        db_table = "example_tenant_records"
        constraints = [
            active_unique_constraint(
                fields=["tenant", "name"],
                name="uq_example_tenant_record_active_name",
            )
        ]
```

The concrete model above must not be added until a product milestone authorizes it.
