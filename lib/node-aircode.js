/*
 * Codea AirCode proxy
 *
 * Copyright (c) 2014 toffer
 * Licensed under the MIT license.
 */

var RStream = require('stream').Readable
	,request = require('request')
	,cheerio = require('cheerio')
	,watcher = require('./watcher');

// Eval utils
function replaceTokens(chunk,tokens) {
	return chunk.replace(/(\$(\w+))/gi,
	function (m, t1, t2) {
		if (tokens[t2])
			return tokens[t2];
	});
}

var luaChunks = {
	saveBuffer:'\
		local chunk = [=[$chunk]=]\
		saveProjectTab("$project:$buffer",chunk)'
,	saveEvalBuffer:'\
		local chunk = [=[$chunk]=]\
		saveProjectTab("$project:$buffer",chunk)\
		$chunk'
,	removeBuffer:'\
		saveProjectTab("$project:$buffer",nil)'
,	dependency: '\
		local chunk = [=[$chunk]=]\
		saveProjectTab("$dependency:$buffer",chunk)\
		if not __psdeps__ then\
		    __psdeps__ = {}\
		    local path = os.getenv("HOME").."/Documents/"\
		    local f = io.open(path.."$project"..".codea/Info.plist","r")\
		    if (f) then\
		        local plist = f:read("*all"):gsub("[\\t\\n]","")\
		        f:close()\
		        for dep in plist:match("Dependencies</key><array>(.-)</array>"):gmatch("<string>(.-)</string>") do\
		            __psdeps__[dep] = true\
		        end\
		    end\
		end\
		if __psdeps__["$dependency"] then\
		    $chunk\
		end'
}

function aircode ()
{
	this.host = null;
	this.projects = [];
	this.runningProject = null;
}

aircode.prototype =
{

	connect: function(host,next) {
		this.host = host;
		this.listProjects(next);
	}

,	project: function(name) {
		for (var i = 0,n = this.projects.length; i < n ; i++) {
			if (this.projects[i].name == name) {
				return this.projects[i];
			}
		};
	}

	/*
	 * List available Codea's projects
	 * @callback Array/of objects/
	 * 	{}	name: string project name
	 *	 		url: string project url
	 *	 		icon: string url of the project's icon
	 */
,	listProjects: function(next) {
		var host = this.host
			,projects = this.projects;
		request(host,
			function(err,req,body) {
				if (err) {
					if (next)
						next(new Error('Unable to get project list'));
					return;
				}

				var $ = cheerio.load(body)
				var list = [];
				$('a').each(function() {
					var self = $(this)
						,name = $('.project-title',self).text()
						,url = self.attr('href')
						,icon = host + '/projects/' + name + '/icon.jpg';
					list.push({ name:name, url:url, icon:icon });
					projects.push(new Project(name,url,icon));
				});
				if (next)
					next(null,list);
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
,	openProject: function(project,next) {
		var self = this
			,url = this.host + '/projects/' + project
			,buffers = []
			,objProject = this.project(project)
			,rs = RStream({ objectMode:true }); rs._read = function() {}; // prevent the not implemented error.
		
		if (this.watcher) {
			this.watcher.updateStream(rs,project);
		}
		
		request(url,
			function(err,req,body) {
				if (err) {
					var terr = new Error('Can\'t connect to project ' + project);
					rs.emit('error',terr);
					if (next)
						next(terr);
					return
				}

				self.runningProject = project;
				
				var $ = cheerio.load(body);
				$('.tabs a:not([href="/"])').each(
					function() {
						var self = $(this)
							,name = $('li',self).text()
							,burl = url + '/' + self.attr('href');
						buffers.push({ name:name, url:burl });
						if (objProject)
							objProject.addBuffer(name,url);
					});
				
				var buf = buffers.shift();
				buf.contents = $('#editor').text();
				rs.push(buf);

				function process() {
					buf = buffers.shift();
					if (!buf) {
						rs.push(null);
						if (next)
							next(null);
						return;
					}
					self.openBuffer(project,buf.name,
						function(data) {
							if (data instanceof Error)
								rs.emit('error',new Error('Error ocurred will reading ' + project + ':' + buf.name));

							buf.contents = data;
							rs.push(buf);
							setTimeout(process,40);
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
	 * @param string content's buffer, null value is considered as a buffer deletion
	 * @param function result handler: err | true
	 */
,	updateBuffer: function(project,bufName,contents,next) {
		if (!this.project(project)) {
			if (next)
				next(new Error('Can\'t update buffer of non Codea project'));
			return 
		}

		if (!this.runningProject) {
			if (next)
				next(new Error('Can\'t update buffer without a running project'));
			return
		}

		// check for buffer deletion eval
		if (contents === null) {
			if (!this.project(project).buffer(bufName)) {
				if (next)
					next(new Error('Can\'t remove un-exists buffer'));
				return
			}

			return this.eval(
				luaChunks.removeBuffer,{ project:project,buffer:bufName },
				function(err) {
					if (err) {
						if (next)
							next('Unable to remove ' + project + ':' + buffer);
						return
					}
					this.project(project).removeBuffer(bufName);
					if (next) next();
				}.bind(this));
		}

		// check for dependency eval
		if (project != this.runningProject) {
			return this.eval(	luaChunks.dependency,
									{ dependency:project,buffer:bufName,project:this.runningProject,chunk:contents },
									next);
		}
		
		// check for new buffer eval
		if (!this.project(this.runningProject).buffer(bufName)) {
			return this.eval(	luaChunks.saveEvalBuffer,
									{ project:this.runningProject,buffer:bufName,chunk:contents },
									next);
		}

		this.__update(project,bufName,contents,next,'Fail to update ' + project + ':' + bufName);
	}

,	eval: function(chunk,tokens,next) {
		if (!this.runningProject)
			return next(new Error('Can\'t fire eval without a running project'));

		if (typeof tokens === 'function') {
			next = tokens;
			tokens = null;
		}

		if (tokens)
			chunk = replaceTokens(chunk,tokens);

		chunk+= '\n__ps__()';

		this.__update(	this.runningProject,
							this.project(this.runningProject).buffers[0].name,
							chunk, next, 'Fail to eval');
	}

,	sync: function(docsPath) {
		this.watcher = watcher(docsPath,this);
		return this.watcher
	}

	/* Internal */
,	__update: function(project,buffer,contents,next,errmsg) {
		var data = { contents:contents, file:buffer }
			,options = { url: this.host + '/projects/' + project + '/__update',
							 body: JSON.stringify(data),
							 json: true };

		request.post(options, function (err,req,body) {
			if (err || req.statusCode != 200) {
				if (next)
					next(new Error(errmsg));
				return;
			}

			if (next) next();
		});
	}

}

// Basic project object
function Project(name,url,icon) {
	this.name = name;
	this.url = url;
	this.icon = icon;
	this.buffers = [];
}

Project.prototype =
{
	buffer: function(name) {
		for (var i = 0,n = this.buffers.length; i < n ; i++) {
			if (this.buffers[i].name == name)
				return this.buffers[i];
		};
	}

,	addBuffer: function(name,url) {
		this.buffers.push({name:name, url:url})
	}

,	removeBuffer: function(name) {
		this.buffers = this.buffers.filter(function(buffer) {
			return buffer.name != name;
		});
	}
}

module.exports = new aircode()