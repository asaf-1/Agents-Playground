// The Practice page's progress: which planted faults a signed-up customer has
// marked "I found it". The ticks are the customer's own word (the site cannot
// tell that someone found a bug), kept in bank_practice_progress, one row per
// customer and fault. The routes check the fault is in the catalogue and that
// the account is not a shared demo one before anything here runs.

// One row as the API shows it.
function toFound(row) {
  return {
    flag: row.flag,
    foundAt: new Date(row.found_at).toISOString(),
  };
}

// What the customer has found, oldest first.
async function listFound(db, userId) {
  const { rows } = await db.query(
    `SELECT flag, found_at FROM bank_practice_progress
      WHERE user_id = $1
      ORDER BY found_at, flag`,
    [userId],
  );
  return rows.map(toFound);
}

// Marks a fault found. Marking it again keeps the first time.
async function markFound(db, userId, flag) {
  await db.query(
    `INSERT INTO bank_practice_progress (user_id, flag) VALUES ($1, $2)
      ON CONFLICT (user_id, flag) DO NOTHING`,
    [userId, flag],
  );
}

// Takes the mark off one fault. Taking it off twice is harmless.
async function unmarkFound(db, userId, flag) {
  await db.query(
    "DELETE FROM bank_practice_progress WHERE user_id = $1 AND flag = $2",
    [userId, flag],
  );
}

// Clears every mark, for Start over.
async function clearFound(db, userId) {
  await db.query("DELETE FROM bank_practice_progress WHERE user_id = $1", [
    userId,
  ]);
}

module.exports = { clearFound, listFound, markFound, unmarkFound };
