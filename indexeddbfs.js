
/**
 * IndexedDBFs - a simple Javascript filesystem that allows you to store strings, blobs, arrays, array buffers and
 * access them like long-term storage.
 * @param {Object} options Different options for the filesystem
 *                           - chunkSize: the number of bytes to segment each file into within the filesystem
 */
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


/**
 * Returns a complete listing of filenames within the filesystem
 * @param  {Function} cb Callback function (err, keys) {}
 */
IndexedDBFs.prototype.getFileList = function(cb) {
  this._fileList.keys(function(keys) {
    if (keys) {
      cb(null, keys);
    } else {
      cb('Error getting keys')
    }
  });
};


/**
 * Returns whether or not a file exists by a given name
 * @param  {String}   fileName The file's name to look up
 * @param  {Function} cb       Callback function (err, exists) {}
 */
IndexedDBFs.prototype.fileExists = function(fileName, cb) {
  this._fileList.exists(fileName, function(exists) {
    cb(null, exists);
  });
};

/**
 * Creates a file and optionally sets metadata for the file
 * @param  {String}   fileName The file's name to create
 * @param  {Object}   data     The metadata to set on the file
 * @param  {Function} cb       Callback function (err) {}
 */
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


/**
 * Returns the metadata for a file
 * @param  {String}   fileName the file's name to look up
 * @param  {Function} cb       Callback function(err, fileObject) {}
 */
IndexedDBFs.prototype.getFileData = function(fileName, cb) {
  this._fileList.get(fileName, function(file) {
    cb(null, file);
  });
};


/**
 * Deletes a file by its name
 * @param  {String}   fileName The file name to delete
 * @param  {Function} cb       Callback function(err) {}
 */
IndexedDBFs.prototype.deleteFile = function(fileName, cb) {
  this._fileList.remove(fileName, function() {
    cb && cb(null);
  });
};


/**
 * Deletes the entire filesystem - useful for testing
 * @param  {String}   areYouSure A check value that must equal "yesplx" to run
 * @param  {Function} cb         Callback function
 */
IndexedDBFs.prototype.nukeEverything = function(areYouSure, cb) {
  if (areYouSure === 'yesplx') {
    this._fileList.nuke();
    this._fileData.nuke();
    setTimeout(cb, 100);
  }
};


/**
 * Gets a specific chunk from the database
 * @param  {String}   fileName The file to get the chunk for
 * @param  {Number}   chunkNum The chunk number to grab
 * @param  {Function} cb       Callback function(err, ArrayBuffer)
 */
IndexedDBFs.prototype._getChunk = function(fileName, chunkNum, cb) {
  this._fileData.get(fileName + '_' + chunkNum, function(chunk) {
    cb(null, chunk ? chunk.chunk : null);
  });
};


/**
 * Sets a specific chunk of a file
 * @param {String}        fileName the file to set the chunk on
 * @param {Number}        chunkNum The chunk number to set
 * @param {ArrayBuffer}   chunk    The chunk data in ArrayBuffer format
 * @param {Function}      cb       Callback function(err)
 */
IndexedDBFs.prototype._setChunk = function(fileName, chunkNum, chunk, cb) {
  var data = {
    key: fileName + '_' + chunkNum,
    chunk: chunk
  };

  this._fileData.save(data, function() {
    cb && cb(null);
  })
};


/**
 * Saves a file
 * @param  {String}   fileName The filename
 * @param  {Object}   fileData The data to save
 *                               Current formats include: 
 *                                 - String
 *                                 - ArrayBuffer
 * @param  {Function} cb       Callback function(err)
 */
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


/**
 * Saves a file with string contents
 *   Under the hood it converts the string into an ArrayBuffer and saves that.
 * @param  {String}   fileName   The file name
 * @param  {String}   stringData The string to save in the database
 * @param  {Function} cb         Callback function(err)
 */
IndexedDBFs.prototype._saveString = function(fileName, stringData, cb) {
  var arrayBuffer = new ArrayBuffer(stringData.length * 2); // 2 bytes for each char
  var array = new Uint16Array(arrayBuffer);
  for (var i = 0; i < stringData.length; i++) {
    array[i] = stringData.charCodeAt(i);
  }
  
  this._saveBuffer(fileName, arrayBuffer, cb);
};


/**
 * Saves a file with ArrayBuffer contents
 *   Under the hood it splits up the array buffer into smaller chunks and saves each one
 * @param  {String}       fileName    The file name
 * @param  {ArrayBuffer}  arrayBuffer The array buffer to save
 * @param  {Function}     cb          Callback function(err)
 */
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


/**
 * Set the dataType for a file
 * @param {String}   fileName The filename
 * @param {String}   dataType The data type that the file is being stored as
 * @param {Function} cb       Callback function(err)
 */
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


/**
 * Returns the dataType for a file
 * @param  {String}   fileName The filename
 * @param  {Function} cb       Callback function(err, dataType)
 */
IndexedDBFs.prototype._getDataType = function(fileName, cb) {
  this.getFileData(fileName, function(err, file) {
    if (!err && file) {
      cb(null, file.dataType || null);
    } else {
      cb(err || 'file not found')
    }
  });
};


/**
 * Returns a complete file in the format that it was saved in
 * @param  {String}   fileName The filename
 * @param  {Function} cb       Callback function(err, fileData)
 */
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


/**
 * Returns a file that was stored in a string format
 *   Retreives the chunks as an arrayBuffer and then converts it into a string before calling back
 * @param  {String}   fileName The filename
 * @param  {Function} cb       Callback function(err, fileData) {}
 */
IndexedDBFs.prototype._getString = function(fileName, cb) {
  var self = this;
  var chunkNum = -1;
  this._getBuffer(fileName, function(err, buffer) {
    if (!err && buffer) {
      cb(null, String.fromCharCode.apply(null, new Uint16Array(buffer)));
    } else {
      cb(err || 'File not found');
    }
  });
};

/**
 * Returns a file that was stored in an ArrayBuffer format
 * @param  {String}   fileName The filename
 * @param  {Function} cb       Callback function(err, fileData) {}
 */
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

IndexedDBFs.prototype.setBytes = function(fileName, buffer, startPos, cb) {
  var self = this;
  var startChunk = Math.floor(startPos / this.chunkSize);
  var endChunk = Math.floor((startPos + buffer.byteLength) / this.chunkSize);
  var currentChunk = startChunk - 1;

  function process() {
    currentChunk++;

    if(currentChunk > endChunk) {
      cb(null);
      return;
    }

    var startInChunk = 0;
    var endInChunk = self.chunkSize;

    if (startChunk === currentChunk) {
      startInChunk = startPos % self.chunkSize;
    }

    if (endChunk === currentChunk) {
      endInChunk = (startPos + buffer.byteLength) % self.chunkSize
    }

    var chunkSize = endInChunk - startInChunk;

    // Get the chunk
    self._getChunk(fileName, currentChunk, function(err, chunk) {
      if (!err) {

        chunk = chunk?new Uint8Array(chunk):null;

        if(!chunk) {          
          chunk = new Uint8Array(chunkSize + startInChunk);
        } else if(chunk.length < chunkSize) {
          var swapArray = new Uint8Array(chunkSize + startInChunk);
          swapArray.set(chunk, 0);
          chunk = swapArray;
        }

        var sliceStart = ((currentChunk - startChunk) * chunkSize);
        var sliceEnd = sliceStart + chunkSize;

        if (currentChunk !== startChunk) {
          sliceStart += startPos % self.chunkSize;
          sliceEnd += startPos % self.chunkSize;
        } else {
          sliceEnd -= startPos % self.chunkSize;
        }

        var slice = new Uint8Array(buffer.slice(sliceStart, sliceEnd));

        console.log('***********************************************************');
        console.log(chunkSize, slice.length);
        console.log(chunk);
        console.log(slice);
        chunk.set(slice, startInChunk);
        console.log(chunk);

        self._setChunk(fileName, currentChunk, chunk.buffer, process);

      } else {
        cb(err);
      }
    });
  }

  process();
};

IndexedDBFs.prototype.getBytes = function(fileName, startPos, endPos, cb) {

};

IndexedDBFs.prototype.appendBytes = function(fileName, buffer, cb) {

};