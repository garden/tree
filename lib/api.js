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
var website = "http://127.0.0.1:1234";

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

function signup(req, res) {
  var email = req.data.email;
  var name = req.data.name;
  allowedUsername(name).then(function(allowed) {
    if (!allowed) {
      error(400, "Disallowed name", null, res);
      return;
    }
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
      res.end();
    });
  });
}

// Prepare logging back in.
function signin(req, res) {
  var email = req.data.email;
  emailConfirmation(req, res, {
    email: email,
    subject: 'TheFileTree account log in: confirm your email address',
    confirmUrl: function(tok) {
      return website + "/api/1/logback?token=" + encodeURIComponent(tok);
    },
  }, function(err) {
    if (err != null) { error(500, "Failed to send email", err, res); return; }
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
  var name = options.name;
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
  var name = req.data.name;
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
    res.redirect('/' + req.user.name);
  } else { res.redirect('/'); }
}

function authenticate(req, res, next) {
  emailLogin.authenticate(req.cookies.get('token'),
  function(err, authenticated, session, token) {
    if (token) { req.cookies.set('token', token); }
    if (authenticated && session.emailVerified()) {
      req.user = {
        email: session.email,
        name: session.account.data.name,
      };
    }
    next();
  });
}
exports.authenticate = authenticate;
