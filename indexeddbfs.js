var IndexedDBFs = function (options) {
  options = options || {};

	this.chunkSize = options.chunkSize || 1024;

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

IndexedDBFs.prototype.getFileData = function(fileName, cb) {
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


IndexedDBFs.prototype._getChunk = function(fileName, chunkNum, cb) {
  this._fileData.get(fileName + '_' + chunkNum, function(chunk) {
    cb(null, chunk ? chunk.chunk : null);
  });
};


IndexedDBFs.prototype._setChunk = function(fileName, chunkNum, chunk, cb) {
  var data = {
    key: fileName + '_' + chunkNum,
    chunk: chunk
  };

  this._fileData.save(data, function() {
    cb && cb(null);
  })
};


IndexedDBFs.prototype.save = function(fileName, fileData, cb) {
  var toCall = null;

  if (typeof fileData === 'string') {
    toCall = this._saveString;
  } else if (fileData instanceof ArrayBuffer) {
    toCall = this._saveBuffer;
  }

  if (!toCall) {
    cb('Invalid data to save');
  } else {
    var self = this;
    this._setDataType(fileName, fileData.constructor.name, function(err) {
      toCall.call(self, fileName, fileData, cb);
    });
  }
};

IndexedDBFs.prototype._saveString = function(fileName, stringData, cb) {
  var arrayBuffer = new ArrayBuffer(stringData.length * 2); // 2 bytes for each char
  var array = new Uint16Array(arrayBuffer);
  for (var i = 0; i < stringData.length; i++) {
    array[i] = stringData.charCodeAt(i);
  }
  
  this._saveBuffer(fileName, arrayBuffer, cb);
};

IndexedDBFs.prototype._saveBuffer = function(fileName, arrayBuffer, cb) {
  var self = this;
  var chunkNum = -1;

  function process() {
    chunkNum++;
    var chunk = arrayBuffer.slice(chunkNum * self.chunkSize, (chunkNum + 1) * self.chunkSize);
    if (chunk.byteLength > 0) {
      self._setChunk(fileName, chunkNum, chunk, process);
    } else {
      cb();
    }
  }

  process();
};


IndexedDBFs.prototype._setDataType = function(fileName, dataType, cb) {
  var self = this;
  this.getFileData(fileName, function(err, file) {
    if (!err && file) {
      file.dataType = dataType;
      self._fileList.save(file, cb);
    } else {
      cb(err || 'file not found');
    }
  });
};


IndexedDBFs.prototype._getDataType = function(fileName, cb) {
  this.getFileData(fileName, function(err, file) {
    if (!err && file) {
      cb(null, file.dataType || null);
    } else {
      cb(err || 'file not found')
    }
  });
};

IndexedDBFs.prototype.getFile = function(fileName, cb) {
  var self = this;
  self._getDataType(fileName, function(err, dataType) {
    if (!err) {
      if (dataType) {
        if (dataType.toLowerCase() === 'string') {
          self._getString(fileName, cb);
        } else if (dataType.toLowerCase() === 'arraybuffer') {
          self._getBuffer(fileName, cb);
        }
      } else {
        cb('no data type - unable to process');
      }
    } else {
      cb(err);
    }
  });
};

IndexedDBFs.prototype._getString = function(fileName, cb) {
  var self = this;
  var chunkNum = -1;
  var stringData = "";
  function process() {
    chunkNum++;
    self._getChunk(fileName, chunkNum, function(err, chunk) {
      if (!err) {
        if (chunk) {
          stringData += String.fromCharCode.apply(null, new Uint16Array(chunk));
          process();
        } else {
          cb(null, stringData);
        }
      } else {
        cb(err);
      }
    });
  }

  process();
};

IndexedDBFs.prototype._getBuffer = function(fileName, cb) {
  var self = this;
  var chunkNum = -1;
  var outArray = new Uint8Array(0);
  function process() {
    chunkNum++;
    self._getChunk(fileName, chunkNum, function(err, chunk) {
      if (!err) {
        if (chunk) {
          var append = new Uint8Array(chunk);
          var swapArray = new Uint8Array(append.length + outArray.length);
          swapArray.set(outArray, 0);
          swapArray.set(append, outArray.length);
          outArray = swapArray;

          process();
        } else {
          cb(null, outArray.buffer);
        }
      } else {
        cb(err);
      }
    });
  }

  process();
};