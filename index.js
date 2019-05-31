'use strict'
// vim: set ts=2 sw=2:
const Pool = require('pg-pool')
const pg = require('pg')
const pgUtil = require('pg/lib/utils')

// Exports, main export is a singleton
module.exports = createPoolFactory()
module.exports.createPoolFactory = createPoolFactory

// Helpers
module.exports.SQL = require('sql-template-strings')
module.exports.errors = require('pg-error-constants')

function createPoolFactory (initialPool) {
  // This module exports a singleton.
  // The pool instance is stored here
  let _pool = initialPool
  let _connected
  let _closing

  const factory = async function (opts) {
    if (!opts && _pool && _connected === true) {
      return _pool
    }

    // Pool connecting
    if (!opts && _pool && _connected instanceof Promise) {
      await _connected
      return _pool
    }

    // Close the old pool if this one is being re-configured
    if (_pool) {
      await _pool.end()
    }

    // Set defaults from env vars
    _pool = new Pool(Object.assign({
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      Client: Client
    }, opts))

    // Ensure connected and can query
    _connected = _pool.query('SELECT TRUE')
    await _connected
    _connected = true
    return _pool
  }

  // Augment the factory function
  factory.end = async function () {
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
  factory.transaction = async function transaction (opts, cb) {
    if (!_pool) {
      throw new Error('You must configure the pool before calling methods')
    }

    // Accept options
    if (typeof opts === 'function' && !cb) {
      cb = opts
      opts = {}
    }

    const conn = await _pool.connect()
    let ret
    try {
      await conn.query(`
        BEGIN
        ${opts.serializable ? 'SERIALIZABLE' : ''}
        ${opts.readOnly ? 'READ ONLY' : ''}
        ${opts.deferrable ? 'DEFERRABLE' : ''}
      `)
      ret = await cb(conn)
      await conn.query('COMMIT')
      conn.release()
    } catch (e) {
      await conn.query('ROLLBACK')
      conn.release(e)
      throw e
    }
    return ret
  }

  // Proxy other pool methods
  ;['connect', 'query'].forEach((prop) => {
    factory[prop] = function poolProxyMethod (...args) {
      if (!_pool) {
        throw new Error('You must configure the pool before calling methods')
      }
      return _pool[prop](...args)
    }
  })

  return factory
}

// Extend client with our custom query implementation
class Client extends pg.Client {
  async query (sql, values, callback) {
    const config = pgUtil.normalizeQueryConfig(sql, values, callback)

    // Callback version
    if (config.callback) {
      const fnc = config.callback
      config.callback = (err, res) => {
        fnc(addSQLToError(err, config.text, config.values), res)
      }
      return super.query(config)
    }

    // Promise version
    try {
      return await super.query(config)
    } catch (e) {
      throw addSQLToError(e, config.text, config.values)
    }
  }
}

// thanks @iarna
// https://github.com/iarna/iarna-pg/blob/9f6ad95cb42fc12b9f1dbf0a9ef0beba884eb0f1/pg.js#L32-L42
function addSQLToError (e, sql, params) {
  if (!e) {
    return
  }
  const err = new Error(e.message)
  for (let key in e) {
    if (key !== 'message') {
      err[key] = e[key]
    }
  }
  err.sql = sql
  err.params = params
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Custom_Error_Types
  Error.captureStackTrace(err, addSQLToError)
  return err
}
