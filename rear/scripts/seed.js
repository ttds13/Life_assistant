const { seedDb } = require('../src/data/local-db')

seedDb()
  .then((result) => {
    console.info(JSON.stringify({ message: 'seed_ok', ...result }, null, 2))
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
