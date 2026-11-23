-- Reverts 001_init.sql. The vector extension is left in place: it is shared and harmless.
DROP TABLE IF EXISTS chunks;
DROP TABLE IF EXISTS sources;
