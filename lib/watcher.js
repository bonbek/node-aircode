var util = require('util')
	,events = require('events')
	,path = require('path')
	,fs = require('fs')
	,chokidar = require('chokidar');

module.exports = function(docsPath,proxy) {
	return new Watcher(docsPath,proxy);
}

/* 
 * File watcher
 * monitor docsPath tree to fire buffer's creation/update/deletion.
 */
function Watcher (docsPath,proxy) {
	events.EventEmitter.call(this);
	this.proxy   = proxy;
	this.folders = [];
	this.setDocsPath(docsPath);
}

util.inherits(Watcher,events.EventEmitter);

/*
 * Start monitoring
 */
Watcher.prototype.watch = function() {
	if (this.fswatcher)
		return;

	var self = this;
	this.fswatcher = new chokidar.FSWatcher({ignored: /[\/\\]\./, ignoreInitial:true, persistent: true});
	this.fswatcher
	.on('add', function(filepath) {
		var ext = path.extname(filepath).toLowerCase();
		if (ext === '.lua') {
			getSubject(filepath, function(subject) {
				if (subject instanceof Error)
					return console.log(subject);

				self.emit('fileAdded',subject);
				if (!subject.doNotUpdate) {
					self.proxy.updateBuffer(subject.project,subject.buffer,subject.contents,
						function(err) {
							if (!err)
								self.emit('bufferAdded',subject);
						});
				}
			});
		}
	})
	.on('change', function(filepath) {
		var ext = path.extname(filepath).toLowerCase();
		if (ext === '.lua') {
			getSubject(filepath, function(subject) {
				if (subject instanceof Error)
					return console.log(subject);

				self.emit('fileChanged',subject);
				if (!subject.doNotUpdate) {
					self.proxy.updateBuffer(subject.project,subject.buffer,subject.contents,
						function(err) {
							if (!err)
								self.emit('bufferChanged',subject);
						});
				}
			});
		}
	})
	.on('unlink', function(filepath) {
		var ext = path.extname(filepath).toLowerCase();
		if (ext === '.lua') {
			getSubject(filepath, function(subject) {
				if (subject instanceof Error)
					return console.log(subject);

				self.emit('fileRemoved',subject);
				if (!subject.doNotUpdate) {
					self.proxy.updateBuffer(subject.project,subject.buffer,subject.contents,
						function(err) {
							if (!err)
								self.emit('bufferRemoved',subject);
						});
				}
			},true);
		}
	});
	this.fswatcher.add(this.docsPath);
}

/*
 * Stop monitoring
 */
Watcher.prototype.unwatch = function(project) {
	if (this.fswatcher) {
		this.fswatcher.close();
		this.fswatcher = null;
	}
}

/*
 * Set root folder of projects
 * @param string root folder path
 */
Watcher.prototype.setDocsPath = function(docsPath) {
	this.unwatch();
	this.docsPath = path.resolve(docsPath);
	this.folders = [];
	var files = fs.readdirSync(docsPath);
	files.forEach(function(file) {
		var stats = fs.lstatSync(docsPath + '/' + file);
		if (stats && stats.isDirectory()) {
			this.folders.push(file);
		}
	}.bind(this));
	this.watch();
}

/*
 * @Internal
 * Update local files on remote opening project
 * files watching & remote update are locked during the process
 */
Watcher.prototype.updateStream = function(stream,project) {
	this.unwatch();
	var dir = this.docsPath + '/' + project + '/';
	if (!fs.existsSync(dir))
		fs.mkdirSync(dir);

	var rewatch = function() {
		this.watch();
	}.bind(this);
	stream.on('error',rewatch).on('end',rewatch);

	stream.on('data',function(data) {
		fs.writeFile(dir + data.name + '.lua', data.contents,
			function (err) {
				if (err)
					console.log('Error, can\'t sync buffer ' + project + data.name);
			});
	});
}

/*
 * @internal
 * Extracts project / buffer from filepath and return
 * descriptor including with file contents
 */
function getSubject (filepath,next,nocontent)
{
	var parts = path.dirname(filepath).split(path.sep)
		,project = parts[parts.length - 1]
		,buffer = path.basename(filepath,'.lua')
	
	if (nocontent)
		return next({ project:project, buffer:buffer, contents:null, file:filepath });

	fs.readFile(filepath,{encoding:'utf8'}, function(err,data) {
		if (err)
			return next(new Error('Can\'t get subject ' + project + ':' + buffer));

		next({ project:project, buffer:buffer, contents:data, file:filepath });
	});
}