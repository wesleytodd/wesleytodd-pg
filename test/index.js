'use strict'
// vim: set ts=2 sw=2:
const {describe, it, before, after} = require('mocha')
const assert = require('assert')
const {name: pkgName} = require('../package.json')
const Pool = require('../')

describe(pkgName, () => {
  let pool
  before(async () => {
    pool = await Pool({
      host: 'localhost',
      port: 5433,
      user: 'testuser',
      database: 'testdb',
      password: 'testpass'
    })
  })
  after(async () => {
    await pool.query('DROP TABLE IF EXISTS testtrans')
    await pool.query('DROP TABLE IF EXISTS testrollback')
    return Pool.end()
  })

  it('should query a server', async () => {
    const res = await pool.query('SELECT schemaname, tablename FROM pg_catalog.pg_tables;')
    assert(res.rows.length)
  })

  it('should create a transaction', async () => {
    await pool.query('CREATE TABLE IF NOT EXISTS testtrans (id SERIAL, field VARCHAR(255), PRIMARY KEY(id));')

    const ins = await Pool.transaction((conn) => {
      return conn.query(`INSERT INTO testtrans (field) VALUES ('foo') RETURNING id;`)
    })
    assert.equal(ins.rows[0].id, 1)

    const sel = await pool.query('SELECT * FROM testtrans')
    assert.equal(sel.rows.length, 1)
    assert.equal(sel.rows[0].field, 'foo')
  })

  it('should rollback a transaction', async () => {
    await pool.query('CREATE TABLE IF NOT EXISTS testrollback (id SERIAL, field VARCHAR(255), PRIMARY KEY(id));')

    try {
      await Pool.transaction(async (conn) => {
        const ret = await conn.query(`INSERT INTO testrollback (field) VALUES ('bar') RETURNING id;`)
        if (ret) throw new Error('lolz fail sauce')
        return ret
      })
    } catch (e) {
      // ignore
    }

    const sel = await pool.query('SELECT * FROM testrollback')
    assert.equal(sel.rows.length, 0)
  })

  it('should handle errors and add sql', async () => {
    // Even though this looks like it tests the promise
    // interface, the pool makes it a callback
    try {
      await pool.query('INVALID QUERY')
    } catch (e) {
      assert.strictEqual(e.sql, 'INVALID QUERY')
      assert.strictEqual(e.params, undefined)
    }

    // Promise version requires normal client
    const c = await pool.connect()
    try {
      await c.query('INVALID QUERY', ['foo'])
    } catch (e) {
      assert.strictEqual(e.sql, 'INVALID QUERY')
      assert.strictEqual(e.params[0], 'foo')
    }
    await c.release()
  })
})
