PRAGMA foreign_keys = ON;

ALTER TABLE two_factors ADD COLUMN locked_until TEXT;
