/**
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('hold_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('holds')
      .onDelete('RESTRICT');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('sku_id')
      .notNullable()
      .references('id')
      .inTable('skus')
      .onDelete('RESTRICT');
    table.integer('qty').notNullable();
    table.integer('amount_cents').notNullable();
    table.specificType('status', 'order_status').notNullable().defaultTo('pending');
    table.text('payment_ref').nullable();
    table.timestamp('paid_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('orders');
};
