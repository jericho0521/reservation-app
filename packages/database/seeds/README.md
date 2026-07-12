# Database Seeds

Development seeds are separated from core schema migrations.

`development/project-play-compat.sql` tracks the current Project Play
compatibility data source sections. Loading this seed is optional and must not
be treated as part of a clean backend platform install.

`racing-demo.sql` is the deterministic Apex Grid flagship fixture. It creates a
published racing experience, six simulators, operating hours, one maintenance
conflict, and one sample reservation. It is development/demo data only.

`rooms-demo.sql` creates the Northstar Rooms flagship fixture with attendee
capacities, equipment metadata, operating hours, maintenance, and an existing
meeting. It is development/demo data only.

`appointments-demo.sql` creates the Luma Studio flagship fixture with three
specialists, 45-minute appointment metadata, staff hours, and an overlapping
sample appointment. It is development/demo data only.
