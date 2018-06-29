# Postgres Pool Singleton (w/ extras)

[![NPM Version](https://img.shields.io/npm/v/@wesleytodd/pg.svg)](https://npmjs.org/package/@wesleytodd/pg)
[![NPM Downloads](https://img.shields.io/npm/dm/@wesleytodd/pg.svg)](https://npmjs.org/package/@wesleytodd/pg)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](https://github.com/standard/standard)

This package wraps the `pg-pool` package to provide a singleton which need only be configured once
before being used.  This pattern has been a nice one for most of my applications because often you
just want to connect to a single database per application.  It is not the right setup for everything,
but for my use cases it is good.

This package also adds a helper for running transactions which I have reused/reimplemented in
multiple projects.  It might be something worth publishing as a separate package in the future, but
is included here for now because I am being lazy.

## Usage

```
$ npm install --save @wesleytodd/pg
```

```javascript
// index.js
const pool = require('@wesleytodd/pg')

asnyc function main () {
  // configure the pool once durring application startup
  // (see options of pg package, these are passed directly to it)
  await pool({
    host: 'localhost',
    user: 'testuser',
    database: 'testdb',
    password: 'testpass'
  })

  // for example while creating an express server
  const app = express()
  app.get('/', require('./handler.js'))
  // ...
}

// handler.js
// In your other files, you can not just import and use it
const pool = require('@wesleytodd/pg')

module.exports = async function (req, res) {
  const conn = await pool()
  const res = await conn.query('SELECT * from foo;')
  res.json({
    foos: res.rows
  })
}
```

### Transactions

The transaction helper will get a connection from the pool, begin the transaction then run your callback.
If the promise is rejected (or an error thrown with async/await) it will rollback, if it resolves 
it will commit the transaction and return the resolved value.

```javascript
const p = await pool()
const res = await p.transaction(async (conn) => {
  const fooRes = await conn.query('INSERT INTO foo (foo) VALUES ($1) RETURNING id', ['foo'])
  const barRes = await conn.query('INSERT INTO bar (fooId, bar) VALUES ($1, $2)', [fooRes.rows[0].id, 'bar'])
  return {
    fooId: fooRes.rows[0].id,
    barId: barRes.rows[0].id
  }
})
console.log(res) // {fooId: 1, barId: 1}
```

## Contributing

To run the tests you will need docker installed, they are more integration than unit tests.  Once you 
have docker, you can just run `npm t` like normal.  PR's are welcome and should be made against master.
Before you open one for a feature or change, it is usually a good idea to open an issue to make sure
we align on the changes.
