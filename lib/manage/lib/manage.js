var ManageBase = require("./manage-base");
var CloudFlare = require("cloudflare");
var zutils = require('iris-utils');
var _ = require('iris-underscore');
var util = require('util');
var UUID = require('node-uuid');
var path = require('path');
var fs = require('fs');

function Manage(core) {
    var self = this;
    ManageBase.call(this, core);

    self.purgeImageCache = function(file) {
        if(!self.cf)
            return;
        console.log("Purging CF Cache for:",url);
        self.cf.zoneFilePurge('scalingbitcoin.org', url, function() { })
    }
    self.getPapersPdfPath = function(name){
        return path.join(core.appFolder,'data/papers/'+name);
    }

    self.on('init-http', function(app) {
        if(core.config.cloudflare) {
            console.log("Creating CloudFlare Interface");
            self.cf = CloudFlare.createClient({
                email : core.config.cloudflare.email,
                token : core.config.cloudflare.token
            })
        }
        /*
        app.get('/hello', function(req, res, next){
            res.json({hello:"World"})
        })
        */
        app.post('/manage/file', function (req, res, next) {
            function buildPath(fields, files){
                //var pid = fields.pid[0];
                var name = files.file[0].originalFilename.replace(/ /g, '-');
                console.log("fields".greenBG, fields, name)
                return self.getPapersPdfPath(name);
            }
            self.uploadFile({req: req, buildPath: buildPath}, function(err, result){
                if (err)
                    return self.sendResponce(res, err);

                self.sendResponce(res, null, {success:true, message: "File Upload Complete"});
                var name = result.file.split('/').pop();
                self.webSockets.emit('message', { op : 'file-inserted', data: {name:name, pdf: name, uuid: UUID.v1()} });

                /*
                var fields = result.fields;
                var id = fields.id[0];
                var pid = fields.pid[0];

                var logo = self.getThumbImagePath(pid+'-logo')

                thumbTool.resizeImage({
                    sourcePath: result.file,
                    destPath: logo,
                    width: core.config.logo.width
                }, function(err){
                    if(err)
                        return sendResponce(res, err);

                    self.saveLogoIntoDb({id: ObjectID(id), file: logo}, function(err, success){
                        if(err)
                            return sendResponce(res, err);

                        self.purgeImageCache(logo);

                        sendResponce(res, null, {success:true, message: "File Upload Complete"});
                    });
                });
                */
            });
        });

    });

    self.on('get-app-data', function(args, callback) {
        callback(null, {
            uuid : core.uuid, 
            name : core.pkg.name,
            monitor : core.config.monitor
        })
    });

    self.on('trace-http', function(args, callback) {
        core.traceHttp = !core.traceHttp;
        console.log('HTTP Logging',core.traceHttp?'ON'.green.bold:'OFF'.magenta.bold);
        callback(null, 'Done');
    })

    self.on('update-twitter', function(args, callback) {
        console.log("Updating twitter (manual)");
        core.twitter.update(function() {
            console.log("Twitter updated");
        }, true)
        callback(null, 'Done');
    })

    self.on('cf-reset', function(args, callback) {
        if(!self.cf)
            return callback("No CloudFlare");

        console.log("Clearing CF Cache...");
        self.cf.clearCache('scalingbitcoin.org', function() {
            console.log("CF Cache Cleared...");
            callback(null,"CF Cache Cleared...");
        })
    })

    self.on('git-pull', function(args, callback){
        //console.log(args.op.greenBG, args, process.execPath)

        var logger = new zutils.Logger({ filename: core.appFolder + '/logs/git_pull.log' });
        var gitPullRequest = new zutils.Process({
            process: '/usr/bin/git',
            args: [ 'pull' ],
            descr: 'git-pull',
            restart: false,
            logger: logger
        });
        var write = logger.write;
        var data = '';
        logger.write = function(text){
            write.call(logger, text);
            data += text;
        }
        gitPullRequest.run();
        gitPullRequest.relaunch = false;
        gitPullRequest.process.on('exit',function (code) {
            //console.log("data:".greenBG, code, data)
            delete logger;
            if (code != 0)
                return callback({error: 'Please try again.', data: data})

            callback(null, data);
        });
    });

    self.buildItem = function(cNameOrC, item, callback){
         delete item._id;
         if (cNameOrC == 'papers') {
            //if(_.isArray(item.authors))
                //item.authors = item.authors.join(',');
            if (item.date) {
                var date = new Date(item.date);
                //console.log("date".greenBG, item.date, ":::", date, "::", date.format('d/m/Y'), date.getMonth(), date.getDate(), date.getYear())
                item.date = date.format('Y-m-d');
            };
         };
         callback();
    }

    self.defineFetchDataHandler(self, 'papers', 'papers');
    self.defineFetchDataHandler(self, 'attendees', 'attendees');

    self.on('files', function(args, callback){
        self.readDir(path.join(core.appFolder, 'data/papers'), function(scanPath, relative) {
            if (!relative || !relative.length) return false;
            if (relative.charAt(0) == '.') return false;
            if (fs.statSync(scanPath + '/' + relative).isDirectory())
                return false;
            var ext = relative.split('.').pop();
            //if ('PDF' == ext.toUpperCase())
                return true;
            //return false;
        }, function(err, files){
            if (err)
                return callback(err);
            var list = [];
            _.each(files, function(file){
                list.push({
                    name: file.split('/').pop(),
                    file: file.split('/').pop(),
                    uuid: UUID.v1()
                })
            })
            callback(null, { records : list, count : list.length, isFiltered: false/*!_.isEmpty(query)*/});
        });
    });

    self.on('remove-file', function(args, callback){
        var _path = path.join(core.appFolder, 'data/papers/'+args.name);

        if(!fs.existsSync(_path))
            return callback({error: "No such file"})
        if (fs.statSync(_path).isDirectory())
            return callback({error: "Sorry you can't remove directory."});

        fs.unlink(_path, function(err){
            if (err){
                console.error("remove-file:fail", err)
                return callback({error: "Unable to remove file."})
            }
            callback(null, true);
            self.webSockets.emit('message', { op : 'file-removed', uuid: args.uuid });
            self.syncApp({action:'file-removed', uuid: args.uuid});
        });
    })

    self.insertPaper = function(data, callback){
        if (!data.uuid)
            data.uuid = UUID.v1();
        core.db.papers.insert(data, function(err, records){
            if (err)
                return callback(err);

            var record = records.pop? records.pop(): records.ops.pop();

            if (!record)
                return callback({error: 'Unable to save. Please try again.'});
            //if(_.isArray(record.authors))
                //record.authors = record.authors.join(',');

            callback(null, record);
            self.webSockets.emit('message', { op : 'paper-inserted', data: record });
            self.syncApp({action:'paper-inserted', data: record});
        });
    }

    self.updatePaper = function(uuid, data, callback){
        core.db.papers.update({uuid: uuid}, {$set: data}, function(err, result){
            if (err)
                return callback(err);

            callback(null, {uuid: uuid});
            data.uuid = uuid;
            //if(_.isArray(data.authors))
                //data.authors = data.authors.join(',');
            self.webSockets.emit('message', { op : 'paper-updated', data: data });
            self.syncApp({action:'paper-updated', data: data});
        });
    }

    self.on('save-paper', function(args, callback){
        var d = {}, data = args.data;

        _.each([
            'title',
            'url',
            'info',
            'i',
            'authors',
            'date'
            ], function(n) {
            if(data[n])
                d[n] = data[n];
        });

        d.active        = !!data.active;
        d.relevant      = !!data.relevant;
        d.submission     = !!data.submission;

        if(_.isString(d.authors))
            d.authors = d.authors.split(',');

        if (data.uuid && data.uuid.length) {
            self.updatePaper(data.uuid, d, callback);
        }else{
            self.insertPaper(d, callback);
        }
    });


    self.insertAttendee = function(data, callback){
        if (!data.uuid)
            data.uuid = UUID.v1();

        core.db.attendees.insert(data, function(err, records){
            if (err)
                return callback(err);

            var record = records.pop? records.pop(): records.ops.pop();

            if (!record)
                return callback({error: 'Unable to save. Please try again.'});

            callback(null, record);
            self.webSockets.emit('message', { op : 'attendee-inserted', data: record });
            self.syncApp({action:'attendee-inserted', data: record});
        });
    }

    self.updateAttendee = function(uuid, data, callback){
        core.db.attendees.update({uuid: uuid}, {$set: data}, function(err, result){
            if (err)
                return callback(err);

            callback(null, {uuid: uuid});
            data.uuid = uuid;

            self.webSockets.emit('message', { op : 'attendee-updated', data: data });
            self.syncApp({action:'attendee-updated', data: data});
        });
    }

    self.on('save-attendee', function(args, callback){
        var d = {}, data = args.data;

        _.each([
            'email'
            ], function(n) {
            if(data[n])
                d[n] = data[n];
        });

        d.active        = !!data.active;
        d.sent          = !!data.sent;
       // d.answer     = !!data.answer;

        if (data.uuid && data.uuid.length) {
            self.updateAttendee(data.uuid, d, callback);
        }else{
            self.insertAttendee(d, function (err, record) {
                if (err)
                    return callback(err);

                callback(null, record);

                if (data.sendEmail) {
                    core.rsvp.sendEmail({uuid: record.uuid}, function (err, info) {
                        console.log("rsvp.sendEmail:", err, info)
                    });
                };

            });
        }
    });

}
util.inherits(Manage, ManageBase);

module.exports = Manage;
