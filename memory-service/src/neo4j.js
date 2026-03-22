const neo4j = require('neo4j-driver');
const { config } = require('./config');

const driver = neo4j.driver(
  config.neo4j.uri,
  neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
);

async function ensureSchema() {
  const session = driver.session();
  try {
    await session.run('CREATE CONSTRAINT file_path_unique IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE');
    await session.run('CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE');
    await session.run('CREATE CONSTRAINT symbol_key_unique IF NOT EXISTS FOR (s:Symbol) REQUIRE s.key IS UNIQUE');
    await session.run('CREATE INDEX file_language_idx IF NOT EXISTS FOR (f:File) ON (f.language)');
    await session.run('CREATE FULLTEXT INDEX chunk_text_fulltext IF NOT EXISTS FOR (c:Chunk) ON EACH [c.text]');
  } finally {
    await session.close();
  }
}

async function closeDriver() {
  await driver.close();
}

module.exports = { driver, ensureSchema, closeDriver };
