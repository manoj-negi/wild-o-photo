"use strict";

var dbm;
var type;
var seed;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};
exports.up = function (db) {
  return db.runSql(`
    CREATE TABLE roles (
      id INT PRIMARY KEY AUTO_INCREMENT,

      name VARCHAR(255) UNIQUE NOT NULL,
      description TEXT
    )
  `);
};

exports.down = function (db) {
  return db.runSql(`
    DROP TABLE roles
  `);
};

exports._meta = {
  version: 1,
};
