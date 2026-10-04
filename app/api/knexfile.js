require('dotenv').config();

/** @type { import("knex").Knex.Config } */
module.exports = {
  client: 'postgresql',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: './db/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './db/seeds',
  },
};
