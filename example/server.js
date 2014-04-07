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
