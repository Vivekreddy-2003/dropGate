/**
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.schema.createTable('drops', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('merchant_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.text('name').notNullable();
    table.text('slug').notNullable().unique();
    table.specificType('status', 'drop_status').notNullable().defaultTo('draft');
    table.timestamp('registration_opens_at', { useTz: true }).notNullable();
    table.timestamp('goes_live_at', { useTz: true }).notNullable();
    table.integer('hold_ttl_seconds').notNullable().defaultTo(600);
    table.integer('max_per_user').notNullable().defaultTo(1);
    table.integer('admit_batch_size').notNullable().defaultTo(2);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX drops_status_goes_live_at_idx ON drops (status, goes_live_at);
  `);
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('drops');
};
