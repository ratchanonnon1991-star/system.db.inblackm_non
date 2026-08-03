-- Runs only on first container init (empty data volume). If the volume
-- already has data, create the database manually instead:
--   docker exec gamedb-postgres psql -U postgres -c "CREATE DATABASE gameinfo;"
CREATE DATABASE gameinfo;
