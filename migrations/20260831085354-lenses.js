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
    CREATE TABLE lenses (
      id INT PRIMARY KEY AUTO_INCREMENT,

      brand VARCHAR(255),
      model VARCHAR(255) NOT NULL,

      UNIQUE (brand, model)
    )
  `);
};

exports.down = function (db) {
  return db.runSql(`
    DROP TABLE lenses
  `);
};

exports._meta = {
  version: 1,
};
