node-aircode
============

Package to handle Codea AirCode from Node.js.

## Installation

from git: npm install git://github.com/tofferPika/node-aircode.git

## Usage example

	var aircode = require('aircode');
	var host = 'http://192.168.1.12:42000'; // AirCode host
	var proxy = aircode(host);
	
	// *List available projects
	proxy.listProjects(function(projectList) {
			console.log(projectList); // array of { name:"project's name", url:"project's url", icon:"project's icon url" }
			
			// *'Open' the first project of the list, the project will be run and
			// all it's buffers would pass throught the returned stream
			var project = projectList[0]
				,buffers = [];
			proxy.openProject(project)
			.on('data',function(data) {
					console.log(data); // buffer data: { name:"buffer's name", url:"buffer's url", content:"buffer's contents" }
					buffers.push(data);
				})
			.on('end', function() {
					console.log('all buffers recieved');

					// *Update the first buffer
					var buffer = buffer[0];
					var chunk = buffer.content + '\nprint("Hello from Node.js")';
					proxy.updateBuffer('AProject','Main',chunk);
				});
		});

## Release History

* 0.1.0 Initial release