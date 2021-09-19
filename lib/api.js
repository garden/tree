// /api endpoint and authentication.

var log = require('./log');
var fs = require('./fs');
var pg = require('pg');
var configuration = require('./conf');
var pgConfig = configuration.pg;
pgConfig.pg = pg;
var EmailLogin = require('email-login');
var emailLogin = new EmailLogin({
  db: new EmailLogin.PgDb(pgConfig),
  mailer: configuration.mailer,
});
var website = configuration.website;

exports.main = function (camp) {
  camp.post('/api/1/signup', signup);
  camp.post('/api/1/signin', signin);
  camp.path('/api/1/login', login);
  camp.path('/api/1/logback', logback);
  camp.post('/api/1/logout', logout);
  camp.get('/~', home);
  camp.handle(authenticate);
};

function error(code, msg, err, res) {
  if (err) { log.error(err); }
  res.statusCode = code || 500;
  res.json({errors: [msg || 'Internal Server Error']});
}

// The following should be considered a valid name: 0ééλ統𝌆
// Names are normalized in NFC.
var allowedUsernames = /^[\w\xa0-\u1fff\u2c00-\u2dff\u2e80-\ud7ff\uf900-\uffef\u{10000}-\u{2fa1f}]{1,20}$/u;
var reservedNames = /^(file|block|snap|root|lib|api|test|app|about|demo|doc|\w|\w\w)$/;

function allowedUsername(name) {
  if (!allowedUsernames.test(name) || reservedNames.test(name)) {
    return Promise.resolve(false);
  }
  return fs.meta('/' + name).then(function(meta) {
    return meta === undefined;
  });
}

function normalizeNFC(name) {
  if (typeof name === 'string') { return name.normalize(); }
}

function signup(req, res) {
  var email = req.data.email;
  var name = normalizeNFC(req.data.name);
  log(`Signup requested from ${email} for ${name}.`);
  allowedUsername(name).then(function(allowed) {
    if (!allowed) {
      error(400, "Disallowed name", null, res);
      return;
    }
    log(`Sending signin email confirmation for ${email}.`);
    emailConfirmation(req, res, {
      email: email,
      name: name,
      subject: 'TheFileTree account creation: confirm your email address',
      confirmUrl: function(tok) {
        return website + "/api/1/login?token=" + encodeURIComponent(tok) +
          '&name=' + encodeURIComponent(name);
      },
    }, function(err) {
      if (err != null) { error(500, "Failed to send email", err, res); return; }
      log(`Signin mail confirmation sent to ${email}.`);
      res.end();
    });
  });
}

// Prepare logging back in.
function signin(req, res) {
  var email = req.data.email;
  log(`Sending signin email confirmation for ${email}.`);
  emailConfirmation(req, res, {
    email: email,
    subject: 'TheFileTree account log in: confirm your email address',
    confirmUrl: function(tok) {
      return website + "/api/1/logback?token=" + encodeURIComponent(tok);
    },
  }, function(err) {
    if (err != null) { error(500, "Failed to send email", err, res); return; }
    log(`Signin mail confirmation sent to ${email}.`);
    res.end();
  });
}

// options:
// - email: address to send the email to.
// - name: (optional) name of the user to create.
// - subject: content of the email's subject line.
// - confirmUrl: function(token: String) returns the confirmation link URL.
// callback: run when the email is sent.
function emailConfirmation(req, res, options = {}, callback) {
  var email = options.email;
  var name = normalizeNFC(options.name);
  if (!email) { error(400, "Empty email", null, res); }
  emailLogin.login(function(err, token, session) {
    if (err != null) { error(500, "Sign up failed", err, res); return; }
    req.cookies.set('token', token);
    emailLogin.proveEmail({
      token: token,
      email: email,
      name: options.subject || 'TheFileTree',
      confirmUrl: options.confirmUrl,
    }, function(err) {
      if (err != null) {
        error(500, "Sending the email confirmation failed", err, res);
        return;
      }
      callback();
    });
  });
}

function login(req, res) {
  var name = normalizeNFC(req.data.name);
  emailLogin.confirmEmail(req.cookies.get('token'), req.data.token,
  function(err, token, session) {
    if (err != null) {
      log.error(err);
      res.redirect('/app/account/email-not-confirmed.html');
      return;
    }
    if (token) {
      var home = '/' + name;
      fs.create(home, { type: 'folder' })
      .then(function() { return fs.meta(home); })
      .then(function(meta) {
        meta.acl = {};
        meta.acl[name] = 'x';
        meta.acl['*'] = '-';
        return fs.updateMeta(home, meta);
      }).then(function() {
        emailLogin.setAccountData(session.email, {name: name}, function(err) {
          if (err != null) { error(500, "Login failed", err, res); return; }
          req.cookies.set('token', token);
          res.redirect('/app/account/logged-in.html');
        });
      }).catch(function(err) {
        error(400, "Failed to create your home folder, " + name, err, res);
      });
    } else {
      res.redirect('/app/account/email-not-confirmed.html');
    }
  });
}

function logback(req, res) {
  emailLogin.confirmEmail(req.cookies.get('token'), req.data.token,
  function(err, token, session) {
    if (err != null) {
      log.error(err);
      res.redirect('/app/account/email-not-confirmed.html');
      return;
    }
    if (token) {
      req.cookies.set('token', token);
      res.redirect('/app/account/logged-back.html');
    } else {
      res.redirect('/app/account/email-not-confirmed.html');
    }
  });
}

function logout(req, res) {
  var token = req.cookies.get('token');
  req.cookies.set('token');
  res.redirect('/app/account/');
  // Clearing database information is not safety-critical.
  emailLogin.logout(token, function(err) {
    if (err) { log.error(err); }
  });
}

function home(req, res) {
  if (req.user && (typeof req.user.name === 'string')) {
    res.redirect('/' + req.user.name.normalize());
  } else { res.redirect('/'); }
}

function authenticate(req, res, next) {
  if (res) {
    if (configuration.http.cors && configuration.http.cors.origin) {
      res.setHeader('Access-Control-Allow-Origin',
        configuration.http.cors.origin);
    }
  }
  req.env = {timer: {}};

  var timerStart = process.hrtime();
  var authToken = req.cookies.get('token');
  emailLogin.authenticate(authToken,
  function(err, authenticated, session, token) {
    if (token) { req.cookies.set('token', token); }
    if (authenticated && session.emailVerified()) {
      var name = normalizeNFC(session.account.data.name);
      fs.meta('/' + name).then(function(userMeta) {
        try {
          var decodedToken = EmailLogin.decodeToken(authToken); // {id, token}
        } catch(e) { log.error(e); }
        var timerEnd = process.hrtime(timerStart);
        req.env.timer.auth = timerEnd[0] / 1e3 + timerEnd[1] / 1e6;
        req.user = {
          email: session.email,
          name: name,
          meta: userMeta,
          secret: new Buffer(decodedToken.token, 'base64'),
        };
        next();
      }).catch(function(e) {
        error(500, 'Failed to read user metadata', e, res);
      })
    } else { next(); }
  });
}
exports.authenticate = authenticate;
