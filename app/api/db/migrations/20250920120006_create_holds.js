/**
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.schema.createTable('holds', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('drop_id')
      .notNullable()
      .references('id')
      .inTable('drops')
      .onDelete('RESTRICT');
    table
      .uuid('sku_id')
      .notNullable()
      .references('id')
      .inTable('skus')
      .onDelete('RESTRICT');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.integer('qty').notNullable().defaultTo(1);
    table.specificType('status', 'hold_status').notNullable().defaultTo('held');
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX holds_expires_at_idx ON holds (expires_at) WHERE status = 'held';
    CREATE UNIQUE INDEX holds_one_active_per_user_drop
      ON holds (user_id, drop_id) WHERE status = 'held';
  `);
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('holds');
};
