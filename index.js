'use strict'
// vim: set ts=2 sw=2:
const Pool = require('pg-pool')

// This module exports a singleton.
// The pool instance is stored here
let _pool
let _connected
let _closing

module.exports = async (opts) => {
  if (!opts && _pool && _connected === true) {
    return Promise.resolve(_pool)
  }

  // Pool connecting
  if (!opts && _pool && _connected instanceof Promise) {
    return _connected.then(() => _pool)
  }

  if (_pool) {
    await _pool.end()
  }

  // Set defaults from env vars
  _pool = new Pool(Object.assign({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB
  }, opts))

  // Ensure connected and can query
  _connected = _pool.query('SELECT TRUE')
  return _connected.then(() => {
    _connected = true
    return _pool
  })
}

module.exports.end = async function () {
  if (!_pool) {
    return
  }
  if (_closing) {
    return _closing
  }
  _closing = _pool.end()
  const ret = await _closing
  _closing = false
  _connected = false
  _pool = null
  return ret
}

// Transaction wrapper helper
module.exports.transaction = async function transaction (cb) {
  if (!_pool) {
    throw new Error('You must configure the pool before calling methods')
  }

  const conn = await _pool.connect()
  let ret
  try {
    await conn.query('BEGIN')
    ret = await cb(conn)
    await conn.query('COMMIT')
  } catch (e) {
    await conn.query('ROLLBACK')
    throw e
  } finally {
    conn.release()
  }
  return ret
}

// Proxy other pool methods
;['connect', 'query'].forEach((prop) => {
  module.exports[prop] = function poolProxyMethod (...args) {
    if (!_pool) {
      throw new Error('You must configure the pool before calling methods')
    }
    return _pool[prop](...args)
  }
})
