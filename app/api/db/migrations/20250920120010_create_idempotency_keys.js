/**
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.schema.createTable('idempotency_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('key').notNullable();
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.text('route').notNullable();
    table.integer('status_code').notNullable();
    table.jsonb('response_body').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'route', 'key']);
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('idempotency_keys');
};
