/**
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.schema.createTable('skus', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('drop_id')
      .notNullable()
      .references('id')
      .inTable('drops')
      .onDelete('RESTRICT');
    table.text('name').notNullable();
    table.integer('price_cents').notNullable();
    table.string('currency', 3).notNullable().defaultTo('INR');
    table.integer('total_qty').notNullable();
    table.integer('remaining_qty').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE skus ADD CONSTRAINT skus_remaining_check
      CHECK (remaining_qty >= 0 AND remaining_qty <= total_qty);
    CREATE INDEX skus_drop_id_idx ON skus (drop_id);
  `);
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('skus');
};
