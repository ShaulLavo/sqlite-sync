export const migrationStatements = [
	{
		id: 'base',
		sql: [
			`CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        created_at text DEFAULT (current_timestamp) NOT NULL
      )`
		]
	},
	{
		id: '0000_lying_jack_murdock',
		sql: [
			`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        author_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        FOREIGN KEY (author_id) REFERENCES users(id) ON UPDATE NO ACTION ON DELETE CASCADE
      );
      `,
			`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL
      );
      `,
			`CREATE UNIQUE INDEX users_name_unique ON users(name);`,
			`CREATE UNIQUE INDEX users_email_unique ON users(email);`
		]
	}
]
