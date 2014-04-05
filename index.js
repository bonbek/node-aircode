/*
 * Codea AirCode proxy
 *
 * Copyright (c) 2014 toffer
 * Licensed under the MIT license.
 */

var RStream = require('stream').Readable
	,request = require('request')
	,cheerio = require('cheerio');

function aircode (host)
{
	this.host = host;
	this.runningProject = null; // project that Codea is currently running
}

aircode.prototype =
{
	/*
	 * List available Codea's projects
	 * @callback Array/of objects/
	 * 	{}	name: string project name
	 *	 		url: string project url
	 *	 		icon: string url of the project's icon
	 */
	listProjects: function(next) {
		var host = this.host;
		request(host,
			function(err,req,body) {
				if (err)
					next(new Error('Unable to get project list'));

				var $ = cheerio.load(body)
					,list = [];

				$('a').each(function() {
					var self = $(this)
						,name = $('.project-title',self).text()
						,url = self.attr('href')
						,icon = host + '/projects/' + name + '/icon.jpg';
					list.push({ name:name, url:url, icon:icon });
				});

				next(list);
			});
	}

	/*
	 * Open a project (Codea AirCode will run it)
	 * @param string project name
	 * @return stream in objecMode
	 * pipe data: buffers list
	 * {}	name srting buffer name (tab)
	 *		url string buffer url
	 *		content string buffer content
	 */
,	openProject: function(project) {
		var self = this
			,url = this.host + '/projects/' + project
			,buffers = []
			,rs = RStream({ objectMode:true }); rs._read = function() {}; // prevent the not implemented error.
		request(url,
			function(err,req,body) {
				if (err)
					return rs.emit('error',new Error('Can\'t connect to project ' + project));

				self.runningProject = project;
				
				var $ = cheerio.load(body);
				$('.tabs a:not([href="/"])').each(
					function() {
						var self = $(this)
							,name = $('li',self).text()
							,burl = url + '/' + self.attr('href');
						buffers.push({ name:name, url:burl });
					});
				
				var buf = buffers.shift();
				buf.content = $('#editor').text();
				rs.push(buf);

				function process() {
					buf = buffers.shift();
					if (!buf)
						return rs.push(null);
					self.openBuffer(project,buf.name,
						function(data) {
							if (data instanceof Error)
								rs.emit('error',new Error('Error ocurred will reading ' + project + ':' + buf.name));

							buf.content = data;
							rs.push(buf);
							setTimeout(process,80);
						});
				};
				setTimeout(process,200);
			});
		return rs;
	}

	/*
	 * Restart a project if opened, if not run it
	 * @param string project name
	 * @param function result handler: err | true
	 */
,	restartProject: function(project,next) {
		var self = this;
		request(this.host + '/projects/' + project + '/__restart',
			function(err,req,body) {
				if (err || req.statusCode != 404) {
					if (next)
						next(new Error('Fail to restart ' + project));
				}

				self.runningProject = project;
				if (next)
					next(true);
			});
	}

	/*
	 * 'Open' a buffer (tab), Codea AirCode will run the project if not already
	 * @param string project name
	 * @param string buffer (tab) name
	 * @param function result handler: err | string content of the buffer
	 */
,	openBuffer: function(project,bufName,next) {
		var self = this;
		request(this.host + '/projects/' + project + '/' + bufName,
			function(err,req,body) {
				if (err)
					return next(new Error('Can\'t open ' + project + ':' + bufName + ' buffer.'));
				
				self.runningProject = project;
				if (next) {
					$ = cheerio.load(body);
					next($('#editor').text());
				}
			});
	}

	/*
	 * Update a buffer AirCode will run the project if not already
	 * @param string project name
	 * @param string buffer (tab) name
	 * @param string content's buffer
	 * @param function result handler: err | true
	 */
,	updateBuffer: function(project,bufName,content,next) {
		var self = this
			,data = { contents:content, file:bufName };
		options = {
			url: this.host + '/projects/' + project + '/__update',
			body: JSON.stringify(data),
			json: true
		}
		request.post(options,
			function (err,req,body) {
				if (err || req.statusCode != 200) {
					if (next)
						next(new Error('Fail to update ' + project + ':' + bufName));
					return;
				}
				
				self.runningProject = project;
				if (next)
					next(true);
			});
	}
}


module.exports = function(host) {
	if (!host)
		throw new Error('You must provide AirCode host');

	return new aircode(host);
}

var host    = process.argv[2]
	,command = process.argv[3];

if (host) {
	var proxy = new aircode(host);
	if (command)
		proxy[command].apply(proxy,process.argv.slice(4));
}