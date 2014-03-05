var requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
/**
 * IndexedDBFs - a simple Javascript filesystem that allows you to store strings, blobs, arrays, array buffers and
 * access them like long-term storage.
 * @param {Object} options Different options for the filesystem
 *                           - chunkSize: the number of bytes to segment each file into within the filesystem
 */
var IndexedDBFs = function (options) {
  options = options || {};

	this.chunkSize = options.chunkSize || 1024;
  this._fileOperations = {};

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
 * @param  {String}   filename The file's name to look up
 * @param  {Function} cb       Callback function (err, exists) {}
 */
IndexedDBFs.prototype.fileExists = function(filename, cb) {
  this._fileList.exists(filename, function(exists) {
    cb(null, exists);
  });
};

/**
 * Creates a file and optionally sets metadata for the file
 * @param  {String}   filename The file's name to create
 * @param  {Object}   data     The metadata to set on the file
 * @param  {Function} cb       Callback function (err) {}
 */
IndexedDBFs.prototype.createFile = function(filename, data, cb) {
  if (!cb && typeof data == 'function') {
    cb = data;
    data = {};
  } else if (!cb && !data) {
    data = {};
  }

  var file = { key: filename, data: data };
  this._fileList.save(file, function() {
    cb && cb();
  });
};


/**
 * Returns the metadata for a file
 * @param  {String}   filename the file's name to look up
 * @param  {Function} cb       Callback function(err, fileObject) {}
 */
IndexedDBFs.prototype.getFileData = function(filename, cb) {
  this._fileList.get(filename, function(file) {
    cb(null, file);
  });
};


/**
 * Deletes a file by its name
 * @param  {String}   filename The file name to delete
 * @param  {Function} cb       Callback function(err) {}
 */
IndexedDBFs.prototype.deleteFile = function(filename, cb) {
  this._fileList.remove(filename, function() {
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
    cb && setTimeout(cb, 100);
  }
};


/**
 * Gets a specific chunk from the database
 * @param  {String}   filename The file to get the chunk for
 * @param  {Number}   chunkNum The chunk number to grab
 * @param  {Function} cb       Callback function(err, ArrayBuffer)
 */
IndexedDBFs.prototype._getChunk = function(filename, chunkNum, cb) {
  this._fileData.get(filename + '_' + chunkNum, function(chunk) {
    cb(null, chunk ? chunk.chunk : null);
  });
};


/**
 * Sets a specific chunk of a file
 * @param {String}        filename the file to set the chunk on
 * @param {Number}        chunkNum The chunk number to set
 * @param {ArrayBuffer}   chunk    The chunk data in ArrayBuffer format
 * @param {Function}      cb       Callback function(err)
 */
IndexedDBFs.prototype._setChunk = function(filename, chunkNum, chunk, cb) {
  var data = {
    key: filename + '_' + chunkNum,
    chunk: chunk
  };

  this._fileData.save(data, function() {
    cb && cb(null);
  })
};


/**
 * Saves a file
 * @param  {String}   filename The filename
 * @param  {Object}   fileData The data to save
 *                               Current formats include: 
 *                                 - String
 *                                 - ArrayBuffer
 * @param  {Function} cb       Callback function(err)
 */
IndexedDBFs.prototype.save = function(filename, fileData, cb) {
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
    this._setDataType(filename, fileData.constructor.name, function(err) {
      toCall.call(self, filename, fileData, cb);
    });
  }
};


/**
 * Saves a file with string contents
 *   Under the hood it converts the string into an ArrayBuffer and saves that.
 * @param  {String}   filename   The file name
 * @param  {String}   stringData The string to save in the database
 * @param  {Function} cb         Callback function(err)
 */
IndexedDBFs.prototype._saveString = function(filename, stringData, cb) {
  var arrayBuffer = new ArrayBuffer(stringData.length * 2); // 2 bytes for each char
  var array = new Uint16Array(arrayBuffer);
  for (var i = 0; i < stringData.length; i++) {
    array[i] = stringData.charCodeAt(i);
  }
  
  this._saveBuffer(filename, arrayBuffer, cb);
};


/**
 * Saves a file with ArrayBuffer contents
 *   Under the hood it splits up the array buffer into smaller chunks and saves each one
 * @param  {String}       filename    The file name
 * @param  {ArrayBuffer}  arrayBuffer The array buffer to save
 * @param  {Function}     cb          Callback function(err)
 */
IndexedDBFs.prototype._saveBuffer = function(filename, arrayBuffer, cb) {
  var self = this;
  var chunkNum = -1;

  function process() {
    chunkNum++;
    var chunk = arrayBuffer.slice(chunkNum * self.chunkSize, (chunkNum + 1) * self.chunkSize);
    if (chunk.byteLength > 0) {
      self._setChunk(filename, chunkNum, chunk, process);
    } else {
      cb();
    }
  }

  process();
};


/**
 * Set the dataType for a file
 * @param {String}   filename The filename
 * @param {String}   dataType The data type that the file is being stored as
 * @param {Function} cb       Callback function(err)
 */
IndexedDBFs.prototype._setDataType = function(filename, dataType, cb) {
  var self = this;
  this.getFileData(filename, function(err, file) {
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
 * @param  {String}   filename The filename
 * @param  {Function} cb       Callback function(err, dataType)
 */
IndexedDBFs.prototype._getDataType = function(filename, cb) {
  this.getFileData(filename, function(err, file) {
    if (!err && file) {
      cb(null, file.dataType || null);
    } else {
      cb(err || 'file not found')
    }
  });
};


/**
 * Returns a complete file in the format that it was saved in
 * @param  {String}   filename The filename
 * @param  {Function} cb       Callback function(err, fileData)
 */
IndexedDBFs.prototype.getFile = function(filename, cb) {
  var self = this;
  self._getDataType(filename, function(err, dataType) {
    if (!err) {
      if (dataType) {
        if (dataType.toLowerCase() === 'string') {
          self._getString(filename, cb);
        } else if (dataType.toLowerCase() === 'arraybuffer') {
          self._getBuffer(filename, cb);
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
 * @param  {String}   filename The filename
 * @param  {Function} cb       Callback function(err, fileData) {}
 */
IndexedDBFs.prototype._getString = function(filename, cb) {
  var self = this;
  var chunkNum = -1;
  this._getBuffer(filename, function(err, buffer) {
    if (!err && buffer) {
      cb(null, String.fromCharCode.apply(null, new Uint16Array(buffer)));
    } else {
      cb(err || 'File not found');
    }
  });
};

/**
 * Returns a file that was stored in an ArrayBuffer format
 * @param  {String}   filename The filename
 * @param  {Function} cb       Callback function(err, fileData) {}
 */
IndexedDBFs.prototype._getBuffer = function(filename, cb) {
  var self = this;
  var chunkNum = -1;
  var outArray = new Uint8Array(0);
  function process() {
    chunkNum++;
    self._getChunk(filename, chunkNum, function(err, chunk) {
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

IndexedDBFs.prototype._setBytes = function(filename, buffer, startPos, cb) {
  var self = this;
  var startChunk = Math.floor(startPos / this.chunkSize);
  var endChunk = Math.floor((startPos + buffer.byteLength) / this.chunkSize);
  var currentChunk = startChunk - 1;

  this.setMaxByte(filename, startPos + buffer.byteLength, function() {
    process();
  });

  function process() {
    currentChunk++;

    if(currentChunk > endChunk) {
      cb && cb(null);
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
    self._getChunk(filename, currentChunk, function(err, chunk) {
      if (!err) {

        chunk = chunk?new Uint8Array(chunk):null;

        if(!chunk) {          
          chunk = new Uint8Array(chunkSize + startInChunk);
        } else if(chunk.length < endInChunk) {
          var swapArray = new Uint8Array(endInChunk);
          swapArray.set(chunk, 0);
          chunk = swapArray;
        }

        var sliceStart = ((currentChunk - startChunk) * chunkSize);
        var sliceEnd = sliceStart + chunkSize;

        if (currentChunk !== startChunk) {
          sliceStart += startPos % self.chunkSize;
          sliceEnd += startPos % self.chunkSize;
        } else {
          //sliceEnd -= startPos % self.chunkSize;
        }



        var slice = new Uint8Array(buffer.slice(sliceStart, sliceEnd));
        chunk.set(slice, startInChunk);

        self._setChunk(filename, currentChunk, chunk.buffer, process);

      } else {
        cb && cb(err);
      }
    });
  }
};

IndexedDBFs.prototype.getBytes = function(filename, startPos, endPos, cb) {
  var self = this;
  var startChunk;
  var endChunk;
  var currentChunk;

  var outArray = new Uint8Array(0);

  this.getMaxByte(filename, function(err, max) {
    if (!err && max) {
      endPos = (endPos > max)?max:endPos;
      startChunk = Math.floor(startPos / self.chunkSize);
      endChunk = Math.floor(endPos / self.chunkSize);
      currentChunk = startChunk - 1;
      process();
    } else {
      cb(err || 'data not found');
    }
  });

  function process() {
    currentChunk++;
    if (currentChunk > endChunk) {
      cb(null, outArray.buffer);
      return;
    }
    
    var startInChunk = 0;
    var endInChunk = self.chunkSize;

    if (startChunk === currentChunk) {
      startInChunk = startPos % self.chunkSize;
    }

    if (endChunk === currentChunk) {
      endInChunk = endPos % self.chunkSize
    }

    self._getChunk(filename, currentChunk, function(err, chunk) {
      if (!err) {
        if (!chunk) {
          chunk = new Uint8Array(self.chunkSize).buffer;
        } else if (chunk.byteLength < self.chunkSize) {
          var swap = new Uint8Array(self.chunkSize);
          swap.set(new Uint8Array(chunk), 0);
          chunk = swap.buffer;
        }


        chunk = chunk.slice(startInChunk, endInChunk);
        var swapArray = new Uint8Array(outArray.length + chunk.byteLength);
        swapArray.set(outArray, 0);
        swapArray.set(new Uint8Array(chunk), outArray.length);
        outArray = swapArray;
        process();
      } else {
        cb(err);
      }
    });
  }
};


IndexedDBFs.prototype.setMaxByte = function(filename, max, cb) {
  var self = this;
  this.getFileData(filename, function(err, file) {
    if (!err && file) {
      if (!file.size || file.size < max) {
        file.size = max;
        self._fileList.save(file, cb || function() {});
      } else {
        cb && cb();
      }
    } else {
      cb && cb(err || 'file not found');
    }
  });
}

IndexedDBFs.prototype.getMaxByte = function(filename, cb) {
  this.getFileData(filename, function(err, file) {
    cb(err, file?file.size:null);
  });
};


IndexedDBFs.prototype._appendBytes = function(filename, buffer, cb) {
  var self = this;
  this.getMaxByte(filename, function(err, max) {
    if (!err) {
      max = max || 0;
      self._setBytes(filename, buffer, max, cb);
    } else {
      cb && cb(err);
    }
  });
};

IndexedDBFs.prototype.setBytes = function(fileName, buffer, startPos, cb) {
  this._queueOperation(fileName, '_setBytes', [ fileName, buffer, startPos ], cb);
};

IndexedDBFs.prototype.appendBytes = function(filename, buffer, cb) {
  this._queueOperation(filename, '_appendBytes', [ filename, buffer ], cb);
};

IndexedDBFs.prototype._queueOperation = function(filename, operation, args, cb) {
  if (!this._fileOperations[filename]) {
    this._fileOperations[filename] = [{ operation: operation, args: args, cb: cb }];
    this._processQueue(filename);
  } else {
    this._fileOperations[filename].push({ operation: operation, args: args, cb: cb });  
  }  
};

IndexedDBFs.prototype._processQueue = function(filename) {
  var self = this;
  if (this._fileOperations[filename].length) {
    var operation = this._fileOperations[filename].shift();
    
    operation.args.push(function() {
      var args = [].slice.call(arguments);
      operation.cb && operation.cb.apply(null, args);

      requestAnimationFrame(function() {
        self._processQueue(filename);
      });
    })

    this[operation.operation].apply(this, operation.args)
  } else {
    this._fileOperations[filename] = null;
  }
};