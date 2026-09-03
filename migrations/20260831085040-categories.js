"use strict";

var dbm;
var type;
var seed;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.up = function (db) {
  return db.runSql(`
    CREATE TABLE categories (
      id INT PRIMARY KEY AUTO_INCREMENT,

      name VARCHAR(255) UNIQUE NOT NULL,
      description TEXT
    )
  `);
};

exports.down = function (db) {
  return db.runSql(`
    DROP TABLE categories
  `);
};

exports.down = function (db) {
  return null;
};

exports._meta = {
  version: 1,
};
