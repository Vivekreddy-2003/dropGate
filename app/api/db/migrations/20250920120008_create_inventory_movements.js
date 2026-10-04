/**
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.schema.createTable('inventory_movements', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('sku_id')
      .notNullable()
      .references('id')
      .inTable('skus')
      .onDelete('RESTRICT');
    table
      .uuid('hold_id')
      .nullable()
      .references('id')
      .inTable('holds')
      .onDelete('SET NULL');
    table
      .uuid('order_id')
      .nullable()
      .references('id')
      .inTable('orders')
      .onDelete('SET NULL');
    table.integer('delta').notNullable();
    table.text('reason').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('inventory_movements');
};
