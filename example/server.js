var host    = process.argv[2]
	,project = process.argv[3];

if (!host || !project) {
	console.log('You need to set AirCode host and a project name to start');
	process.exit();
}

var fs = require('fs')
	,aircode = require('../lib/node-aircode');

// Create a Documents folder to hold projects
var docsPath = 'Documents';
try {
	fs.mkdirSync(docsPath);
} catch(e) {}

// Sync AirCode proxy the Documents folder
var documents = aircode.sync(docsPath);

// Output files changes / AirCode updates
// and listen for special eval.lua file which serve us for eval only
documents
.on('fileAdded',function(subject) {
	console.log('file added:',subject.file);
	if (subject.buffer == 'eval') {
		// prevent default behavior (Codea would Create new tab called eval)
		subject.preventDefault = true;
		// manualy fire eval only (no save)
		aircode.eval(subject.contents,function(err) {
			console.log(err ? err : 'Eval success');
		});
	}
})
.on('bufferAdded',function(subject,err) {
	console.log(err ? '! AirCode error' : '↳ AirCode created',subject.project + ':' + subject.buffer);
})
.on('fileChanged',function(subject) {
	console.log('file changed:',subject.file);
	if (subject.buffer == 'eval') {
		// prevent default behavior (Codea would save the tab)
		subject.preventDefault = true;
		// manualy fire eval only (no save)
		aircode.eval(subject.contents,function(err) {
			console.log(err ? err : 'Eval success');
		});
	}
})
.on('bufferChanged',function(subject,err) {
	console.log(err ? '! AirCode error' : '↳ AirCode updated',subject.project + ':' + subject.buffer);
})
.on('fileRemoved',function(subject) {
	console.log('file removed:',subject.file);
})
.on('bufferRemoved',function(subject,err) {
	console.log(err ? '! AirCode error' : '↳ AirCode removed',subject.project + ':' + subject.buffer);
});

// Start server and open the project
// (loop until AirCode is launched, assuming a valid host address).
console.log('Waiting connection...');
aircode.connect(host,function handleConnect(err,projectsList) {
	if (err) {
		setTimeout(function() {
			aircode.connect(handleConnect);
		},600)
		return;
	}

	console.log('Opening project:',project);

	aircode.openProject(project,function(err) {
		if (err)
			return console.log(err);
		console.log('→ project\'s files up to date in Documents/' + project + ', you should start coding !');
	})
	// openProject return a Stream, listen for incoming data to print some progress
	.on('data',function(buffer) {
		console.log('...',buffer.name,'recieved');
	});
});
