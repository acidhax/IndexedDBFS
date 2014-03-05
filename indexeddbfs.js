var IndexedDBFs = function () {
	// I need a fake filesystem in IndexedDB
	this.maxChunkSize = 1024;


  var self = this
  new Lawnchair({ adapter:'indexed-db', name: 'files', record: 'file' }, function() { 
    self._fileList = this; 
  });
  new Lawnchair({ adapter:'indexed-db', name: 'fileData', record: 'fileChunk'}, function() { 
    self._fileData = this; 
  });
}


IndexedDBFs.prototype.getFileList = function(cb) {
  this._fileList.keys(function(keys) {
    if (keys) {
      cb(null, keys);
    } else {
      cb('Error getting keys')
    }
  });
};

IndexedDBFs.prototype.fileExists = function(fileName, cb) {
  this._fileList.exists(fileName, function(exists) {
    cb(null, exists);
  });
};

IndexedDBFs.prototype.createFile = function(fileName, data, cb) {
  if (!cb && typeof data == 'function') {
    cb = data;
    data = {};
  } else if (!cb && !data) {
    data = {};
  }

  var file = { key: fileName, data: data };
  this._fileList.save(file, function() {
    cb && cb();
  });
};

IndexedDBFs.prototype.getFile = function(fileName, cb) {
  this._fileList.get(fileName, function(file) {
    cb(null, file);
  });
};

IndexedDBFs.prototype.deleteFile = function(fileName, cb) {
  this._fileList.remove(fileName, function() {
    cb && cb(null);
  });
};


IndexedDBFs.prototype.nukeEverything = function(areYouSure, cb) {
  if (areYouSure === 'yesplx') {
    this._fileList.nuke();
    this._fileData.nuke();
    setTimeout(cb, 100);
  }
};