const db = require('../../db/knex');

const PUBLIC_USER_COLUMNS = ['id', 'email', 'role', 'created_at'];

async function findByEmail(email) {
  return db('users').where({ email: email.toLowerCase() }).first();
}

async function findById(id) {
  return db('users').where({ id }).first();
}

async function createUser({ email, passwordHash, role }) {
  const [row] = await db('users')
    .insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role,
    })
    .returning(PUBLIC_USER_COLUMNS);
  return row;
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  toPublicUser,
  /** @private for login only */
  _selectWithPassword: (email) =>
    db('users').where({ email: email.toLowerCase() }).first(),
};
