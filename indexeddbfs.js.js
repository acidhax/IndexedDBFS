var IndexedDBFs = function () {
	// I need a fake filesystem in IndexedDB
	this.maxChunkSize = 1024;
}

IndexedDBFs.prototype.getFileInfo = function(filename, cb) {
	cb(null, {});
};

IndexedDBFs.prototype.setFileInfo = function(filename, fileInfo, cb) {
	cb(null, {});
};

IndexedDBFs.prototype.getChunkCount = function(filename, cb) {
	cb(null, 0);
};

IndexedDBFs.prototype.getChunk = function (filename, chunkNum, cb) {
	// CB chunk as Uint8Array.
	cb(null, {});
};

IndexedDBFs.prototype.getChunkAsBlob = function (filename, chunkNum, cb) {
	this.getChunk(filename, chunkNum, function (err, array) {
		cb(err, array);
	});
	// CB chunk as Blob.
};

IndexedDBFs.prototype.addChunk = function (filename, cb) {
	// Auto increment chunk num.
};

IndexedDBFs.prototype.getDB = function(name, cb) {
	var db = IndexedDBFs.dbs[name];
    if (db) {
      cb(null, db);
    }

    var req;
    try {
      req = IndexedDBFs.indexedDB().open(name, IndexedDBFs.DB_VERSION);
    } catch (e) {
      return cb(e);
    }
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      var transaction = e.target.transaction;

      var fileStore;

      if (db.objectStoreNames.contains(IndexedDBFs.DB_STORE_NAME)) {
        fileStore = transaction.objectStore(IndexedDBFs.DB_STORE_NAME);
      } else {
        fileStore = db.createObjectStore(IndexedDBFs.DB_STORE_NAME);
      }

      fileStore.createIndex('timestamp', 'timestamp', { unique: false });
    };
    req.onsuccess = function() {
      db = req.result;
      // add to the cache
      IndexedDBFs.dbs[name] = db;
      callback(null, db);
    };
    req.onerror = function() {
      callback(this.error);
    };
};

IndexedDBFs.dbs = {};
IndexedDBFs.DB_VERSION = 1;
IndexedDBFs.DB_STORE_NAME = "FILE_DATA";