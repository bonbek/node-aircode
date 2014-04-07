node-aircode
============

Package to handle Codea AirCode from Node.js.

**features**
- pull / push buffers
- sync local folders with projects: local files created/deleted will create/delete their corresponding project tabs
- eval code without Codea save tab
- eval and save dependencies of the running project when local file are updated (create/delete/update files)
- catch local file changes (ie:prevent AirCode update, transform buffer content, redirect update to a different project/tab...)

**notes**

The sync is done per 'session'. Local files are updated each time a projet is opened from node-aircode, during the process, local files will be overwritten by Codea's buffers, there is no versionning between local files and Codea buffers. Once a project is opened, local files take precedence on Codea buffers. So, updates done to local files when AirCode/node-aircode isn't running will be lost the next time AirCode/node-aircode will be launched.

### Installation

**from git** npm install git://github.com/tofferPika/node-aircode.git

### Api

*TODO*

### Usage

#### Server example (sync with local folder)

included in the example folder, to try it:
```
$ node example/server.js [your AirCode host] [project to open]
```

```javascript
var fs = require('fs')
	,aircode = require('../lib/node-aircode');

var host    = process.argv[2]
	,project = process.argv[3];

if (!host || !project) {
	console.log('You need to set AirCode host and a project name to start');
	process.exit();
}

// Create a Documents folder to hold projects
var docsPath = 'Documents';
try {
	fs.mkdirSync(docsPath);
} catch(e) {}

// Create AirCode proxy and sync it with the Documents folder
var proxy = aircode(host);
var documents = proxy.sync(docsPath);

// Output files changes and AirCode updates
documents
.on('fileAdded',function(subject) {
	console.log('file added:',subject.file);
})
.on('bufferAdded',function(subject) {
	console.log('↳ AirCode created',subject.project + ':' + subject.buffer);
})
.on('fileChanged',function(subject) {
	console.log('file changed:',subject.file);
})
.on('bufferChanged',function(subject) {
	console.log('↳ AirCode updated',subject.project + ':' + subject.buffer);
})
.on('fileRemoved',function(subject) {
	console.log('file removed:',subject.file);
})
.on('bufferRemoved',function(subject) {
	console.log('↳ AirCode removed',subject.project + ':' + subject.buffer);
});

// Start server and open the project
// (loop until AirCode is launched, assuming a valid host address).
console.log('Waiting connection...');
proxy.connect(function handleConnect(err,projectsList) {
	if (err) {
		setTimeout(function() {
			proxy.connect(handleConnect);
		},600)
		return;
	}

	console.log('Opening project:',project);

	proxy.openProject(project,function(err) {
		if (err)
			return console.log(err);
		console.log('→ project\'s files up to date in Documents/' + project + ', you should start coding !');
	})
	// openProject return a Stream, listen for incoming data to print some progress
	.on('data',function(buffer) {
		console.log('...',buffer.name,'recieved');
	});
});

```

### Issues

This project is in it's early state, a lot of tests must be done, mostly for the Sync mode, feel free to report any bugs. Also feedback and features requests are greatly encouraged !

Even if AirCode is an amazing tool, be carefull that it's a bit puzzling. Some tendency to delete tabs...
So watch to keep your projects safe.

### Release history

* 0.1.0 Initial release
* 0.2.0 Sync local folders, create/delete handling, dependencies eval, server example.
