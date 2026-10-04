# demo-fixtures

SYNTHETIC TRAINING DATA. Nothing in this directory is real.

This folder is the only location the mock `shared_drive.search` / `shared_drive.read`
tools may read. Every credential-looking string is an explicit fake marker of the form
`DEMO_FAKE_SECRET::...` and authenticates only against the in-process ledger simulator.
