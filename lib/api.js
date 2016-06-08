var _ 		= require('underscore');

function API(core){
	var self = this;

	self.renderFile = function (view, options, callback) {
		core.app.render(view, options, function(err, str){
			callback(err, str)
		})
	}

	self.initHttp = function(app){

		/*
		app.get('/about', function(req, res, next){
			var url = req.protocol +"://"+req.get('host');
			res.render("email/about", {req: req, baseUrl: url})
		})
		*/

		app.post('/about', function(req, res, next){
			var data = req.body;
			if (!data.fromName)
				return res.json({error: req._T("Name is required.")})
			if (!data.fromEmail)
				return res.json({error: req._T("Email is required.")})
			if (!data.message || !data.message.message)
				return res.json({error: req._T("Message is required.")})

			_.extend(data, {
				email: data.fromEmail,
				name: data.fromName
			})

			var config = core.config.getInTouch;
			var baseUrl = config.baseUrl || req.protocol +"://"+req.get('host');
			self.renderFile("email/about", {data: data, baseUrl: baseUrl}, function(err, html){
				if (err)
					return res.json({error: req._T("Server Error: Please try later")});

				var mailOptions = {
					from: config.from,
					to: config.to,
					replyTo: data.email,
					subject: config.subject.replace('{name}', data.name),
					text: config.text.replace(/\{name\}/g, data.name).replace(/\{email\}/g, data.email).replace(/\{message\}/g, data.message.message), 
					html: html
				};

				core.mailer.sendMail(mailOptions, function(err, info){
					if(err)
						return res.json({error: req._T("Server Error: Please try later")});

					res.json({success: true});
				});
			})
		});
	}
}

module.exports = API;