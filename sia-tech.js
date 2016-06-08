var fs          = require('fs');
var util        = require('util');
var path        = require("path");
var events      = require('events');
var morgan      = require("morgan");
var compression = require('compression');

var Manage      = require('./lib/manage');
var Api         = require('./lib/api');

var zapp        = require('iris-app');
var i18n        = require('iris-i18n');
var _           = require('iris-underscore');
var zEHelper    = require('iris-express-helper');


function SiaTech() {
	var self = this;
	zapp.Application.apply(this, arguments);
	self.i18n     	= new i18n(self);
	self.api     	= new Api(self);
	/*
	self.manage     = new Manage(self);
	self.httpCombiner = new zapp.HttpCombiner(self, {
		//prefix: 'combine:',
		//debug: true,
		inlineCss: true,
		inlineScript: true,
		folders: [
			self.appFolder+'/http/',
			self.appFolder+'/http/css/',
			self.appFolder+'/http/scripts/',
			self.appFolder+'/lib/manage/resources/'
		]
	});
	*/

	self.on('init::express', function() {

		self.app.disable('x-powered-by');
		self.app.use(function(req, res, next) {
			res.setHeader("X-Powered-By", "SiaTech");
			next();			
		})
		self.app.use(zEHelper(self, {}));
		self.i18n.initHttp(self.app);
		self.api.initHttp(self.app);
		/*
		self.manage.initHttp(self.app);
		self.httpCombiner.initHttp(self.app);
		*/

		self.app.locals._ = _;
		self.app.locals.activePage = "home";

		self.traceHttp = false;
		var logger = morgan('dev');

		self.app.use(function(req, res, next) {
			if(self.traceHttp)
				return logger(req, res, next);
			next();
		});

		var viewPath = path.join(self.appFolder,'/views/');
		digestViewDirectory(viewPath);

		function digestViewDirectory(viewPath, folderName){
			folderName = folderName || "";
			var list = fs.readdirSync(viewPath);
			_.each(list, function(_file, a) {

				var file = _file.split('.').shift();
				if(file == 'partial' || _file[0] == ".")
					return;

				var filePath = path.join(viewPath, '/' + file);
				if ( fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory() )
					return digestViewDirectory(filePath, file);

				var pathHook = file == "index" ? "/": "/" + file;

				self.app.get(pathHook, function(req, res, next) {
					res.render(file, {req: req, activePage: file});
				});
				if(file.indexOf("about-") === 0){
					self.app.get("/"+file.replace(/\-/g, "/"), function(req, res, next) {
						res.render(file, {req: req, activePage: file});
					});
				}
			});
		}

		self.app.use(compression());
	});

	self.on("init::express::done", function(){
		self.app.use('*', function(req, res, next) {
			res.status(404).render('error', {
				heading: req._T("Page Not Found"),
				message: req._T("The requested URL was not found on this server.")
			});
		});

		self.app.use(function(err, req, res, next) {
			console.error((err instanceof Error) ? err.stack : err);
			res.status(500).render('error', {
				message: req._T("Site under maintenance, please check back later.")
			});
		});
	});
}



util.inherits(SiaTech, zapp.Application);
new SiaTech(__dirname);

