# Synthetic fixtures

Every generated document is fictional and marked `SAMPLE — NOT VALID`. No name, route, flight,
reservation, passport, phone number, or email belongs to a real person.

Run `pnpm fixtures` from the repository root. Large 10 MiB boundary fixtures are intentionally
generated into the ignored `generated/` directory instead of being committed to Git. Unit tests
also import the deterministic fixture builders directly.
