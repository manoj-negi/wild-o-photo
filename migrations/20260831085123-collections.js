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
    CREATE TABLE collections (
      id INT PRIMARY KEY AUTO_INCREMENT,

      name VARCHAR(255) NOT NULL,
      description TEXT,

      cover_photo_id INT
    )
  `);
};

exports.down = function (db) {
  return db.runSql(`
    DROP TABLE collections
  `);
};

exports._meta = {
  version: 1,
};
