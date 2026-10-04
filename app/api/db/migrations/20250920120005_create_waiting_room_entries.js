/**
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.schema.createTable('waiting_room_entries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('drop_id')
      .notNullable()
      .references('id')
      .inTable('drops')
      .onDelete('RESTRICT');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table.integer('position').notNullable();
    table.specificType('status', 'waiting_room_status').notNullable().defaultTo('queued');
    table.timestamp('admitted_at', { useTz: true }).nullable();
    table.text('admit_token_hash').nullable();
    table.timestamp('admit_token_expires_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['drop_id', 'user_id']);
    table.unique(['drop_id', 'position']);
  });

  await knex.raw(`
    CREATE INDEX waiting_room_entries_drop_id_position_idx
      ON waiting_room_entries (drop_id, position);
    CREATE INDEX waiting_room_entries_drop_id_status_idx
      ON waiting_room_entries (drop_id, status);
  `);
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('waiting_room_entries');
};
