/**
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.raw(`
    CREATE TYPE user_role AS ENUM ('shopper', 'merchant');
    CREATE TYPE drop_status AS ENUM ('draft', 'scheduled', 'live', 'sold_out', 'ended');
    CREATE TYPE waiting_room_status AS ENUM ('queued', 'admitted', 'purchased', 'abandoned');
    CREATE TYPE hold_status AS ENUM ('held', 'confirmed', 'expired', 'released');
    CREATE TYPE order_status AS ENUM ('pending', 'paid', 'failed');
  `);
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async (knex) => {
  await knex.raw(`
    DROP TYPE IF EXISTS order_status;
    DROP TYPE IF EXISTS hold_status;
    DROP TYPE IF EXISTS waiting_room_status;
    DROP TYPE IF EXISTS drop_status;
    DROP TYPE IF EXISTS user_role;
  `);
};
