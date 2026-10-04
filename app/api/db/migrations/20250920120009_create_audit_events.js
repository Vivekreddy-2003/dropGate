/**
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.schema.createTable('audit_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('actor_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('action').notNullable();
    table.text('entity_type').notNullable();
    table.uuid('entity_id').notNullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('audit_events');
};
